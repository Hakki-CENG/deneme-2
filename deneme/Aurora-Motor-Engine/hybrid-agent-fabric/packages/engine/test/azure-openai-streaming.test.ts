/**
 * The Azure OpenAI provider must stream, not buffer.
 *
 * Measured before this change: `azure-openai-provider.ts` sent `stream: false`
 * in the request body, called `const body: any = await response.json()`, and
 * yielded the whole completion as a single `text_delta`. `stream()` was a
 * generator in name only — a caller could not tell a long response from a hang.
 *
 * The first test is the one that matters: deltas must arrive *while the response
 * is still being produced*. The rest pin the chat-completions frame mapping,
 * which is fiddly in two places — tool-call arguments arrive as fragments keyed
 * by `index`, and `usage` only appears at all when the request asked for it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AzureOpenAIProvider } from "../src/models/azure-openai-provider.js";
import type { ModelRequest, ModelStreamEvent } from "../src/types.js";

const request: ModelRequest = {
  tenantId: "local",
  sessionId: "s1",
  turnId: "t1",
  systemPrompt: "system",
  messages: [{ id: "m1", role: "user", content: [{ type: "text", text: "hi" }], timestamp: new Date().toISOString() }],
  tools: [],
};

/** A response body that releases one frame at a time, with a gap between them. */
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

function provider(): AzureOpenAIProvider {
  return new AzureOpenAIProvider({
    endpoint: "https://example.openai.azure.com",
    apiKey: "test-key",
    deployment: "test-deployment",
  });
}

async function collect(events: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const out: ModelStreamEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AzureOpenAIProvider streaming", () => {
  it("delivers text incrementally instead of waiting for the whole body", async () => {
    // Three frames, 15 ms apart: ~30 ms between the first and the last. A
    // buffered implementation cannot emit anything before ~45 ms.
    const spy = stubFetch(delayedFrames([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    ]));
    const started = Date.now();
    const firstDeltaAt: number[] = [];
    for await (const event of provider().stream(request)) {
      if (event.type === "text_delta") firstDeltaAt.push(Date.now() - started);
    }
    expect(firstDeltaAt.length).toBe(2);
    expect(firstDeltaAt[0]!).toBeLessThan(40);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("asks Azure for a stream, and for usage on a streamed response", async () => {
    const spy = stubFetch(delayedFrames(['data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n']));
    await collect(provider().stream(request));
    const body = JSON.parse(String((spy.mock.calls[0]![1] as RequestInit).body));
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("reassembles tool-call arguments split across fragments", async () => {
    stubFetch(delayedFrames([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search__web","arguments":"{\\"q\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"aurora\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
    ]));
    const events = await collect(provider().stream(request));
    const calls = events.filter((e) => e.type === "tool_call");
    expect(calls).toHaveLength(1);
    const call = (calls[0] as { call: { id: string; name: string; arguments: Record<string, unknown> } }).call;
    expect(call.id).toBe("call_1");
    // Dots are escaped as __ on the way out and restored here.
    expect(call.name).toBe("search.web");
    expect(call.arguments).toEqual({ q: "aurora" });
    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({ type: "done", stopReason: "tool_use" });
  });

  it("reports usage from the final frame", async () => {
    stubFetch(delayedFrames([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":3}}}\n\n',
      "data: [DONE]\n\n",
    ]));
    const events = await collect(provider().stream(request));
    expect(events.find((e) => e.type === "usage")).toMatchObject({
      type: "usage",
      usage: { inputTokens: 11, outputTokens: 7, cacheReadTokens: 3, cacheWriteTokens: 0 },
    });
  });

  it("reports zero usage rather than counting deltas when no usage frame arrives", async () => {
    // The parser this replaced did `outputTokens++` per text delta, which
    // reported the number of frames as if it were a token count.
    stubFetch(delayedFrames([
      'data: {"choices":[{"delta":{"content":"one"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"two"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    ]));
    const events = await collect(provider().stream(request));
    expect(events.find((e) => e.type === "usage")).toMatchObject({
      type: "usage",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    });
  });

  it("maps finish_reason 'length' to max_tokens", async () => {
    stubFetch(delayedFrames([
      'data: {"choices":[{"delta":{"content":"trunc"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
    ]));
    const events = await collect(provider().stream(request));
    expect(events.find((e) => e.type === "done")).toMatchObject({ type: "done", stopReason: "max_tokens" });
  });

  it("refuses an oversized frame instead of allocating it", async () => {
    // The shared parser carries the ceiling; a per-provider loop would not have.
    const huge = `data: {"choices":[{"delta":{"content":"${"x".repeat(3 * 1024 * 1024)}"}}]}\n\n`;
    stubFetch(delayedFrames([huge]));
    await expect(collect(provider().stream(request))).rejects.toThrow(/exceeds/);
  });
});
