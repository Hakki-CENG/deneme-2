/**
 * FAZ 20 1/3 — reliability is measured, and "never tried" is not reliable.
 *
 * The load-bearing cases: a model that has never run is `insufficient-sample`
 * rather than a clean 100%, and a model with high declared accuracy but poor
 * measured reliability is reported as exactly that disagreement.
 */

import { describe, expect, it } from "vitest";

import {
  compareAccuracyAndReliability,
  isReliabilityActionable,
  measureModelReliability,
} from "../src/routing/model-reliability.js";
import type { ModelRunRecord, RunOutcomeKind } from "../src/routing/model-reliability.js";

function runs(modelId: string, outcomes: readonly RunOutcomeKind[]): ModelRunRecord[] {
  return outcomes.map((outcome) => ({ modelId, outcome }));
}

const allUsable = Array.from({ length: 10 }, () => "usable" as const);

describe("a model with real history is measured", () => {
  it("reports the rate with its denominator", () => {
    const measurement = measureModelReliability("m1", runs("m1", [...allUsable.slice(0, 8), "timeout", "error"]));
    expect(measurement.verdict).toBe("measured");
    expect(measurement.reliability).toBeCloseTo(0.8, 5);
    expect(measurement.detail).toContain("8/10 runs were usable (80%)");
    expect(measurement.detail).toContain("1 timed out");
    expect(measurement.detail).toContain("1 errored");
    expect(isReliabilityActionable(measurement)).toBe(true);
  });

  it("counts other models' runs as nothing to do with this one", () => {
    const measurement = measureModelReliability("m1", [
      ...runs("m1", allUsable),
      ...runs("m2", Array.from({ length: 20 }, () => "error" as const)),
    ]);
    expect(measurement.runs).toBe(10);
    expect(measurement.reliability).toBeCloseTo(1, 5);
  });
});

describe("rule 2 — not answering counts against reliability", () => {
  it("treats timeouts, errors and unusable output alike", () => {
    const measurement = measureModelReliability("m1", runs("m1", [...allUsable.slice(0, 4), "timeout", "timeout", "error", "unusable", "unusable", "unusable"]));
    expect(measurement.usable).toBe(4);
    expect(measurement.unusable).toBe(6);
    expect(measurement.timeouts).toBe(2);
    expect(measurement.errors).toBe(1);
    expect(measurement.reliability).toBeCloseTo(0.4, 5);
  });

  it("says so plainly when a model fails more often than it delivers", () => {
    const measurement = measureModelReliability("m1", runs("m1", [...allUsable.slice(0, 3), ...Array.from({ length: 7 }, () => "timeout" as const)]));
    expect(measurement.detail).toContain("fails to deliver more often than it delivers, whatever its accuracy is when it does");
  });
});

describe("rule 3 — never tried is not reliable", () => {
  it("reports insufficient-sample for a model with no runs", () => {
    const measurement = measureModelReliability("untried", []);
    expect(measurement.verdict).toBe("insufficient-sample");
    expect(measurement.reliability).toBeUndefined();
    expect(measurement.runs).toBe(0);
    // The point: the tempting reading is "no failures observed, so reliable".
    expect(measurement.detail).toContain("no failures observed\" is not evidence of reliability");
    expect(isReliabilityActionable(measurement)).toBe(false);
  });

  it("reports insufficient-sample below the floor even with no failures", () => {
    // Three runs, three successes: reads as 100% and is really three runs.
    const measurement = measureModelReliability("m1", runs("m1", ["usable", "usable", "usable"]));
    expect(measurement.verdict).toBe("insufficient-sample");
    expect(measurement.reliability).toBeUndefined();
    expect(measurement.detail).toContain("below the 10 needed");
  });

  it("accepts a stated lower floor", () => {
    const measurement = measureModelReliability("m1", runs("m1", ["usable", "usable", "timeout"]), { minRuns: 3 });
    expect(measurement.verdict).toBe("measured");
    expect(measurement.reliability).toBeCloseTo(2 / 3, 5);
  });
});

describe("rule 5 — declared accuracy and measured reliability are separate facts", () => {
  it("reports the gap when a model is right when it answers and often does not", () => {
    const measurement = measureModelReliability("m1", runs("m1", [...allUsable.slice(0, 4), ...Array.from({ length: 6 }, () => "timeout" as const)]));
    const comparison = compareAccuracyAndReliability("m1", 0.95, measurement);

    expect(comparison.declaredAccuracy).toBe(0.95);
    expect(comparison.measuredReliability).toBeCloseTo(0.4, 5);
    expect(comparison.gap).toBeCloseTo(0.55, 5);
    expect(comparison.detail).toContain("right when it answers and often does not answer");
  });

  it("does not raise a gap for a model that delivers", () => {
    const measurement = measureModelReliability("m1", runs("m1", allUsable));
    const comparison = compareAccuracyAndReliability("m1", 0.95, measurement);
    expect(comparison.gap).toBeCloseTo(-0.05, 5);
    expect(comparison.detail).not.toContain("often does not answer");
  });

  it("reports accuracy alone when reliability was never measured", () => {
    const comparison = compareAccuracyAndReliability("m1", 0.95, measureModelReliability("m1", []));
    expect(comparison.measuredReliability).toBeUndefined();
    expect(comparison.gap).toBeUndefined();
    expect(comparison.detail).toContain("reliability not measured");
  });
});
