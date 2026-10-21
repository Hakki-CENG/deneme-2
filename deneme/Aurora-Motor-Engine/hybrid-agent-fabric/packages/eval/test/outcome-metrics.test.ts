/**
 * Outcome metrics: the figures that answer "is this version better?".
 *
 * The cases here are chosen to pin the three properties that a plain pass/fail
 * rate hides — that `falseSuccess` is measured against wins rather than all
 * runs, that `recoverySuccess` only counts runs which actually failed, and that
 * a pass-rate gain bought with unverified passes is reported as a regression
 * rather than an improvement.
 */
import { describe, expect, it } from "vitest";
import { compareOutcomeMetrics, deriveOutcomeMetrics, findRegressions } from "../src/metrics/outcome-metrics.js";
import type { RunRecord } from "../src/tasks/types.js";

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    taskId: "t",
    domain: "coding",
    succeeded: true,
    verified: true,
    attempts: 1,
    recovered: false,
    toolCalls: 10,
    toolFailures: 0,
    steps: 5,
    costUsd: 0.1,
    durationMs: 1000,
    contextTokens: 500,
    contextBudget: 1000,
    safetyViolations: 0,
    sessions: 1,
    replans: 0,
    ...overrides,
  };
}

describe("deriveOutcomeMetrics", () => {
  it("returns zeros rather than NaN for an empty batch", () => {
    const m = deriveOutcomeMetrics([]);
    expect(m.runs).toBe(0);
    for (const value of Object.values(m)) {
      if (typeof value === "number") expect(Number.isNaN(value)).toBe(false);
    }
    expect(m.taskSuccess).toBe(0);
    expect(m.falseSuccess).toBe(0);
    expect(m.recoverySuccess).toBe(0);
  });

  it("computes the core rates", () => {
    const m = deriveOutcomeMetrics([
      run({ taskId: "a" }),
      run({ taskId: "b", succeeded: false, verified: false }),
      run({ taskId: "c", succeeded: true, verified: false }),
      run({ taskId: "d", succeeded: true, verified: true, attempts: 3, recovered: true }),
    ]);
    expect(m.runs).toBe(4);
    expect(m.taskSuccess).toBeCloseTo(0.75); // 3 of 4
    expect(m.verifiedSuccess).toBeCloseTo(0.5); // 2 of 4
    expect(m.firstAttemptSuccess).toBeCloseTo(0.5); // a and c succeeded on attempt 1
  });

  it("measures false success against wins, not against all runs", () => {
    // One win, and it is unverified: that is 100% of our wins, not 50% of runs.
    const m = deriveOutcomeMetrics([run({ verified: false }), run({ succeeded: false, verified: false })]);
    expect(m.falseSuccess).toBe(1);
    expect(m.taskSuccess).toBeCloseTo(0.5);
  });

  it("counts recovery only over runs that actually failed", () => {
    // Two first-attempt successes must not dilute the recovery rate.
    const m = deriveOutcomeMetrics([
      run({ taskId: "a" }),
      run({ taskId: "b" }),
      run({ taskId: "c", attempts: 3, recovered: true }),
      run({ taskId: "d", attempts: 2, recovered: false, succeeded: false, verified: false }),
    ]);
    expect(m.recoverySuccess).toBeCloseTo(0.5); // 1 of the 2 that needed recovery
  });

  it("computes tool efficiency from calls that did not fail", () => {
    const m = deriveOutcomeMetrics([run({ toolCalls: 10, toolFailures: 2 }), run({ toolCalls: 10, toolFailures: 0 })]);
    expect(m.toolEfficiency).toBeCloseTo(0.9);
  });

  it("normalises per-domain rates so unequal domain sizes stay comparable", () => {
    const m = deriveOutcomeMetrics([
      run({ taskId: "a", domain: "coding" }),
      run({ taskId: "b", domain: "coding", succeeded: false, verified: false }),
      run({ taskId: "c", domain: "research", verified: false }),
    ]);
    expect(m.byDomain["coding"]).toMatchObject({ runs: 2, taskSuccess: 0.5, verifiedSuccess: 0.5, falseSuccess: 0 });
    expect(m.byDomain["research"]).toMatchObject({ runs: 1, taskSuccess: 1, verifiedSuccess: 0, falseSuccess: 1 });
  });
});

