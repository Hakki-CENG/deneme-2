/**
 * FAZ 20's loop closed: runs are recorded as they happen, and reliability is
 * computed from them.
 *
 * The load-bearing case is the last describe block — it feeds `measureModelReliability`
 * from records the wrapper produced, which is the thing that had no source before.
 * The second is abandonment: a consumer that stops early must not turn into a
 * measurement of the model either way.
 */

import { describe, expect, it } from "vitest";

import { measureModelReliability } from "../src/routing/model-reliability.js";
import { InMemoryModelRunRecorder, withRunRecording } from "../src/routing/model-run-recorder.js";
import { ModelProviderRegistry } from "../src/models/model-router.js";
import type { ModelProvider, ModelStreamEvent } from "../src/types.js";

function provider(events: ModelStreamEvent[], opts: { failWith?: Error; id?: string } = {}): ModelProvider {
  return {
    id: opts.id ?? "test-model",
    async *stream(): AsyncIterable<ModelStreamEvent> {
      for (const event of events) yield event;
      if (opts.failWith) throw opts.failWith;
    },
  };
}

const text = (t: string): ModelStreamEvent => ({ type: "text", text: t }) as ModelStreamEvent;
const lifecycle = (): ModelStreamEvent => ({ type: "start" }) as ModelStreamEvent;

async function drain(iterable: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const out: ModelStreamEvent[] = [];
  for await (const event of iterable) out.push(event);
  return out;
}

describe("a completed run is recorded by what it produced", () => {
  it("records usable when the stream carried content", async () => {
    const recorder = new InMemoryModelRunRecorder();
    await drain(withRunRecording(provider([lifecycle(), text("hello")]), recorder).stream({} as never));

    expect(recorder.runsFor("test-model")).toEqual([{ modelId: "test-model", outcome: "usable" }]);
    expect(recorder.tally("test-model").usable).toBe(1);
  });

  it("records unusable when the stream completed with no content", async () => {
    const recorder = new InMemoryModelRunRecorder();
    await drain(withRunRecording(provider([lifecycle(), lifecycle()]), recorder).stream({} as never));

    expect(recorder.runsFor("test-model")).toEqual([{ modelId: "test-model", outcome: "unusable" }]);
  });

  it("does not count an empty text delta as content", async () => {
    const recorder = new InMemoryModelRunRecorder();
    await drain(withRunRecording(provider([text("")]), recorder).stream({} as never));
    expect(recorder.tally("test-model").unusable).toBe(1);
  });
});

describe("a failed run is recorded, and rethrown unchanged", () => {
  it("records error and rethrows the same error", async () => {
    const recorder = new InMemoryModelRunRecorder();
    const boom = new Error("upstream 500");
    const wrapped = withRunRecording(provider([], { failWith: boom }), recorder);

    await expect(drain(wrapped.stream({} as never))).rejects.toBe(boom);
    expect(recorder.runsFor("test-model")).toEqual([{ modelId: "test-model", outcome: "error" }]);
  });

  it("records timeout for a timeout error, decided from the error not a clock", async () => {
    const recorder = new InMemoryModelRunRecorder();
    const wrapped = withRunRecording(provider([], { failWith: new Error("Request timed out after 30s") }), recorder);

    await expect(drain(wrapped.stream({} as never))).rejects.toThrow();
    expect(recorder.runsFor("test-model")[0]!.outcome).toBe("timeout");
  });

  it("recognises a TimeoutError by name", async () => {
    const recorder = new InMemoryModelRunRecorder();
    const error = new Error("nope");
    error.name = "TimeoutError";
    const wrapped = withRunRecording(provider([], { failWith: error }), recorder);

    await expect(drain(wrapped.stream({} as never))).rejects.toThrow();
    expect(recorder.runsFor("test-model")[0]!.outcome).toBe("timeout");
  });
});

describe("abandonment is counted, never recorded as a measurement", () => {
  it("does not become an outcome when the consumer stops early", async () => {
    const recorder = new InMemoryModelRunRecorder();
    const wrapped = withRunRecording(provider([text("a"), text("b"), text("c")]), recorder);

    for await (const _event of wrapped.stream({} as never)) break;

    // The point: no run outcome at all, so reliability is not polluted.
    expect(recorder.runsFor("test-model")).toEqual([]);
    expect(recorder.tally("test-model")).toEqual({
      usable: 0,
      unusable: 0,
      error: 0,
      timeout: 0,
      abandoned: 1,
    });
  });
});

describe("the wrapper adds no behaviour of its own", () => {
  it("yields the same events in the same order", async () => {
    const events = [lifecycle(), text("one"), text("two")];
    const recorder = new InMemoryModelRunRecorder();
    expect(await drain(withRunRecording(provider(events), recorder).stream({} as never))).toEqual(events);
  });

  it("keeps the provider's id", () => {
    const recorder = new InMemoryModelRunRecorder();
    expect(withRunRecording(provider([], { id: "gemini" }), recorder).id).toBe("gemini");
  });

  it("bounds history per model so a long-lived process cannot grow", async () => {
    const recorder = new InMemoryModelRunRecorder(3);
    for (let i = 0; i < 5; i += 1) {
      await drain(withRunRecording(provider([text("x")]), recorder).stream({} as never));
    }
    expect(recorder.runsFor("test-model")).toHaveLength(3);
  });
});

