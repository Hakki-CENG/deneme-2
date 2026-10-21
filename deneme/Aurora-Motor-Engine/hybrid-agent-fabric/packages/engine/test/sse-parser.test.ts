/**
 * The SSE parser every streaming provider must share.
 *
 * Before this existed, `codex-subscription-provider.ts` had a correct
 * implementation locked to one file, while Anthropic, Gemini and Azure OpenAI
 * called `await response.json()` and yielded the finished body — the caller
 * waited for the entire completion before seeing one token.
 *
 * These tests drive the parser with literal byte chunks, so no network is
 * involved. The framing, the multi-line `data:` rule, the `[DONE]` sentinel and
 * above all the two size ceilings are the parts that are easy to get wrong and
 * expensive to discover in production.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_BUFFER_BYTES,
  DEFAULT_MAX_EVENT_BYTES,
  parseSseJson,
  streamFromChunks,
} from "../src/models/sse.js";

async function collect(chunks: string[], options?: Partial<Parameters<typeof parseSseJson>[1]>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const event of parseSseJson(streamFromChunks(chunks), { providerId: "test", ...options })) {
    out.push(event);
  }
  return out;
}

describe("parseSseJson", () => {
  it("yields each frame as it is framed, in order", async () => {
    const events = await collect([
      'data: {"n":1}\n\n',
      'data: {"n":2}\n\n',
      'data: {"n":3}\n\n',
    ]);
    expect(events.map((e) => e.n)).toEqual([1, 2, 3]);
  });

  it("handles a frame split across chunk boundaries", async () => {
    // The provider can split a frame anywhere; the parser must not care.
    const events = await collect(['data: {"he', 'llo":"wor', 'ld"}\n\n']);
    expect(events).toEqual([{ hello: "world" }]);
  });

  it("joins multiple data: lines within one frame", async () => {
    const events = await collect(['data: {"a":\ndata: 1}\n\n']);
    expect(events).toEqual([{ a: 1 }]);
  });

  it("normalises CRLF framing", async () => {
    const events = await collect(['data: {"a":1}\r\n\r\n']);
    expect(events).toEqual([{ a: 1 }]);
  });

  it("skips [DONE] and empty payloads", async () => {
    const events = await collect(['data: {"a":1}\n\n', "data: [DONE]\n\n", "data:\n\n", "\n\n"]);
    expect(events).toEqual([{ a: 1 }]);
  });

  it("ignores non-object JSON rather than throwing", async () => {
    // Providers interleave keep-alives and comments that carry no usable value.
    const events = await collect(['data: [1,2]\n\n', 'data: "str"\n\n', 'data: {"a":1}\n\n', ": keep-alive\n\n"]);
    expect(events).toEqual([{ a: 1 }]);
  });

  it("refuses a single event larger than the ceiling", async () => {
    const big = "x".repeat(2048);
    await expect(collect([`data: {"pad":"${big}"}\n\n`], { maxEventBytes: 1024 })).rejects.toThrow(/SSE event exceeds 1024 bytes/);
  });

  it("refuses a buffer that never reaches a frame boundary", async () => {
    // The ceiling that stops a provider which never frames from growing memory
    // without limit.
    const endless = "data: " + "y".repeat(4096);
    await expect(collect([endless], { maxBufferBytes: 1024 })).rejects.toThrow(/SSE buffer exceeds 1024 bytes/);
  });

  it("has 2 MiB defaults, so an unconfigured caller is still bounded", () => {
    expect(DEFAULT_MAX_EVENT_BYTES).toBe(2 * 1024 * 1024);
    expect(DEFAULT_MAX_BUFFER_BYTES).toBe(2 * 1024 * 1024);
  });

  it("stops when the signal is aborted", async () => {
    const controller = new AbortController();
    const events: Record<string, unknown>[] = [];
    const stream = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        // Never-ending source: only the abort can stop the loop.
        await new Promise((resolve) => setTimeout(resolve, 5));
        streamController.enqueue(new TextEncoder().encode("data: {\"a\":1}\n"));
      },
    });
    const pump = (async () => {
      for await (const event of parseSseJson(stream, { providerId: "test", signal: controller.signal })) {
        events.push(event);
      }
    })();
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await expect(pump).rejects.toThrow();
    await stream.cancel().catch(() => undefined);
  });
});
