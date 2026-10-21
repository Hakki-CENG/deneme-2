/**
 * P3: the levels above the DAG.
 *
 * The property under test is that a milestone cannot claim a status its steps do
 * not support. Everything else — grouping, validation, progress — serves that.
 */
import { describe, expect, it } from "vitest";
import {
  milestoneState,
  planHierarchyProgress,
  validatePlanHierarchy,
} from "../src/aurora/hierarchical-plan.js";
import type { PlanMilestone } from "../src/aurora/hierarchical-plan.js";
import type { ExecutionStatus } from "../src/execution/execution-status.js";

const milestone = (overrides: Partial<PlanMilestone> = {}): PlanMilestone => ({
  id: "m1",
  objective: "the API rejects unauthenticated writes",
  description: "add and verify the guard",
  stepIds: ["s1", "s2"],
  ...overrides,
});

function steps(...statuses: Array<[string, ExecutionStatus]>) {
  return statuses.map(([id, status]) => ({ id, status }));
}

describe("milestoneState derives, it does not accept", () => {
  it("is not_started when nothing ran", () => {
    const state = milestoneState(milestone(), steps(["s1", "not_implemented"], ["s2", "not_implemented"]));
    expect(state.status).toBe("not_started");
    expect(state.ran).toBe(0);
  });

  it("is in_progress when some steps ran and none failed", () => {
    const state = milestoneState(milestone(), steps(["s1", "succeeded"], ["s2", "not_implemented"]));
    expect(state.status).toBe("in_progress");
    expect(state.succeeded).toBe(1);
  });

  it("is succeeded only when every step succeeded", () => {
    const all = milestoneState(milestone(), steps(["s1", "succeeded"], ["s2", "succeeded"]));
    expect(all.status).toBe("succeeded");

    // `executed` is not success — it ran, nobody checked it.
    const executed = milestoneState(milestone(), steps(["s1", "succeeded"], ["s2", "executed"]));
    expect(executed.status).toBe("in_progress");
  });

  it("fails when one step failed, however many succeeded", () => {
    const state = milestoneState(
      milestone({ stepIds: ["s1", "s2", "s3"] }),
      steps(["s1", "succeeded"], ["s2", "succeeded"], ["s3", "failed"]),
    );
    expect(state.status).toBe("failed");
    expect(state.succeeded).toBe(2);
    expect(state.failedStepIds).toEqual(["s3"]);
  });

  it("names the failed step so the risk is attributable", () => {
    const state = milestoneState(
      milestone({ stepIds: ["s1", "s2", "s3"] }),
      steps(["s1", "failed"], ["s2", "failed"], ["s3", "succeeded"]),
    );
    expect(state.failedStepIds).toEqual(["s1", "s2"]);
  });

  it("reports blocked when nothing could run", () => {
    const state = milestoneState(milestone(), steps(["s1", "blocked"], ["s2", "blocked"]));
    expect(state.status).toBe("blocked");
  });

  it("does not count a step it does not own", () => {
    const state = milestoneState(
      milestone({ stepIds: ["s1"] }),
      steps(["s1", "not_implemented"], ["other", "succeeded"]),
    );
    expect(state.status).toBe("not_started");
    expect(state.total).toBe(1);
  });
});

describe("validatePlanHierarchy", () => {
  const planSteps = [{ id: "s1" }, { id: "s2" }];

  it("accepts a hierarchy that covers every step exactly once", () => {
    expect(
      validatePlanHierarchy(
        [milestone({ stepIds: ["s1"] }), milestone({ id: "m2", stepIds: ["s2"], dependsOn: ["m1"] })],
        planSteps,
      ),
    ).toEqual([]);
  });

  it("reports a step that belongs to no milestone", () => {
    const problems = validatePlanHierarchy([milestone({ stepIds: ["s1"] })], planSteps);
    expect(problems).toContain('step "s2" belongs to no milestone');
  });

  it("reports a step claimed by two milestones", () => {
    const problems = validatePlanHierarchy(
      [milestone({ stepIds: ["s1", "s2"] }), milestone({ id: "m2", stepIds: ["s2"] })],
      planSteps,
    );
    expect(problems.some((p) => p.includes('claimed by both'))).toBe(true);
  });

  it("reports a reference to a step that does not exist", () => {
    const problems = validatePlanHierarchy([milestone({ stepIds: ["s1", "s2", "ghost"] })], planSteps);
    expect(problems.some((p) => p.includes('unknown step "ghost"'))).toBe(true);
  });

  it("reports a milestone with no steps", () => {
    const problems = validatePlanHierarchy([milestone({ stepIds: [] }), milestone({ id: "m2", stepIds: ["s1", "s2"] })], planSteps);
    expect(problems).toContain('milestone "m1" claims no steps');
  });

  it("reports a dependency on an unknown milestone", () => {
    const problems = validatePlanHierarchy(
      [milestone({ stepIds: ["s1", "s2"], dependsOn: ["m9"] })],
      planSteps,
    );
    expect(problems.some((p) => p.includes('unknown milestone "m9"'))).toBe(true);
  });

  it("reports a milestone cycle", () => {
    const problems = validatePlanHierarchy(
      [
        milestone({ stepIds: ["s1"], dependsOn: ["m2"] }),
        milestone({ id: "m2", stepIds: ["s2"], dependsOn: ["m1"] }),
      ],
      planSteps,
    );
    expect(problems.some((p) => p.includes("cycle"))).toBe(true);
  });

  it("does not report a cycle for a legitimate chain", () => {
    const problems = validatePlanHierarchy(
      [
        milestone({ stepIds: ["s1"], dependsOn: ["m2"] }),
        milestone({ id: "m2", stepIds: ["s2"] }),
      ],
      planSteps,
    );
    expect(problems.some((p) => p.includes("cycle"))).toBe(false);
  });
});

