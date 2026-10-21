/**
 * FAZ 14 1/3 — drift is measured against stated criteria, or not at all.
 *
 * Two cases carry this. A goal with no criteria is `unmeasurable` rather than
 * "on-goal", because reporting on-goal there would certify any trajectory. And a
 * failed step is not drift — conflating them sends a replan after the wrong
 * problem.
 */

import { describe, expect, it } from "vitest";

import { detectGoalDrift, isDriftReportActionable } from "../src/execution/goal-drift.js";
import type { Goal, TrajectoryStep } from "../src/execution/goal-drift.js";

const goal: Goal = {
  statement: "make the checkout flow safe to use",
  criteria: [
    { id: "c1", statement: "payments fail closed" },
    { id: "c2", statement: "the retry path is bounded" },
  ],
};

function step(id: string, servesCriterion: string | undefined, succeeded = true): TrajectoryStep {
  return {
    id,
    description: `step ${id}`,
    ...(servesCriterion === undefined ? {} : { servesCriterion }),
    succeeded,
  };
}

describe("a fully traced trajectory is on-goal", () => {
  it("reports on-goal when every step traces and every criterion is served", () => {
    const report = detectGoalDrift(goal, [step("s1", "c1"), step("s2", "c2")]);
    expect(report.verdict).toBe("on-goal");
    expect(report.accounted).toBe(2);
    expect(report.unaccounted).toBe(0);
    expect(report.uncoveredCriteria).toEqual([]);
    expect(isDriftReportActionable(report)).toBe(true);
  });
});

describe("rule 1 — no criteria means no measurement", () => {
  it("reports unmeasurable for a goal that states no criteria", () => {
    const report = detectGoalDrift({ statement: "improve things", criteria: [] }, [step("s1", undefined)]);
    expect(report.verdict).toBe("unmeasurable");
    expect(report.detail).toContain("not evidence that the work is on-goal");
    // The point: unmeasurable is not a pass.
    expect(isDriftReportActionable(report)).toBe(false);
  });

  it("reports unmeasurable when nothing has been executed", () => {
    const report = detectGoalDrift(goal, []);
    expect(report.verdict).toBe("unmeasurable");
    expect(report.detail).toContain("no trajectory to measure");
    expect(isDriftReportActionable(report)).toBe(false);
  });
});

describe("rule 2 — a trace to a criterion that does not exist is an error", () => {
  it("flags the invalid trace and drifts", () => {
    const report = detectGoalDrift(goal, [step("s1", "c1"), step("s2", "c99")]);
    expect(report.verdict).toBe("drifting");
    expect(report.invalidTraces).toHaveLength(1);
    expect(report.invalidTraces[0]).toContain("c99");
    // An assertion of a link is not a link, so the step is not accounted for.
    expect(report.accounted).toBe(1);
    expect(report.unaccounted).toBe(1);
  });
});

describe("rule 3 — unaccounted steps are counted, not absorbed", () => {
  it("reports the proportion of the trajectory that serves nothing", () => {
    const report = detectGoalDrift(goal, [
      step("s1", "c1"),
      step("s2", "c2"),
      step("s3", undefined),
      step("s4", undefined),
    ]);
    expect(report.verdict).toBe("drifting");
    expect(report.unaccounted).toBe(2);
    expect(report.detail).toContain("2/4 step(s) serve no stated criterion");
    expect(report.detail).toContain("50%");
  });

  it("detects drift in a long trajectory where each step looks fine", () => {
    // 98 steps that serve the goal, 2 that do not. Nothing failed anywhere.
    const trajectory: TrajectoryStep[] = [
      ...Array.from({ length: 49 }, (_, i) => step(`a${i}`, "c1")),
      ...Array.from({ length: 49 }, (_, i) => step(`b${i}`, "c2")),
      step("drift-1", undefined),
      step("drift-2", undefined),
    ];
    const report = detectGoalDrift(goal, trajectory);
    expect(report.steps).toBe(100);
    expect(report.verdict).toBe("drifting");
    expect(report.failures).toBe(0);
    expect(report.unaccounted).toBe(2);
  });

  it("can accept a stated threshold below a full trace", () => {
    const report = detectGoalDrift(goal, [step("s1", "c1"), step("s2", "c2"), step("s3", undefined)], {
      traceThreshold: 0.6,
    });
    // Both criteria are still covered and two thirds of steps trace, so at this
    // threshold the trajectory holds.
    expect(report.verdict).toBe("on-goal");
    expect(report.unaccounted).toBe(1);
  });
});

describe("rule 4 — failure is not drift", () => {
  it("stays on-goal when every step traces but one failed", () => {
    const report = detectGoalDrift(goal, [step("s1", "c1", false), step("s2", "c2", true)]);
    expect(report.verdict).toBe("on-goal");
    expect(report.failures).toBe(1);
  });

  it("records failures separately when the trajectory is drifting", () => {
    const report = detectGoalDrift(goal, [step("s1", "c1", false), step("s2", undefined, false)]);
    expect(report.verdict).toBe("drifting");
    expect(report.failures).toBe(2);
    expect(report.detail).toContain("failure is not drift");
  });
});

describe("rule 5 — a goal nothing serves is the other direction of drift", () => {
  it("flags an uncovered criterion", () => {
    const report = detectGoalDrift(goal, [step("s1", "c1")]);
    expect(report.verdict).toBe("drifting");
    expect(report.uncoveredCriteria).toHaveLength(1);
    expect(report.uncoveredCriteria[0]!.statement).toBe("the retry path is bounded");
    expect(report.detail).toContain("no step serving them");
  });

  it("flags every criterion when nothing traced to any of them", () => {
    const report = detectGoalDrift(goal, [step("s1", undefined), step("s2", undefined)]);
    expect(report.uncoveredCriteria).toHaveLength(2);
    expect(report.accounted).toBe(0);
  });
});
