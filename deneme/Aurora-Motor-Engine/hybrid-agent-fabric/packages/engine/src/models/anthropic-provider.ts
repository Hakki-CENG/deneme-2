import { randomUUID } from "node:crypto";
import type { AgentMessage, JsonValue, ModelProvider, ModelRequest, ModelStreamEvent, ToolCallContent } from "../types.js";
import { modelHttpError, ModelProviderError } from "./model-provider-error.js";
import { parseSseJson } from "./sse.js";
import { resolveWorkspaceImage } from "./multimodal.js";
import { modelNameOr } from "./model-route.js";

export interface AnthropicProviderOptions {
  id?: string;
  baseUrl?: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  anthropicVersion?: string;
  headers?: Record<string, string>;
}

async function messageBlocks(message: AgentMessage, workspacePath?: string): Promise<any[]> {
  const blocks: any[] = [];
  for (const part of message.content) {
    if (part.type === "text") blocks.push({ type: "text", text: part.text });
    else if (part.type === "image") {
      const image = await resolveWorkspaceImage(part, workspacePath);
      blocks.push({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } });
    } else if (part.type === "tool_call") {
      blocks.push({ type: "tool_use", id: part.id, name: part.name.replaceAll(".", "__"), input: part.arguments });
    } else if (part.type === "tool_result") {
      blocks.push({ type: "tool_result", tool_use_id: part.toolCallId, content: JSON.stringify(part.result), is_error: part.isError });
    }
  }
  return blocks;
}

export class AnthropicProvider implements ModelProvider {
  readonly id: string;
  constructor(private readonly options: AnthropicProviderOptions) {
    this.id = options.id ?? "anthropic";
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const messages: any[] = [];
    for (const message of request.messages) {
      if (message.role === "system") continue;
      const role = message.role === "assistant" ? "assistant" : "user";
      const blocks = await messageBlocks(message, request.workspacePath);
      const previous = messages.at(-1);
      if (previous?.role === role) previous.content.push(...blocks);
      else messages.push({ role, content: blocks });
    }
    // Explicit prompt-cache breakpoints (Hermes-style plan): one at the end of
    // the system block, one on the last tool, and one on each of the last N
    // non-system messages. Markers ride only on text blocks; an assistant
    // turn that is pure tool calls gets no marker rather than a malformed one.
    const cache = request.promptCache;
    const payload: Record<string, unknown> = {
      model: modelNameOr(request.model, this.options.model),
      max_tokens: this.options.maxTokens ?? 8192,
      // Real streaming. Without this the API returns one JSON body and the
      // caller sees nothing until the whole completion is finished.
      stream: true,
      messages,
      tools: request.tools.map((tool) => ({
        name: tool.id.replaceAll(".", "__"),
        description: `${tool.description} [capability-id: ${tool.id}]`,
        input_schema: tool.inputSchema,
      })),
    };
    if (cache && cache.ttlMs > 0) {
      if (cache.systemBreakpoint) {
        payload.system = [{ type: "text", text: request.systemPrompt, cache_control: { type: "ephemeral", ttl: `${Math.round(cache.ttlMs / 60_000)}m` } }];
      } else {
        payload.system = request.systemPrompt;
      }
      if (cache.toolBreakpoint && Array.isArray(payload.tools) && (payload.tools as unknown[]).length > 0) {
        const tools = payload.tools as any[];
        tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: "ephemeral", ttl: `${Math.round(cache.ttlMs / 60_000)}m` } };
      }
      if (cache.messageTailMarkers > 0) {
        const tailStart = Math.max(0, messages.length - cache.messageTailMarkers);
        for (let index = tailStart; index < messages.length; index++) {
          const message = messages[index] as any;
          const blocks = message?.content;
          if (!Array.isArray(blocks)) continue;
          const textIndex = blocks.map((block: any) => block.type).lastIndexOf("text");
          if (textIndex < 0) continue;
          blocks[textIndex] = { ...blocks[textIndex], cache_control: { type: "ephemeral", ttl: `${Math.round(cache.ttlMs / 60_000)}m` } };
        }
      }
    }
    const response = await fetch(`${(this.options.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        "x-api-key": this.options.apiKey,
        "anthropic-version": this.options.anthropicVersion ?? "2023-06-01",
        ...this.options.headers,
      },
      body: JSON.stringify(payload),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (!response.ok) throw await modelHttpError(this.id, response);
    if (!response.body) throw new ModelProviderError("Anthropic returned no response body.", { providerId: this.id, code: "empty_body", retryable: true });

    // Anthropic streams a sequence of typed frames. Text arrives as
    // `content_block_delta`; a tool call arrives as a `content_block_start`
    // naming the tool followed by `input_json_delta` fragments that have to be
    // concatenated before the arguments can be parsed. Per-block state is
    // keyed by the frame's `index`, because blocks can interleave.
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const blocks = new Map<number, { kind: "text" | "tool"; id?: string; name?: string; json: string }>();
    let toolUse = false;
    let stopReason: "end_turn" | "tool_use" | "max_tokens" = "end_turn";

    for await (const raw of parseSseJson(response.body, { providerId: this.id, signal: request.signal })) {
      const event = raw as any;
      switch (event.type) {
        case "message_start": {
          const messageUsage = event.message?.usage ?? {};
          usage.inputTokens = messageUsage.input_tokens ?? 0;
          usage.cacheReadTokens = messageUsage.cache_read_input_tokens ?? 0;
          usage.cacheWriteTokens = messageUsage.cache_creation_input_tokens ?? 0;
          break;
        }
        case "content_block_start": {
          const index = Number(event.index ?? 0);
          const block = event.content_block ?? {};
          if (block.type === "tool_use") {
            toolUse = true;
            blocks.set(index, { kind: "tool", id: block.id, name: block.name, json: "" });
          } else {
            blocks.set(index, { kind: "text", json: "" });
            if (typeof block.text === "string" && block.text) yield { type: "text_delta", delta: block.text };
          }
          break;
        }
        case "content_block_delta": {
          const index = Number(event.index ?? 0);
          const delta = event.delta ?? {};
          if (delta.type === "text_delta" && typeof delta.text === "string") {
            yield { type: "text_delta", delta: delta.text };
          } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
            const block = blocks.get(index);
            if (block) block.json += delta.partial_json;
          }
          break;
        }
        case "content_block_stop": {
          const index = Number(event.index ?? 0);
          const block = blocks.get(index);
          blocks.delete(index);
          if (block?.kind !== "tool") break;
          let args: Record<string, JsonValue> = {};
          if (block.json.trim()) {
            try {
              const parsed: unknown = JSON.parse(block.json);
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, JsonValue>;
            } catch {
              // Truncated arguments: surface an empty object rather than
              // dropping the call, so the model can see it was attempted.
            }
          }
          const call: ToolCallContent = {
            type: "tool_call",
            id: block.id ?? randomUUID(),
            name: String(block.name ?? "unknown").replaceAll("__", "."),
            arguments: args,
          };
          yield { type: "tool_call", call };
          break;
        }
        case "message_delta": {
          const delta = event.delta ?? {};
          if (delta.stop_reason === "tool_use") stopReason = "tool_use";
          else if (delta.stop_reason === "max_tokens") stopReason = "max_tokens";
          else if (delta.stop_reason === "end_turn") stopReason = "end_turn";
          usage.outputTokens = event.usage?.output_tokens ?? usage.outputTokens;
          break;
        }
        default:
          // ping, message_stop and anything unrecognised carry nothing to act on.
          break;
      }
    }

    yield { type: "usage", usage };
    yield { type: "done", stopReason: toolUse ? "tool_use" : stopReason };
  }
}
