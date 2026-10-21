/**
 * The Gemini provider must stream, not buffer.
 *
 * Before this change `gemini-provider.ts` called `await response.json()` and
 * walked the parts afterwards, so `stream()` yielded nothing until the whole
 * generation had landed — and it did so against a request that had not even
 * asked for the streaming endpoint. The first test pins the observable symptom
 * (deltas arriving while the body is still in flight); the rest pin the
 * frame-mapping rules that the buffered walk used to get for free.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../src/models/gemini-provider.js";
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

function provider(): GeminiProvider {
  return new GeminiProvider({ apiKey: "test-key", model: "gemini-2.5-pro" });
}

async function collect(events: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const out: ModelStreamEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GeminiProvider streaming", () => {
  it("delivers text incrementally instead of waiting for the whole body", async () => {
    const spy = stubFetch(delayedFrames([
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}}\n\ndata: [DONE]\n\n',
    ]));
    const started = Date.now();
    const deltaAt: number[] = [];
    for await (const event of provider().stream(request)) {
      if (event.type === "text_delta") deltaAt.push(Date.now() - started);
    }
    expect(deltaAt.length).toBe(2);
    expect(deltaAt[0]!).toBeLessThan(40);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("requests the SSE streaming endpoint", async () => {
    const spy = stubFetch(delayedFrames(['data: {"candidates":[{"finishReason":"STOP"}]}\n\n']));
    await collect(provider().stream(request));
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain(":streamGenerateContent?alt=sse");
  });

  it("separates thought parts from text parts", async () => {
    stubFetch(delayedFrames([
      'data: {"candidates":[{"content":{"parts":[{"text":"thinking","thought":true},{"text":"answer"}]}}]}\n\n',
      "data: [DONE]\n\n",
    ]));
    const events = await collect(provider().stream(request));
    expect(events.filter((e) => e.type === "reasoning_delta")).toEqual([{ type: "reasoning_delta", delta: "thinking" }]);
    expect(events.filter((e) => e.type === "text_delta")).toEqual([{ type: "text_delta", delta: "answer" }]);
  });

  it("yields function calls as they arrive, with escaped names restored", async () => {
    stubFetch(delayedFrames([
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"id":"c1","name":"search__web","args":{"q":"aurora"}}}]}}]}\n\n',
      'data: {"candidates":[{"finishReason":"STOP"}]}\n\ndata: [DONE]\n\n',
    ]));
    const events = await collect(provider().stream(request));
    const call = (events.find((e) => e.type === "tool_call") as { call: Record<string, unknown> }).call;
    expect(call).toMatchObject({ id: "c1", name: "search.web", arguments: { q: "aurora" } });
    expect(events.find((e) => e.type === "done")).toMatchObject({ type: "done", stopReason: "tool_use" });
  });

  it("takes usage from the final cumulative chunk, not the first", async () => {
    // Gemini's usageMetadata is cumulative across chunks; reading the first one
    // would under-report every generation.
    stubFetch(delayedFrames([
      'data: {"candidates":[{"content":{"parts":[{"text":"a"}]}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":1}}\n\n',
      'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":9,"cachedContentTokenCount":2}}\n\n',
      "data: [DONE]\n\n",
    ]));
    const events = await collect(provider().stream(request));
    expect(events.find((e) => e.type === "usage")).toMatchObject({
      type: "usage",
      usage: { inputTokens: 5, outputTokens: 9, cacheReadTokens: 2, cacheWriteTokens: 0 },
    });
  });

  it("maps finishReason MAX_TOKENS to max_tokens", async () => {
    stubFetch(delayedFrames([
      'data: {"candidates":[{"content":{"parts":[{"text":"trunc"}]}}]}\n\n',
      'data: {"candidates":[{"finishReason":"MAX_TOKENS"}]}\n\ndata: [DONE]\n\n',
    ]));
    const events = await collect(provider().stream(request));
    expect(events.find((e) => e.type === "done")).toMatchObject({ type: "done", stopReason: "max_tokens" });
  });

  it("refuses an oversized frame instead of allocating it", async () => {
    stubFetch(delayedFrames([`data: {"candidates":[{"content":{"parts":[{"text":"${"x".repeat(3 * 1024 * 1024)}"}]}}]}\n\n`]));
    await expect(collect(provider().stream(request))).rejects.toThrow(/exceeds/);
  });
});
