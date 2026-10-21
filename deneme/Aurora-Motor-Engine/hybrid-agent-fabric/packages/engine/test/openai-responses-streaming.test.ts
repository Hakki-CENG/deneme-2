/**
 * The Responses-API provider must stream, not buffer.
 *
 * It called `await response.json()` before this change, so `stream()` produced
 * nothing until the generation finished and the request never asked the API for
 * an event stream at all. The event vocabulary here is the Responses one — it
 * shares no field names with chat-completions — which is why it has its own
 * decoder rather than reusing `openAiChatStream`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIResponsesProvider } from "../src/models/openai-responses-provider.js";
import { ModelProviderError } from "../src/models/model-provider-error.js";
import type { ModelRequest, ModelStreamEvent } from "../src/types.js";

const request: ModelRequest = {
  tenantId: "local",
  sessionId: "s1",
  turnId: "t1",
  systemPrompt: "system",
  messages: [{ id: "m1", role: "user", content: [{ type: "text", text: "hi" }], timestamp: new Date().toISOString() }],
  tools: [],
};

function delayedFrames(frames: string[], gapMs = 15): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= frames.length) {
        controller.close();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, gapMs));
      controller.enqueue(encoder.encode(frames[index++]!));
    },
  });
}

function stubFetch(body: ReadableStream<Uint8Array>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    body,
    json: async () => {
      throw new Error("json() must not be called on a streaming response");
    },
  } as unknown as Response);
}

function provider(): OpenAIResponsesProvider {
  return new OpenAIResponsesProvider({ apiKey: "test-key", model: "test-model" });
}

async function collect(events: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const out: ModelStreamEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpenAIResponsesProvider streaming", () => {
  it("delivers text incrementally instead of waiting for the whole body", async () => {
    stubFetch(delayedFrames([
      'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
      'data: {"type":"response.output_text.delta","delta":" world"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":2}}}\n\n',
    ]));
    const started = Date.now();
    const deltaAt: number[] = [];
    for await (const event of provider().stream(request)) {
      if (event.type === "text_delta") deltaAt.push(Date.now() - started);
    }
    expect(deltaAt.length).toBe(2);
    expect(deltaAt[0]!).toBeLessThan(40);
  });

  it("surfaces a refusal as text rather than dropping it", async () => {
    stubFetch(delayedFrames([
      'data: {"type":"response.refusal.delta","delta":"I cannot do that."}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ]));
    const events = await collect(provider().stream(request));
    expect(events.filter((e) => e.type === "text_delta")).toEqual([{ type: "text_delta", delta: "I cannot do that." }]);
  });

  it("takes tool calls from the completed output item, with escaped names restored", async () => {
    stubFetch(delayedFrames([
      'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","delta":"{\\"q\\":"}\n\n',
      'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","delta":"\\"aurora\\"}"}\n\n',
      'data: {"type":"response.output_item.done","item":{"type":"function_call","id":"fc_1","call_id":"call_9","name":"search__web","arguments":"{\\"q\\":\\"aurora\\"}"}}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ]));
    const events = await collect(provider().stream(request));
    const call = (events.find((e) => e.type === "tool_call") as { call: Record<string, unknown> }).call;
    expect(call).toMatchObject({ id: "call_9", name: "search.web", arguments: { q: "aurora" } });
    expect(events.find((e) => e.type === "done")).toMatchObject({ type: "done", stopReason: "tool_use" });
  });

  it("falls back to the message item when a provider emits no text deltas", async () => {
    stubFetch(delayedFrames([
      'data: {"type":"response.output_item.done","item":{"type":"message","content":[{"type":"output_text","text":"whole answer"}]}}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ]));
    const events = await collect(provider().stream(request));
    expect(events.filter((e) => e.type === "text_delta")).toEqual([{ type: "text_delta", delta: "whole answer" }]);
  });

  it("maps incomplete_details.reason to max_tokens", async () => {
    stubFetch(delayedFrames([
      'data: {"type":"response.output_text.delta","delta":"trunc"}\n\n',
      'data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}\n\n',
    ]));
    const events = await collect(provider().stream(request));
    expect(events.find((e) => e.type === "done")).toMatchObject({ type: "done", stopReason: "max_tokens" });
  });

  it("raises a typed provider error for a failed response", async () => {
    stubFetch(delayedFrames([
      'data: {"type":"response.failed","response":{"error":{"code":"rate_limit_exceeded","status":429}}}\n\n',
    ]));
    await expect(collect(provider().stream(request))).rejects.toBeInstanceOf(ModelProviderError);
  });

  it("refuses an oversized frame instead of allocating it", async () => {
    stubFetch(delayedFrames([`data: {"type":"response.output_text.delta","delta":"${"x".repeat(3 * 1024 * 1024)}"}\n\n`]));
    await expect(collect(provider().stream(request))).rejects.toThrow(/exceeds/);
  });
});
