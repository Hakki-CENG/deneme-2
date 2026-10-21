/**
 * FAZ 14 2/3 — drift raises a candidate replan, and an unmeasurable report raises nothing.
 *
 * Drives the real AuroraPlanFeedback with a stub initiative service that records
 * what it was asked to propose, because the point of the wiring is which cases
 * reach `propose` at all.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuroraPlanFeedback } from "../src/aurora/plan-feedback-service.js";
import type { Goal, TrajectoryStep } from "../src/execution/goal-drift.js";

interface Proposed {
  kind: string;
  title: string;
  message: string;
  evidenceRefs: string[];
}

let dir: string;
let proposed: Proposed[];
let feedback: AuroraPlanFeedback;
let feedbackWithoutInitiative: AuroraPlanFeedback;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "haf-faz14-"));
  proposed = [];
  // Only `propose` is used by the drift path, so that is all the stub provides.
  const initiative = {
    propose: async (input: Proposed & Record<string, unknown>) => {
      proposed.push({
        kind: String(input["kind"]),
        title: input.title,
        message: input.message,
        evidenceRefs: input.evidenceRefs ?? [],
      });
      return { id: "init-1" };
    },
  };
  const deps = {
    planning: {} as never,
    decisions: {} as never,
    initiative: initiative as never,
  };
  feedback = new AuroraPlanFeedback(dir, deps);
  feedbackWithoutInitiative = new AuroraPlanFeedback(join(dir, "no-init"), {
    planning: {} as never,
    decisions: {} as never,
  });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const goal: Goal = {
  statement: "make the checkout flow safe to use",
  criteria: [
    { id: "c1", statement: "payments fail closed" },
    { id: "c2", statement: "the retry path is bounded" },
  ],
};

function step(id: string, servesCriterion: string | undefined): TrajectoryStep {
  return { id, description: `step ${id}`, ...(servesCriterion === undefined ? {} : { servesCriterion }), succeeded: true };
}

const context = { planId: "plan-1", planTitle: "harden checkout" };

describe("a drifting trajectory raises a candidate replan", () => {
  it("proposes an initiative carrying the drift detail", async () => {
    proposed.length = 0;
    const { report, advisory } = await feedback.adviseOnDrift(
      "tenant",
      goal,
      [step("s1", "c1"), step("s2", "c2"), step("s3", undefined)],
      context,
    );

    expect(report.verdict).toBe("drifting");
    expect(advisory?.initiativeId).toBe("init-1");
    expect(proposed).toHaveLength(1);
    expect(proposed[0]!.kind).toBe("risk");
    expect(proposed[0]!.message).toContain("2/3 step(s) trace to a stated criterion");
    expect(proposed[0]!.message).toContain("1 trace to none");
    expect(proposed[0]!.evidenceRefs).toContain("plan-1");
  });

  it("names an uncovered criterion in the proposal", async () => {
    proposed.length = 0;
    await feedback.adviseOnDrift("tenant", goal, [step("s1", "c1")], context);
    expect(proposed[0]!.message).toContain("criterion/criteria have no step serving them");
  });

  it("reports failures separately rather than as drift", async () => {
    proposed.length = 0;
    await feedback.adviseOnDrift(
      "tenant",
      goal,
      [
        { ...step("s1", "c1"), succeeded: false },
        step("s2", undefined),
      ],
      context,
    );
    expect(proposed[0]!.message).toContain("failure is not drift");
  });
});

describe("the load-bearing case — unmeasurable raises nothing", () => {
  it("does not propose when the goal states no criteria", async () => {
    proposed.length = 0;
    const { report, advisory } = await feedback.adviseOnDrift(
      "tenant",
      { statement: "improve things", criteria: [] },
      [step("s1", undefined)],
      context,
    );
    expect(report.verdict).toBe("unmeasurable");
    expect(advisory).toBeUndefined();
    expect(proposed).toHaveLength(0);
  });

  it("does not propose when nothing has been executed", async () => {
    proposed.length = 0;
    const { report, advisory } = await feedback.adviseOnDrift("tenant", goal, [], context);
    expect(report.verdict).toBe("unmeasurable");
    expect(proposed).toHaveLength(0);
    expect(advisory).toBeUndefined();
  });
});

describe("an on-goal trajectory is left alone", () => {
  it("proposes nothing when every step traces and every criterion is served", async () => {
    proposed.length = 0;
    const { report, advisory } = await feedback.adviseOnDrift(
      "tenant",
      goal,
      [step("s1", "c1"), step("s2", "c2")],
      context,
    );
    expect(report.verdict).toBe("on-goal");
    expect(proposed).toHaveLength(0);
    expect(advisory).toBeUndefined();
  });

  it("reports the drift even with no initiative service wired", async () => {
    // Without the initiative dependency the report still comes back; only the
    // proposal is skipped. Silence about the drift itself would be the defect.
    const { report, advisory } = await feedbackWithoutInitiative.adviseOnDrift(
      "tenant",
      goal,
      [step("s1", undefined), step("s2", undefined)],
      context,
    );
    expect(report.verdict).toBe("drifting");
    expect(report.unaccounted).toBe(2);
    expect(advisory).toBeUndefined();
  });
});
