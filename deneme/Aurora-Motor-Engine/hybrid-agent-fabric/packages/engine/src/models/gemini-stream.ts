/**
 * Shared decoder for Gemini's `streamGenerateContent?alt=sse` responses.
 *
 * Each frame carries a complete `GenerateContentResponse` — the same shape the
 * buffered `generateContent` endpoint returns — so the part-walking rules are
 * identical and only the framing differs. That is exactly why it lives next to
 * `parseSseJson` rather than inside the provider: the provider previously called
 * `await response.json()` on a streaming endpoint's worth of data and could not
 * emit a single character until the model had finished.
 *
 * Two details that differ from the chat-completions decoder:
 *   - `usageMetadata` is *cumulative* across chunks, so the last one seen wins;
 *   - `finishReason` only appears on the final chunk, so it is remembered rather
 *     than read off whichever chunk happens to carry it.
 */
import type { JsonValue } from "../types.js";
import type { ModelStreamEvent, ToolCallContent } from "../types.js";
import { randomUUID } from "node:crypto";
import { parseSseJson } from "./sse.js";

export interface GeminiStreamOptions {
  providerId: string;
  signal?: AbortSignal | undefined;
}

function hafName(name: string): string {
  return name.replaceAll("__", ".");
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : undefined;
}

export async function* geminiStream(
  body: ReadableStream<Uint8Array>,
  options: GeminiStreamOptions,
): AsyncIterable<ModelStreamEvent> {
  let toolUse = false;
  let finishReason = "STOP";
  let usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | undefined;

  for await (const frame of parseSseJson(body, { providerId: options.providerId, signal: options.signal })) {
    const candidates = frame["candidates"];
    const candidate = Array.isArray(candidates) ? (candidates[0] as Record<string, any> | undefined) : undefined;
    if (candidate) {
      const parts = asRecord(candidate["content"])?.["parts"];
      if (Array.isArray(parts)) {
        for (const rawPart of parts) {
          const part = asRecord(rawPart);
          if (!part) continue;
          const text = part["text"];
          if (typeof text === "string" && text) {
            yield part["thought"] === true
              ? { type: "reasoning_delta", delta: text }
              : { type: "text_delta", delta: text };
          }
          const functionCall = asRecord(part["functionCall"]);
          const callName = functionCall?.["name"];
          if (functionCall && typeof callName === "string") {
            toolUse = true;
            const args = functionCall["args"];
            const call: ToolCallContent = {
              type: "tool_call",
              id: typeof functionCall["id"] === "string" ? functionCall["id"] : randomUUID(),
              name: hafName(callName),
              arguments:
                args && typeof args === "object" && !Array.isArray(args)
                  ? (args as Record<string, JsonValue>)
                  : {},
            };
            yield { type: "tool_call", call };
          }
        }
      }
      const reason = candidate["finishReason"];
      if (typeof reason === "string" && reason) finishReason = reason;
    }

    const meta = asRecord(frame["usageMetadata"]);
    if (meta) {
      // Cumulative: the final chunk carries the whole conversation's counts.
      usage = {
        inputTokens: Number(meta["promptTokenCount"]) || 0,
        outputTokens: Number(meta["candidatesTokenCount"]) || 0,
        cacheReadTokens: Number(meta["cachedContentTokenCount"]) || 0,
      };
    }
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
    stopReason: toolUse ? "tool_use" : finishReason.toUpperCase() === "MAX_TOKENS" ? "max_tokens" : "end_turn",
  };
}