describe("compareOutcomeMetrics", () => {
  // A realistic baseline rather than a perfect one: half the batch fails, and
  // every win is verified. Starting from 4/4 makes "improvement" impossible and
  // silently turns these cases into tautologies.
  const base = deriveOutcomeMetrics([
    run({ taskId: "a" }),
    run({ taskId: "b" }),
    run({ taskId: "c", succeeded: false, verified: false }),
    run({ taskId: "d", succeeded: false, verified: false }),
  ]);

  it("calls a genuine gain an improvement", () => {
    // One more task passes and the new win is verified too.
    const better = deriveOutcomeMetrics([
      run({ taskId: "a" }),
      run({ taskId: "b" }),
      run({ taskId: "c" }),
      run({ taskId: "d", succeeded: false, verified: false }),
    ]);
    expect(better.taskSuccess).toBeGreaterThan(base.taskSuccess);
    expect(better.falseSuccess).toBe(0);
    expect(compareOutcomeMetrics(base, better).verdict).toBe("improved");
  });

  it("refuses to call an unverified pass-rate gain an improvement", () => {
    // Same headline gain as above, but two of the three wins have no verifier
    // behind them. The pass rate rises; the release did not get better.
    const inflated = deriveOutcomeMetrics([
      run({ taskId: "a" }),
      run({ taskId: "b", verified: false }),
      run({ taskId: "c", verified: false }),
      run({ taskId: "d", succeeded: false, verified: false }),
    ]);
    expect(inflated.taskSuccess).toBeGreaterThan(base.taskSuccess);
    expect(inflated.falseSuccess).toBeGreaterThan(base.falseSuccess);
    const result = compareOutcomeMetrics(base, inflated);
    expect(result.verdict).toBe("regressed");
    expect(result.reasons.some((reason) => reason.includes("not verified"))).toBe(true);
  });

  it("reports no movement as unchanged", () => {
    expect(compareOutcomeMetrics(base, { ...base }).verdict).toBe("unchanged");
  });

  it("lists what moved", () => {
    const result = compareOutcomeMetrics(base, { ...base, falseSuccess: 0.25 });
    expect(result.reasons.some((reason) => reason.startsWith("falseSuccess:"))).toBe(true);
  });
});

describe("the remaining plan metrics", () => {
  it("reports latency mean and p95", () => {
    const runs = [100, 200, 300, 400, 500, 600, 700, 800, 900, 10_000].map((durationMs, i) =>
      run({ taskId: `t${i}`, durationMs }),
    );
    const metrics = deriveOutcomeMetrics(runs);
    expect(metrics.meanLatencyMs).toBe(1450);
    expect(metrics.p95LatencyMs).toBe(10_000);
  });

  it("reports context utilisation only for runs that declare a budget", () => {
    const metrics = deriveOutcomeMetrics([
      run({ contextTokens: 500, contextBudget: 1000 }),
      run({ contextTokens: 0, contextBudget: 0 }),
    ]);
    expect(metrics.meanContextUtilisation).toBeCloseTo(0.5, 6);
  });

  it("totals safety violations instead of averaging them away", () => {
    expect(deriveOutcomeMetrics([run({ safetyViolations: 2 }), run({ safetyViolations: 0 })]).safetyViolations).toBe(2);
  });

  it("reports the planning proxy as 1 - replans / steps", () => {
    expect(deriveOutcomeMetrics([run({ steps: 10, replans: 2 })]).planningQualityProxy).toBeCloseTo(0.8, 6);
    expect(deriveOutcomeMetrics([run({ steps: 0, replans: 0 })]).planningQualityProxy).toBe(0);
  });

  it("leaves retrieval quality null when no run measured it", () => {
    expect(deriveOutcomeMetrics([run()]).memoryRetrievalQuality).toBeNull();
    expect(deriveOutcomeMetrics([run({ recallAtK: 0.8 }), run({ recallAtK: 0.6 })]).memoryRetrievalQuality).toBeCloseTo(0.7, 6);
  });

  it("grades long-horizon completion only across multi-session runs", () => {
    const metrics = deriveOutcomeMetrics([
      run({ sessions: 1, succeeded: false }),
      run({ sessions: 3, succeeded: true }),
      run({ sessions: 2, succeeded: false }),
    ]);
    expect(metrics.longHorizonCompletion).toBeCloseTo(0.5, 6);
    expect(deriveOutcomeMetrics([run({ sessions: 1 })]).longHorizonCompletion).toBeNull();
  });
});

describe("findRegressions", () => {
  it("flags a task that used to pass and now fails", () => {
    expect(
      findRegressions(
        [run({ taskId: "a", succeeded: true }), run({ taskId: "b", domain: "writing", succeeded: true })],
        [run({ taskId: "a", succeeded: false }), run({ taskId: "b", domain: "writing", succeeded: true })],
      ),
    ).toEqual([{ taskId: "a", domain: "coding", before: true, after: false }]);
  });

  it("treats a brand-new task as a new task, not a regression", () => {
    expect(findRegressions([run({ taskId: "a", succeeded: true })], [run({ taskId: "new", succeeded: false })])).toEqual([]);
  });
});
