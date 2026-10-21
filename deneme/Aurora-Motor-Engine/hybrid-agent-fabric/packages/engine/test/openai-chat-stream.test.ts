/**
 * The shared OpenAI chat-completions decoder.
 *
 * Two providers consume this — Azure OpenAI (which did not stream at all before)
 * and the OpenAI-compatible provider (which streamed with a hand-rolled loop).
 * The tests here cover the four things the hand-rolled loop got wrong, so they
 * are pinned once for every consumer rather than re-derived per provider:
 *
 *   1. frames are delimited by a blank line, and `data:` lines *within* one frame
 *      are joined — a line-based parser sees a split object and drops it;
 *   2. a single oversized event is a parse error, not an allocation;
 *   3. a stream that never sends a boundary cannot grow the buffer without
 *      limit — this is the one that turns a misbehaving provider into an OOM;
 *   4. tool-call fragments are reassembled and emitted in `index` order even
 *      when the fragments interleave.
 */
import { describe, expect, it } from "vitest";
import { openAiChatStream } from "../src/models/openai-chat-stream.js";
import { streamFromChunks } from "../src/models/sse.js";
import type { ModelStreamEvent } from "../src/types.js";

async function collect(events: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const out: ModelStreamEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

const OPTIONS = { providerId: "test-provider" };

describe("openAiChatStream", () => {
  it("joins multi-line data: payloads inside a single frame", async () => {
    // One frame, two data: lines. A parser that splits on "\n" and parses each
    // line separately sees two invalid JSON fragments and yields nothing.
    const body = streamFromChunks([
      'data: {"choices":[{"delta":\n',
      'data: {"content":"joined"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const events = await collect(openAiChatStream(body, OPTIONS));
    expect(events.filter((e) => e.type === "text_delta")).toEqual([{ type: "text_delta", delta: "joined" }]);
  });

  it("refuses an oversized single event", async () => {
    const body = streamFromChunks([
      `data: {"choices":[{"delta":{"content":"${"x".repeat(3 * 1024 * 1024)}"}}]}\n\n`,
    ]);
    await expect(collect(openAiChatStream(body, OPTIONS))).rejects.toThrow(/test-provider.*exceeds/);
  });

  it("refuses a stream that never sends a frame boundary", async () => {
    // No "\n\n" anywhere: an unbounded buffer would keep growing for as long as
    // the provider kept writing.
    const body = streamFromChunks([`data: {"choices":[{"delta":{"content":"${"y".repeat(3 * 1024 * 1024)}"}}]}`]);
    await expect(collect(openAiChatStream(body, OPTIONS))).rejects.toThrow(/buffer exceeds/);
  });

  it("reassembles interleaved tool-call fragments and emits them in index order", async () => {
    const body = streamFromChunks([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"b","function":{"name":"second","arguments":"{\\"n\\":2}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"first","arguments":"{\\"n\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
    ]);
    const events = await collect(openAiChatStream(body, OPTIONS));
    const calls = events
      .filter((e) => e.type === "tool_call")
      .map((e) => (e as { call: { id: string; name: string; arguments: Record<string, unknown> } }).call);
    expect(calls.map((c) => c.name)).toEqual(["first", "second"]);
    expect(calls[0]!.arguments).toEqual({ n: 1 });
    expect(calls[1]!.arguments).toEqual({ n: 2 });
  });

  it("keeps a truncated argument string visible instead of reporting an empty object", async () => {
    const body = streamFromChunks([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"t","arguments":"{\\"cut"}}]}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const events = await collect(openAiChatStream(body, OPTIONS));
    const call = (events.find((e) => e.type === "tool_call") as { call: { arguments: Record<string, unknown> } }).call;
    expect(call.arguments).toEqual({ raw: '{"cut' });
  });

  it("ignores comment and keep-alive frames, and the [DONE] sentinel", async () => {
    const body = streamFromChunks([
      ": keep-alive\n\n",
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const events = await collect(openAiChatStream(body, OPTIONS));
    expect(events.map((e) => e.type)).toEqual(["text_delta", "usage", "done"]);
  });

  it("stops reading when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const body = streamFromChunks(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n']);
    await expect(collect(openAiChatStream(body, { ...OPTIONS, signal: controller.signal }))).rejects.toThrow();
  });
});
