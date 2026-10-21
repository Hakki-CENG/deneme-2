/**
 * Evidence and constraint grading.
 *
 * The cases that matter most are the negative ones. Both features exist to stop
 * a run from looking better than it was, so the interesting assertions are that
 * missing evidence fails, that a crossed constraint fails, and above all that a
 * constraint this runner cannot evaluate **fails** instead of quietly passing —
 * an unenforceable check that reports success is worse than no check, because
 * the report then claims a guarantee nobody provided.
 */
import { describe, expect, it } from "vitest";
import { gradeExpectedEvidence, gradeTaskConstraints } from "../src/graders/evidence-grader.js";
import { gradeTask } from "../src/graders/grader.js";
import type { EvalTask, TrajectoryEvent } from "../src/tasks/types.js";

function event(kind: string, payload?: unknown): TrajectoryEvent {
  return { sequence: 1, kind, timestamp: new Date(0).toISOString(), ...(payload === undefined ? {} : { payload }) };
}

function task(overrides: Partial<EvalTask> = {}): EvalTask {
  return {
    id: "t1",
    category: "coding",
    name: "task",
    instruction: "do the thing",
    acceptance: [],
    budget: { maxTokens: 1000, maxSteps: 10, maxCostUsd: 1, timeoutMs: 1000 },
    difficulty: 1,
    ...overrides,
  };
}

describe("gradeExpectedEvidence", () => {
  it("fails when the demanded evidence is absent", () => {
    const results = gradeExpectedEvidence(
      task({ expectedEvidence: [{ kind: "capability.finished" }] }),
      [event("task.started")],
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.details).toContain("found 0");
  });

  it("passes when the evidence is present", () => {
    const results = gradeExpectedEvidence(
      task({ expectedEvidence: [{ kind: "capability.finished" }] }),
      [event("capability.finished", { capabilityId: "filesystem.read" })],
    );
    expect(results[0]!.passed).toBe(true);
  });

  it("matches the bus-prefixed form the trajectory mapper emits", () => {
    // engine-eval-trajectory.ts prefixes engine kinds with `bus.`; a task author
    // should not have to know which producer emitted the event.
    const results = gradeExpectedEvidence(
      task({ expectedEvidence: [{ kind: "capability.finished" }] }),
      [event("bus.capability.finished")],
    );
    expect(results[0]!.passed).toBe(true);
  });

  it("respects minOccurrences", () => {
    const t = task({ expectedEvidence: [{ kind: "tool_call", minOccurrences: 3 }] });
    expect(gradeExpectedEvidence(t, [event("tool_call"), event("tool_call")])[0]!.passed).toBe(false);
    expect(gradeExpectedEvidence(t, [event("tool_call"), event("tool_call"), event("tool_call")])[0]!.passed).toBe(true);
  });

  it("filters on the payload when `contains` is given", () => {
    const t = task({ expectedEvidence: [{ kind: "capability.finished", contains: "README" }] });
    expect(gradeExpectedEvidence(t, [event("capability.finished", { path: "other.txt" })])[0]!.passed).toBe(false);
    expect(gradeExpectedEvidence(t, [event("capability.finished", { path: "README.md" })])[0]!.passed).toBe(true);
  });

  it("contributes no grades for a task that declares no evidence", () => {
    expect(gradeExpectedEvidence(task(), [event("tool_call")])).toEqual([]);
  });
});

describe("gradeTaskConstraints", () => {
  it("fails a run that exceeds max_tool_calls", () => {
    const results = gradeTaskConstraints(
      task({ constraints: [{ kind: "max_tool_calls", limit: 2, description: "at most two tool calls" }] }),
      [event("tool_call"), event("tool_call"), event("tool_call")],
    );
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.details).toContain("made 3 tool call(s)");
  });

  it("passes a run within max_tool_calls", () => {
    const results = gradeTaskConstraints(
      task({ constraints: [{ kind: "max_tool_calls", limit: 2, description: "at most two tool calls" }] }),
      [event("tool_call"), event("capability.started")],
    );
    expect(results[0]!.passed).toBe(true);
  });

  it("fails when a forbidden capability was called", () => {
    const results = gradeTaskConstraints(
      task({ constraints: [{ kind: "no_capability", value: ["shell.exec"], description: "no shell access" }] }),
      [event("capability.started", { capabilityId: "filesystem.read" }), event("capability.started", { capabilityId: "shell.exec" })],
    );
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.details).toContain("shell.exec");
  });

  it("passes when the forbidden capability was never called", () => {
    const results = gradeTaskConstraints(
      task({ constraints: [{ kind: "no_capability", value: ["shell.exec"], description: "no shell access" }] }),
      [event("capability.started", { capabilityId: "filesystem.read" })],
    );
    expect(results[0]!.passed).toBe(true);
  });

  it("counts replans for max_replans", () => {
    const results = gradeTaskConstraints(
      task({ constraints: [{ kind: "max_replans", limit: 1, description: "one replan at most" }] }),
      [event("plan.replan"), event("plan.replan")],
    );
    expect(results[0]!.passed).toBe(false);
  });

  it("fails a malformed constraint instead of passing it", () => {
    // A limit-bearing kind with no limit cannot be evaluated; passing it would
    // report a guarantee nothing checked.
    const results = gradeTaskConstraints(
      task({ constraints: [{ kind: "max_tool_calls", description: "missing limit" }] }),
      [event("tool_call")],
    );
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.details).toContain("declares no numeric limit");
  });

  it("fails an unsupported constraint kind rather than skipping it", () => {
    const results = gradeTaskConstraints(
      task({ constraints: [{ kind: "no_files_outside" as never, value: ["src"], description: "stay inside src/" }] }),
      [event("tool_call")],
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.details).toContain("cannot check it");
  });

  it("contributes no grades for a task that declares no constraints", () => {
    expect(gradeTaskConstraints(task(), [event("tool_call")])).toEqual([]);
  });
});

describe("gradeTask integration", () => {
  it("fails the task when acceptance passes but the evidence is missing", async () => {
    // The point of the feature: a correct-looking artefact produced without any
    // trace of the work is not a pass.
    const grades = await gradeTask(
      task({
        acceptance: [{ type: "trajectory", requiredEvents: [] }],
        expectedEvidence: [{ kind: "capability.finished" }],
      }),
      [event("task.completed")],
      undefined,
    );
    const evidence = grades.filter((grade) => grade.criteria === "evidence");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.passed).toBe(false);
    expect(grades.every((grade) => grade.passed)).toBe(false);
  });
});
