/**
 * A model that goes quiet must end, and a model that is merely slow must not.
 *
 * An audit left a local model running past 300 seconds with the session stuck in
 * `running` and no way to tell a slow generation from a dead one: the router had
 * no timeout at all. These cases drive the router with providers that stall on
 * purpose, and assert both halves — the stall is cut off, and a stream that keeps
 * producing is left alone however long it takes.
 */
import { describe, expect, it } from "vitest";
import { ModelProviderRegistry } from "../src/models/model-router.js";
import { clampIdleTimeoutMs, DEFAULT_STREAM_IDLE_TIMEOUT_MS } from "../src/models/model-stream-timeout.js";
import type { ModelProvider, ModelRequest, ModelStreamEvent } from "../src/types.js";

const request: ModelRequest = { messages: [{ role: "user", content: "hi" }], tools: [] };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A provider whose stream stalls for `stallMs` before its first event. */
function stallingProvider(id: string, stallMs: number, seen?: { aborted: boolean }): ModelProvider {
  return {
    id,
    async *stream(req: ModelRequest): AsyncGenerator<ModelStreamEvent> {
      const abort = req.signal;
      // Wait for either the stall to elapse or the request to be aborted, and
      // record which happened: the router must actually cancel the request, not
      // merely stop reading from it.
      const outcome = await Promise.race([
        sleep(stallMs).then(() => "elapsed" as const),
        new Promise<"aborted">((resolve) => {
          if (abort?.aborted) resolve("aborted");
          else abort?.addEventListener("abort", () => resolve("aborted"), { once: true });
        }),
      ]);
      if (outcome === "aborted") {
        if (seen) seen.aborted = true;
        throw new Error("aborted");
      }
      yield { type: "text_delta", delta: "done" };
      yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } };
      yield { type: "done", stopReason: "end_turn" };
    },
  };
}

/** A provider that emits an event every `everyMs`, never going quiet. */
function chattyProvider(id: string, everyMs: number, count: number): ModelProvider {
  return {
    id,
    async *stream(): AsyncGenerator<ModelStreamEvent> {
      for (let index = 0; index < count; index += 1) {
        await sleep(everyMs);
        yield { type: "text_delta", delta: `chunk-${index}` };
      }
      yield { type: "done", stopReason: "end_turn" };
    },
  };
}

async function collect(stream: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const out: ModelStreamEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

describe("a stalled model stream is aborted", () => {
  it("throws stream_idle_timeout rather than waiting forever", async () => {
    const router = new ModelProviderRegistry();
    router.register(stallingProvider("stall", 5_000));
    router.setStreamIdleTimeout(1_000);

    const error = await collect(router.stream(request)).then(
      () => undefined,
      (thrown: unknown) => thrown as { code?: string; message?: string },
    );

    expect(error?.code).toBe("stream_idle_timeout");
    // The message names the provider and the window, because "the model stopped
    // answering" and "the connection broke" need different responses.
    expect(error?.message).toContain("stall");
    expect(error?.message).toContain("1000 ms");
  });

  it("aborts the underlying request rather than abandoning it", async () => {
    const seen = { aborted: false };
    const router = new ModelProviderRegistry();
    router.register(stallingProvider("stall", 5_000, seen));
    router.setStreamIdleTimeout(1_000);

    await collect(router.stream(request)).catch(() => undefined);

    // Stopping the read is not enough: an open socket behind an abandoned
    // generator still costs the deployment a request nobody will read.
    expect(seen.aborted).toBe(true);
  });

  it("falls through to the next provider after a stall", async () => {
    const router = new ModelProviderRegistry();
    router.register(stallingProvider("stall", 5_000));
    router.register(stallingProvider("healthy", 0));
    router.setStreamIdleTimeout(1_000);

    // Routes must name their provider. A bare route resolves through the
    // registry's default provider — the first one registered — so "healthy"
    // would have been routed back to the stalling provider and this case would
    // have measured the wrong thing. Found by probing, not by reading.
    const events = await collect(
      router.stream({ ...request, model: "stall:m", fallbackModels: ["healthy:m"] }),
    );
    expect(events.some((event) => event.type === "route_failed")).toBe(true);
    expect(events.some((event) => event.type === "text_delta")).toBe(true);
  });

  it("still honours the caller's own cancellation", async () => {
    const controller = new AbortController();
    const router = new ModelProviderRegistry();
    router.register(stallingProvider("stall", 5_000));
    router.setStreamIdleTimeout(10_000);

    const pending = collect(router.stream({ ...request, signal: controller.signal }));
    await sleep(30);
    controller.abort(new Error("user cancelled"));

    const error = await pending.then(
      () => undefined,
      (thrown: unknown) => thrown as Error,
    );
    // A caller cancellation is not an idle timeout and must not be relabelled as
    // one, or a user who pressed stop reads "the model stopped answering".
    expect(error).toBeDefined();
    expect((error as { code?: string }).code).not.toBe("stream_idle_timeout");
  });
});

describe("a slow model that keeps producing is left alone", () => {
  it("completes even though its total duration exceeds the idle window", async () => {
    const router = new ModelProviderRegistry();
    // Six chunks 40 ms apart: 240 ms in total against a 60 ms silence window.
    // Every gap is inside the window, so nothing here should be interrupted.
    router.register(chattyProvider("slow", 40, 6));
    router.setStreamIdleTimeout(1_000);

    const events = await collect(router.stream(request));
    expect(events.filter((event) => event.type === "text_delta")).toHaveLength(6);
    expect(events.some((event) => event.type === "done")).toBe(true);
  });
});

describe("the timeout cannot be configured into uselessness", () => {
  it("clamps absurd values instead of accepting them", () => {
    // A zero or negative window would abort every request; an enormous one is
    // the same as having no timeout, which is the bug being fixed.
    expect(clampIdleTimeoutMs(0)).toBe(1_000);
    expect(clampIdleTimeoutMs(-5)).toBe(1_000);
    expect(clampIdleTimeoutMs(Number.POSITIVE_INFINITY)).toBe(DEFAULT_STREAM_IDLE_TIMEOUT_MS);
    expect(clampIdleTimeoutMs(undefined)).toBe(DEFAULT_STREAM_IDLE_TIMEOUT_MS);
    expect(clampIdleTimeoutMs(10 * 60_000)).toBe(600_000);
  });
});
