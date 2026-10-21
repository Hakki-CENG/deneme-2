/**
 * The Anthropic provider must stream, not buffer.
 *
 * Measured before this change: `anthropic-provider.ts` sent no `stream: true`,
 * called `const body = await response.json()`, and only then yielded — so
 * `stream()` was a generator in name only. The caller waited for the entire
 * completion before seeing a single token, and a long response was
 * indistinguishable from a hang.
 *
 * The first test below is the one that matters: deltas have to arrive *while
 * the response is still being produced*. The rest pin the frame mapping,
 * including tool arguments, which Anthropic splits across `input_json_delta`
 * fragments that only become valid JSON once concatenated.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../src/models/anthropic-provider.js";
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

afterEach(() => {
  vi.restoreAllMocks();
});

function provider(): AnthropicProvider {
  return new AnthropicProvider({ apiKey: "test-key", model: "claude-test" });
}

describe("AnthropicProvider streaming", () => {
  it("yields text deltas while the response is still arriving", async () => {
    // Three frames, 15 ms apart. A buffered implementation could only produce
    // the first delta after the last frame, i.e. after ~45 ms.
    const spy = stubFetch(
      delayedFrames([
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"one"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"two"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ]),
    );

    const startedAt = Date.now();
    const arrivals: Array<{ text: string; at: number }> = [];
    for await (const event of provider().stream(request)) {
      if (event.type === "text_delta") arrivals.push({ text: event.delta, at: Date.now() - startedAt });
    }

    expect(arrivals.map((a) => a.text)).toEqual(["one", "two"]);
    // The first delta arrived well before the stream could have finished.
    expect(arrivals[0]!.at).toBeLessThan(40);
    expect(arrivals[1]!.at).toBeGreaterThan(arrivals[0]!.at);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("asks for a stream and accepts event-stream", async () => {
    const spy = stubFetch(delayedFrames(['data: {"type":"message_stop"}\n\n']));
    for await (const _ of provider().stream(request)) { /* drain */ }
    const [, init] = spy.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect((init?.headers as Record<string, string>).accept).toBe("text/event-stream");
  });

  it("never calls response.json()", async () => {
    // The stub throws if json() is touched, so reaching the end is the assertion.
    stubFetch(delayedFrames(['data: {"type":"message_stop"}\n\n']));
    const events: ModelStreamEvent[] = [];
    for await (const event of provider().stream(request)) events.push(event);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("assembles tool arguments split across input_json_delta fragments", async () => {
    stubFetch(
      delayedFrames([
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"fs__read"}}\n\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"/tmp/a"}}\n\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":".txt\\"}"}}\n\n',
        'data: {"type":"content_block_stop","index":1}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ], 1),
    );

    const events: ModelStreamEvent[] = [];
    for await (const event of provider().stream(request)) events.push(event);

    const call = events.find((e) => e.type === "tool_call");
    expect(call?.type).toBe("tool_call");
    if (call?.type !== "tool_call") throw new Error("unreachable");
    expect(call.call.id).toBe("toolu_1");
    // Capability ids are transmitted with "__" and restored to "."
    expect(call.call.name).toBe("fs.read");
    expect(call.call.arguments).toEqual({ path: "/tmp/a.txt" });

    const done = events.find((e) => e.type === "done");
    expect(done?.type === "done" && done.stopReason).toBe("tool_use");
  });

  it("reports usage from message_start and message_delta", async () => {
    stubFetch(
      delayedFrames([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":11,"cache_read_input_tokens":3,"cache_creation_input_tokens":2}}}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ], 1),
    );

    let usage: ModelStreamEvent | undefined;
    for await (const event of provider().stream(request)) {
      if (event.type === "usage") usage = event;
    }
    expect(usage?.type === "usage" && usage.usage).toEqual({
      inputTokens: 11,
      outputTokens: 5,
      cacheReadTokens: 3,
      cacheWriteTokens: 2,
    });
  });

  it("surfaces an empty tool-argument block as an empty object rather than dropping the call", async () => {
    stubFetch(
      delayedFrames([
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_2","name":"noop"}}\n\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ], 1),
    );
    const events: ModelStreamEvent[] = [];
    for await (const event of provider().stream(request)) events.push(event);
    const call = events.find((e) => e.type === "tool_call");
    expect(call?.type === "tool_call" && call.call.arguments).toEqual({});
  });
});
