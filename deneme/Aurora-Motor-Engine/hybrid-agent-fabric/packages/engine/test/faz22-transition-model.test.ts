/**
 * FAZ 22 1/3 — a transition model that distinguishes "leads nowhere" from "never
 * looked".
 *
 * The two load-bearing cases: an unobserved pair is `unobserved` rather than
 * probability zero, and a single observation is `insufficient-sample` rather than
 * 100%. Both are the difference between a world model that reports gaps and one
 * that fills them with confident guesses.
 */

import { describe, expect, it } from "vitest";

import { isPredictionActionable, MIN_TRANSITION_OBSERVATIONS, TransitionModel } from "../src/world/transition-model.js";
import type { ObservedTransition } from "../src/world/transition-model.js";

function observed(fromState: string, action: string, toStates: readonly string[]): ObservedTransition[] {
  return toStates.map((toState) => ({ fromState, action, toState }));
}

describe("a well-observed transition is predicted", () => {
  it("reports the probability with its denominator", () => {
    const model = new TransitionModel(observed("idle", "deploy", ["running", "running", "running", "running", "running"]));
    const prediction = model.predict("idle", "deploy");

    expect(prediction.verdict).toBe("predicted");
    expect(prediction.toState).toBe("running");
    expect(prediction.probability).toBeCloseTo(1, 5);
    expect(prediction.observations).toBe(5);
    expect(prediction.detail).toContain("5/5 observed transitions");
    expect(isPredictionActionable(prediction)).toBe(true);
  });

  it("shows a non-deterministic outcome rather than hiding it", () => {
    const model = new TransitionModel([
      ...observed("idle", "deploy", ["running", "running", "running"]),
      ...observed("idle", "deploy", ["failed", "failed"]),
    ]);
    const prediction = model.predict("idle", "deploy");

    expect(prediction.verdict).toBe("predicted");
    expect(prediction.probability).toBeCloseTo(0.6, 5);
    expect(prediction.distribution).toEqual([
      { toState: "running", count: 3 },
      { toState: "failed", count: 2 },
    ]);
    expect(prediction.detail).toContain("the outcome is not deterministic");
  });

  it("keeps different actions on the same state apart", () => {
    const model = new TransitionModel([
      ...observed("idle", "deploy", Array.from({ length: 5 }, () => "running")),
      ...observed("idle", "restart", Array.from({ length: 5 }, () => "degraded")),
    ]);
    expect(model.predict("idle", "deploy").toState).toBe("running");
    expect(model.predict("idle", "restart").toState).toBe("degraded");
  });
});

describe("rule 2 — never seen is not 'leads nowhere'", () => {
  it("reports unobserved with no probability at all", () => {
    const model = new TransitionModel(observed("idle", "deploy", Array.from({ length: 5 }, () => "running")));
    const prediction = model.predict("idle", "scale");

    expect(prediction.verdict).toBe("unobserved");
    expect(prediction.probability).toBeUndefined();
    expect(prediction.toState).toBeUndefined();
    expect(prediction.observations).toBe(0);
    // The point: not zero.
    expect(prediction.detail).toContain("a gap in the record rather than a statement that nothing happens");
    expect(isPredictionActionable(prediction)).toBe(false);
  });

  it("reports unobserved for an empty model", () => {
    const prediction = new TransitionModel().predict("anything", "any-action");
    expect(prediction.verdict).toBe("unobserved");
    expect(prediction.observations).toBe(0);
  });
});

describe("rule 3 — one observation is not a probability", () => {
  it("reports insufficient-sample below the floor", () => {
    const model = new TransitionModel(observed("idle", "deploy", ["running"]));
    const prediction = model.predict("idle", "deploy");

    expect(prediction.verdict).toBe("insufficient-sample");
    expect(prediction.probability).toBeUndefined();
    expect(prediction.observations).toBe(1);
    expect(prediction.detail).toContain(`below the ${MIN_TRANSITION_OBSERVATIONS} needed`);
    expect(isPredictionActionable(prediction)).toBe(false);
  });

  it("says so when a small sample already disagrees with itself", () => {
    const model = new TransitionModel(observed("idle", "deploy", ["running", "failed"]));
    const prediction = model.predict("idle", "deploy");
    expect(prediction.verdict).toBe("insufficient-sample");
    expect(prediction.detail).toContain("they already disagree");
  });

  it("accepts a stated lower floor but never below one", () => {
    const model = new TransitionModel(observed("idle", "deploy", ["running", "running", "failed"]));

    expect(model.predict("idle", "deploy", { minObservations: 3 }).verdict).toBe("predicted");
    // Asking for zero observations does not produce a probability over nothing.
    const forced = model.predict("idle", "deploy", { minObservations: 0 });
    expect(forced.verdict).toBe("predicted");
    expect(forced.observations).toBe(3);
  });
});

describe("rule 5 — it says what it is", () => {
  it("states that this is a frequency model and not a neural transition function", () => {
    const model = new TransitionModel(observed("idle", "deploy", Array.from({ length: 5 }, () => "running")));
    const summary = model.summary();
    expect(summary.pairs).toBe(1);
    expect(summary.transitions).toBe(5);
    expect(summary.mechanism).toContain("frequency counts over observed transitions");
    expect(summary.mechanism).toContain("not a neural transition function");
    expect(summary.mechanism).toContain("does not generalise to states it has not seen");
  });
});

describe("the model cannot drift from its evidence", () => {
  it("counts every observation it is given", () => {
    const model = new TransitionModel();
    model.observe({ fromState: "idle", action: "deploy", toState: "running" });
    model.observe({ fromState: "idle", action: "deploy", toState: "running" });
    expect(model.summary().transitions).toBe(2);
    expect(model.predict("idle", "deploy").observations).toBe(2);
  });

  it("keeps states that differ only by whitespace distinct", () => {
    // Not a normalisation claim: the record is the record, and silently trimming
    // would merge two states the caller wrote differently.
    const model = new TransitionModel([
      ...observed("idle", "deploy", Array.from({ length: 5 }, () => "running")),
      ...observed("idle ", "deploy", Array.from({ length: 5 }, () => "stopped")),
    ]);
    expect(model.summary().pairs).toBe(2);
    expect(model.predict("idle", "deploy").toState).toBe("running");
    expect(model.predict("idle ", "deploy").toState).toBe("stopped");
  });
});