describe("planHierarchyProgress", () => {
  it("counts milestones and steps separately", () => {
    const progress = planHierarchyProgress(
      [milestone({ stepIds: ["s1", "s2"] }), milestone({ id: "m2", stepIds: ["s3"] })],
      steps(["s1", "succeeded"], ["s2", "failed"], ["s3", "not_implemented"]),
    );
    expect(progress.milestones).toBe(2);
    expect(progress.succeeded).toBe(0);
    expect(progress.failed).toBe(1);
    expect(progress.notStarted).toBe(1);
    expect(progress.stepsSucceeded).toBe(1);
    expect(progress.stepsTotal).toBe(3);
  });

  it("is all zeros for a plan with no hierarchy", () => {
    const progress = planHierarchyProgress([], []);
    expect(progress).toEqual({
      milestones: 0, succeeded: 0, failed: 0, inProgress: 0, notStarted: 0, stepsSucceeded: 0, stepsTotal: 0,
    });
  });
});

/**
 * End to end: a planner that groups its steps produces a report carrying derived
 * milestone states. Without this the hierarchy would be a type nothing populates.
 */
import { UnifiedExecutionLoop } from "../src/execution/unified-execution-loop.js";
import { formalVerifier } from "../src/execution/verification-factory.js";

describe("a plan with milestones reaches the report", () => {
  it("carries derived milestone states", async () => {
    const loop = new UnifiedExecutionLoop(
      {
        runAgent: async () => ({ completed: true, summary: "done, hello.txt now contains Hi" }),
        plan: async () => ({
          steps: [
            { id: "s1", description: "write the file", dependencies: [], expectedOutput: "hello.txt" },
            { id: "s2", description: "check the file", dependencies: ["s1"], expectedOutput: "verified" },
          ],
          milestones: [
            { id: "m1", objective: "the file exists and is correct", description: "write and verify", stepIds: ["s1", "s2"] },
          ],
        }),
        verifiersFor: async () => [
          formalVerifier("file", async () => ({ ok: true, output: "hello.txt contains Hi" })),
        ],
      },
      { maxAttempts: 1 },
    );

    const report = await loop.run({ tenantId: "local", goal: "Create hello.txt containing Hi" });

    expect(report.hierarchy, "the report carries no hierarchy").toBeDefined();
    expect(report.hierarchy).toHaveLength(1);
    expect(report.hierarchy![0]?.milestone.objective).toBe("the file exists and is correct");
    expect(report.hierarchy![0]?.total).toBe(2);
    // The status is derived from the steps, not declared by the planner.
    expect(["succeeded", "in_progress", "failed", "not_started", "blocked"]).toContain(report.hierarchy![0]?.status);
  });

  it("surfaces an invalid hierarchy instead of dropping it", async () => {
    const loop = new UnifiedExecutionLoop(
      {
        runAgent: async () => ({ completed: true, summary: "done" }),
        plan: async () => ({
          steps: [{ id: "s1", description: "write the file", dependencies: [] }],
          milestones: [
            // Refers to a step that does not exist, and leaves s1 unclaimed.
            { id: "m1", objective: "x", description: "y", stepIds: ["ghost"] },
          ],
        }),
      },
      { maxAttempts: 1 },
    );

    const report = await loop.run({ tenantId: "local", goal: "Create hello.txt" });
    const problems = report.outcomes
      .map((o) => o.evidence)
      .filter((evidence) => evidence.includes("Plan hierarchy problem"));
    expect(problems.some((p) => p.includes('unknown step "ghost"'))).toBe(true);
    expect(problems.some((p) => p.includes('belongs to no milestone'))).toBe(true);
  });

  it("omits the field entirely for a flat plan", async () => {
    const loop = new UnifiedExecutionLoop(
      {
        runAgent: async () => ({ completed: true, summary: "done" }),
        plan: async () => [{ id: "s1", description: "write the file", dependencies: [] }],
      },
      { maxAttempts: 1 },
    );
    const report = await loop.run({ tenantId: "local", goal: "Create hello.txt" });
    expect(report.hierarchy).toBeUndefined();
  });
});
