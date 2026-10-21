/**
 * OpenAI chat-completions streaming, shared.
 *
 * `azure-openai-provider.ts` asked for `stream: false` and then yielded the
 * finished body as a single `text_delta` — the caller waited for the entire
 * completion before seeing one token. `openai-compatible-provider.ts` did stream,
 * but with a hand-rolled parser that split on `\n` instead of framing on the
 * blank line, joined no multi-line `data:` payloads, and carried no size
 * ceiling — so a provider that never sent a newline could grow the buffer
 * without limit.
 *
 * Both are the same wire format, so both now run through this. Framing, the
 * `[DONE]` sentinel and the byte ceilings come from `parseSseJson`; what is left
 * here is the chat-completions semantics:
 *
 *   - text arrives as `choices[0].delta.content` and is yielded **as it arrives**;
 *   - tool calls arrive as *fragments* keyed by `index`, with the id and name on
 *     the first fragment and `function.arguments` split across the rest. They
 *     cannot be emitted until the arguments are complete, so they are
 *     accumulated and flushed after the stream ends;
 *   - `usage` may appear on any frame (Azure and OpenAI send it on a final frame
 *     when `stream_options.include_usage` is set), so the last non-null value
 *     wins rather than the first;
 *   - the stop reason comes from `finish_reason`, and a tool call outranks it.
 *
 * One thing deliberately *not* carried over from the old parser: it counted
 * `outputTokens++` per text delta. That is a count of deltas, not tokens, and it
 * reported a fabricated number whenever the provider sent no `usage` frame.
 * Unknown usage is now reported as zero.
 */
import { randomUUID } from "node:crypto";
import type { JsonValue, ModelStreamEvent, ToolCallContent } from "../types.js";
import { parseSseJson } from "./sse.js";

export interface OpenAiChatStreamOptions {
  /** Attributable in a ceiling-violation message. */
  providerId: string;
  signal?: AbortSignal | undefined;
  /** Dots are escaped as `__` on the way out and restored on the way back. */
  unescapeToolNames?: boolean;
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

function toolCallArguments(raw: string): Record<string, JsonValue> {
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, JsonValue>)
      : { value: parsed as JsonValue };
  } catch {
    // A truncated or non-JSON argument string is still evidence; hiding it would
    // make the failure look like an empty argument list.
    return { raw: raw as JsonValue };
  }
}

/**
 * Turn an SSE byte stream of chat-completions chunks into model stream events.
 * Text is yielded incrementally; tool calls are flushed once, at the end.
 */
export async function* openAiChatStream(
  body: ReadableStream<Uint8Array>,
  options: OpenAiChatStreamOptions,
): AsyncIterable<ModelStreamEvent> {
  const pending = new Map<number, PendingToolCall>();
  let usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | undefined;
  let finishReason: string | undefined;

  for await (const frame of parseSseJson(body, { providerId: options.providerId, signal: options.signal })) {
    const choices = frame["choices"];
    const choice = Array.isArray(choices) ? (choices[0] as Record<string, any> | undefined) : undefined;
    const delta = choice?.["delta"] as Record<string, any> | undefined;

    const content = delta?.["content"];
    if (typeof content === "string" && content) {
      yield { type: "text_delta", delta: content };
    }

    const fragments = delta?.["tool_calls"];
    if (Array.isArray(fragments)) {
      for (const fragment of fragments as Array<Record<string, any>>) {
        const index = Number.isInteger(fragment["index"]) ? (fragment["index"] as number) : 0;
        const existing = pending.get(index) ?? { id: "", name: "", arguments: "" };
        if (typeof fragment["id"] === "string" && fragment["id"]) existing.id = fragment["id"];
        const fn = fragment["function"] as Record<string, any> | undefined;
        if (typeof fn?.["name"] === "string" && fn["name"]) existing.name = fn["name"];
        if (typeof fn?.["arguments"] === "string") existing.arguments += fn["arguments"];
        pending.set(index, existing);
      }
    }

    const frameUsage = frame["usage"] as Record<string, any> | null | undefined;
    if (frameUsage && typeof frameUsage === "object") {
      usage = {
        inputTokens: Number(frameUsage["prompt_tokens"] ?? 0),
        outputTokens: Number(frameUsage["completion_tokens"] ?? 0),
        cacheReadTokens: Number(frameUsage["prompt_tokens_details"]?.["cached_tokens"] ?? 0),
      };
    }

    const reason = choice?.["finish_reason"];
    if (typeof reason === "string" && reason) finishReason = reason;
  }

  // Sorted so a model that emits two tool calls yields them in a stable order.
  for (const index of [...pending.keys()].sort((a, b) => a - b)) {
    const call = pending.get(index)!;
    const name = options.unescapeToolNames === false ? call.name : call.name.replaceAll("__", ".");
    const toolCall: ToolCallContent = {
      type: "tool_call",
      id: call.id || randomUUID(),
      name: name || "unknown",
      arguments: toolCallArguments(call.arguments),
    };
    yield { type: "tool_call", call: toolCall };
  }

  yield {
    type: "usage",
    usage: {
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cacheReadTokens: usage?.cacheReadTokens ?? 0,
      cacheWriteTokens: 0,
    },
  };
  yield {
    type: "done",
    stopReason: pending.size > 0 ? "tool_use" : finishReason === "length" ? "max_tokens" : "end_turn",
  };
}