describe("the loop closes: reliability is computed from recorded runs", () => {
  it("turns observed runs into a measured reliability", async () => {
    const recorder = new InMemoryModelRunRecorder();
    const flaky = provider([text("ok")]);
    const failing = provider([], { failWith: new Error("refused") });

    // Eight runs that answered, four that did not.
    for (let i = 0; i < 8; i += 1) {
      await drain(withRunRecording(flaky, recorder).stream({} as never));
    }
    for (let i = 0; i < 4; i += 1) {
      await expect(drain(withRunRecording(failing, recorder).stream({} as never))).rejects.toThrow();
    }

    const reliability = measureModelReliability("test-model", recorder.runsFor("test-model"));
    expect(reliability.verdict).toBe("measured");
    expect(reliability.runs).toBe(12);
    expect(reliability.usable).toBe(8);
    // `unusable` counts errors, timeouts and empty completions together, because all
    // three are "no answer"; `errors` breaks out the subset that threw.
    expect(reliability.unusable).toBe(4);
    expect(reliability.errors).toBe(4);
    expect(reliability.reliability).toBeCloseTo(8 / 12, 5);
  });

  it("still reports insufficient-sample rather than reliable when there are too few", async () => {
    const recorder = new InMemoryModelRunRecorder();
    await drain(withRunRecording(provider([text("ok")]), recorder).stream({} as never));

    const reliability = measureModelReliability("test-model", recorder.runsFor("test-model"));
    expect(reliability.verdict).toBe("insufficient-sample");
  });

  it("reports an empty sample as empty, not as zero failures", () => {
    const reliability = measureModelReliability("never-tried", new InMemoryModelRunRecorder().runsFor("never-tried"));
    expect(reliability.verdict).toBe("insufficient-sample");
    expect(reliability.runs).toBe(0);
  });
});

describe("the registry records through its own stream, which is where every caller goes", () => {
  it("attributes each attempt to the provider that served or failed it", async () => {
    const recorder = new InMemoryModelRunRecorder();
    const registry = new ModelProviderRegistry();
    registry.setRunRecorder(recorder);
    registry.register(provider([text("ok")], { id: "good" }), true);
    registry.register(provider([], { id: "bad", failWith: new Error("refused") }));

    await drain(registry.stream({ model: "good" } as never));
    // A bare model name resolves to the DEFAULT provider, so "bad" has to be
    // addressed as `provider:model` to be consulted at all — `parseModelRoute`
    // splits on ":", not "/". Measured twice before getting this right.
    await expect(drain(registry.stream({ model: "bad:m1" } as never))).rejects.toThrow(/failed before producing/);

    expect(recorder.tally("good").usable).toBe(1);
    // The provider that failed is on the record even though the request-level error
    // is the registry's. Without per-provider records a model that always fails
    // behind a working default looks perfectly reliable.
    expect(recorder.tally("bad").error).toBe(1);
    // The registry exposes the same view, so a caller does not need the recorder
    // object it never held.
    expect(registry.runRecorderFor("bad")).toHaveLength(1);
  });

  it("still records the failed provider when a fallback rescues the request", async () => {
    const recorder = new InMemoryModelRunRecorder();
    const registry = new ModelProviderRegistry();
    registry.setRunRecorder(recorder);
    registry.register(provider([text("ok")], { id: "good" }), true);
    registry.register(provider([], { id: "bad", failWith: new Error("refused") }));

    // The caller gets an answer, because good rescues it.
    const events = await drain(registry.stream({ model: "bad:m1", fallbackModels: ["good"] } as never));
    expect(events.some((event) => (event as { type?: string }).type === "route_selected")).toBe(true);

    // And the provider that failed is still on the record. This is the case FAZ 20
    // exists for: a model rescued by fallback otherwise never shows up as failing.
    expect(recorder.tally("bad").error).toBe(1);
    expect(recorder.tally("good").usable).toBe(1);
  });

  it("records nothing when no recorder is set, and says so", async () => {
    const registry = new ModelProviderRegistry();
    registry.register(provider([text("ok")], { id: "solo" }), true);
    await drain(registry.stream({ model: "solo" } as never));
    expect(registry.runRecorderFor("solo")).toEqual([]);
  });

  it("does not retroactively wrap a provider registered before the recorder", async () => {
    const registry = new ModelProviderRegistry();
    registry.register(provider([text("ok")], { id: "early" }), true);
    const recorder = new InMemoryModelRunRecorder();
    registry.setRunRecorder(recorder);

    await drain(registry.stream({ model: "early" } as never));
    // Documented behaviour rather than a silent gap: setRunRecorder says so.
    expect(recorder.runsFor("early")).toEqual([]);
  });
});
