import type { AgentMessage, ModelProvider, ModelRequest, ModelStreamEvent } from "../types.js";
import { modelHttpError } from "./model-provider-error.js";
import { openAiResponsesStream } from "./openai-responses-stream.js";
import { resolveWorkspaceImage } from "./multimodal.js";
import { modelNameOr } from "./model-route.js";

export interface OpenAIResponsesProviderOptions {
  id?: string;
  baseUrl?: string;
  apiKey: string;
  model: string;
  maxOutputTokens?: number;
  headers?: Record<string, string>;
}

function selectedModel(request: ModelRequest, fallback: string): string {
  return modelNameOr(request.model, fallback);
}

export async function openAIResponsesInputItems(messages: AgentMessage[], workspacePath?: string): Promise<any[]> {
  const input: any[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      const text = message.content.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n");
      const content: any[] = text ? [{ type: "input_text", text }] : [];
      for (const part of message.content) {
        if (part.type !== "image") continue;
        const image = await resolveWorkspaceImage(part, workspacePath);
        content.push({ type: "input_image", image_url: `data:${image.mimeType};base64,${image.base64}` });
      }
      if (content.length) input.push({ role: "user", content });
      continue;
    }
    if (message.role === "assistant") {
      const text = message.content.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n");
      if (text) input.push({ role: "assistant", content: [{ type: "output_text", text }] });
      for (const part of message.content) {
        if (part.type === "tool_call") {
          input.push({
            type: "function_call",
            call_id: part.id,
            name: part.name.replaceAll(".", "__"),
            arguments: JSON.stringify(part.arguments),
          });
        }
      }
      continue;
    }
    for (const part of message.content) {
      if (part.type === "tool_result") {
        input.push({
          type: "function_call_output",
          call_id: part.toolCallId,
          output: JSON.stringify(part.result),
        });
      }
    }
  }
  return input;
}

export class OpenAIResponsesProvider implements ModelProvider {
  readonly id: string;
  constructor(private readonly options: OpenAIResponsesProviderOptions) {
    this.id = options.id ?? "openai-responses";
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const response = await fetch(`${(this.options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
        ...this.options.headers,
      },
      body: JSON.stringify({
        model: selectedModel(request, this.options.model),
        instructions: request.systemPrompt,
        input: await openAIResponsesInputItems(request.messages, request.workspacePath),
        tools: request.tools.map((tool) => ({
          type: "function",
          name: tool.id.replaceAll(".", "__"),
          description: `${tool.description} [capability-id: ${tool.id}]`,
          parameters: tool.inputSchema,
          strict: false,
        })),
        max_output_tokens: this.options.maxOutputTokens ?? 8192,
        store: false,
        stream: true,
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (!response.ok) throw await modelHttpError(this.id, response);
    if (!response.body) throw new Error("Responses stream has no body");
    yield* openAiResponsesStream(response.body, {
      providerId: this.id,
      ...(request.signal ? { signal: request.signal } : {}),
    });
  }
}
