/**
 * Shared decoder for the OpenAI **Responses** API event stream.
 *
 * The Responses API does not use the chat-completions vocabulary: it emits typed
 * lifecycle events (`response.output_item.added`, `response.output_text.delta`,
 * `response.function_call_arguments.done`, `response.completed`, …) rather than
 * a `choices[0].delta` object per frame. `codex-subscription-provider.ts` has
 * consumed that vocabulary over SSE for a long time; this module holds the parts
 * of it that are not codex-specific, so the plain Responses provider can stream
 * too instead of calling `await response.json()`.
 *
 * Tool calls are taken from `response.output_item.done` rather than accumulated
 * from `function_call_arguments.delta`: the `done` item carries `call_id`, `name`
 * and the complete `arguments` string together, which is exactly what the
 * buffered code path used to read off `body.output`.
 */
import { randomUUID } from "node:crypto";
import type { JsonValue, ModelStreamEvent, ToolCallContent } from "../types.js";
import { ModelProviderError } from "./model-provider-error.js";
import { parseSseJson } from "./sse.js";

export function record(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : undefined;
}

export function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** A Responses `function_call` output item → the engine's tool-call shape. */
export function responsesToolCall(item: Record<string, any>): ToolCallContent {
  let args: Record<string, JsonValue> = {};
  try {
    const parsed = JSON.parse(typeof item["arguments"] === "string" ? item["arguments"] : "{}");
    args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value: parsed as JsonValue };
  } catch {
    args = { raw: String(item["arguments"] ?? "").slice(0, 20_000) };
  }
  return {
    type: "tool_call",
    id:
      typeof item["call_id"] === "string"
        ? item["call_id"]
        : typeof item["id"] === "string"
          ? item["id"]
          : randomUUID(),
    name: String(item["name"]).replaceAll("__", "."),
    arguments: args,
  };
}

export function normalizeResponsesUsage(value: Record<string, any>) {
  return {
    inputTokens: number(value["input_tokens"]),
    outputTokens: number(value["output_tokens"]),
    cacheReadTokens: number(record(value["input_tokens_details"])?.["cached_tokens"]),
    cacheWriteTokens: 0,
  };
}

function streamError(providerId: string, event: Record<string, any>): ModelProviderError {
  const code = typeof event["code"] === "string" ? event["code"].slice(0, 100) : "stream_error";
  const rateLimited = /rate|quota|usage/i.test(code) || event["status"] === 429;
  const credential = /auth|token|account|unauthorized/i.test(code) || event["status"] === 401 || event["status"] === 403;
  return new ModelProviderError(`Responses stream failed (${code}).`, {
    providerId,
    ...(typeof event["status"] === "number" ? { status: event["status"] } : {}),
    code: rateLimited ? "rate_limited" : credential ? "credential_rejected" : code,
    retryable: rateLimited,
  });
}

export interface OpenAiResponsesStreamOptions {
  providerId: string;
  signal?: AbortSignal | undefined;
}

export async function* openAiResponsesStream(
  body: ReadableStream<Uint8Array>,
  options: OpenAiResponsesStreamOptions,
): AsyncIterable<ModelStreamEvent> {
  let toolUse = false;
  let emittedText = false;

  for await (const event of parseSseJson(body, { providerId: options.providerId, signal: options.signal })) {
    const type = typeof event["type"] === "string" ? event["type"] : "";

    if (type === "error") throw streamError(options.providerId, event);

    if (type === "response.output_text.delta" || type === "response.refusal.delta") {
      const delta = typeof event["delta"] === "string" ? event["delta"] : "";
      if (delta) {
        emittedText = true;
        yield { type: "text_delta", delta };
      }
      continue;
    }

    if (type === "response.output_item.done") {
      const item = record(event["item"]);
      if (!item) continue;
      if (item["type"] === "function_call" && typeof item["name"] === "string") {
        toolUse = true;
        yield { type: "tool_call", call: responsesToolCall(item) };
      } else if (!emittedText && item["type"] === "message") {
        // Providers that emit no text deltas still deliver the full content on
        // the item; without this branch such a stream would look empty.
        for (const part of Array.isArray(item["content"]) ? item["content"] : []) {
          const content = record(part);
          if (content?.["type"] === "output_text" && typeof content["text"] === "string" && content["text"]) {
            emittedText = true;
            yield { type: "text_delta", delta: String(content["text"]) };
          }
          if (content?.["type"] === "refusal" && typeof content["refusal"] === "string" && content["refusal"]) {
            emittedText = true;
            yield { type: "text_delta", delta: String(content["refusal"]) };
          }
        }
      }
      continue;
    }

    if (type === "response.completed" || type === "response.incomplete" || type === "response.failed") {
      const response = record(event["response"]) ?? {};
      if (type === "response.failed") throw streamError(options.providerId, record(response["error"]) ?? {});
      const usage = record(response["usage"]);
      yield {
        type: "usage",
        usage: usage
          ? normalizeResponsesUsage(usage)
          : { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
      const incompleteReason = record(response["incomplete_details"])?.["reason"];
      yield {
        type: "done",
        stopReason: toolUse ? "tool_use" : incompleteReason === "max_output_tokens" ? "max_tokens" : "end_turn",
      };
      return;
    }
  }

  // The stream ended without a terminal event. Emitting nothing here would make a
  // truncated response indistinguishable from a successful empty one.
  yield { type: "usage", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
  yield { type: "done", stopReason: toolUse ? "tool_use" : "end_turn" };
}
