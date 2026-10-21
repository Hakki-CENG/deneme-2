/**
 * P3 — the levels above the DAG.
 *
 * The planner produced a flat list of steps with dependencies. That is enough to
 * execute and not enough to steer: with thirty steps there is no answer to "how
 * far through the goal are we?" or "which part of the objective is at risk?",
 * because the only unit of progress was a single step.
 *
 * The plan asks for
 *
 *   Goal → Strategic Objective → Milestones → DAG → Subtask → Atomic Actions
 *
 * This adds the middle levels *above* the existing DAG rather than replacing it.
 * Steps stay the executable units and the loop keeps walking them unchanged; a
 * milestone is a named group of steps serving one objective. Nothing in the
 * execution path had to be rewritten, which is the point — a hierarchy that
 * required replacing the DAG would have been a rewrite with the same output.
 *
 * The one rule that matters:
 *
 *   **A milestone's status is computed from its steps, never declared.**
 *
 * A milestone that could report "done" on its own would eventually report "done"
 * while its steps had failed, and the report would carry both claims side by
 * side. Deriving it makes that impossible.
 */
import { didRun, isFailure, isSuccess } from "../execution/execution-status.js";
import type { ExecutionStatus } from "../execution/execution-status.js";

export interface PlanMilestone {
  readonly id: string;
  /** The strategic objective this milestone serves, in one sentence. */
  readonly objective: string;
  readonly description: string;
  /** Ids of the steps that make up this milestone. */
  readonly stepIds: readonly string[];
  /** Milestone ids that must complete first. */
  readonly dependsOn?: readonly string[];
}

export type MilestoneStatus =
  | "not_started"
  | "in_progress"
  | "succeeded"
  | "failed"
  | "blocked";

export interface MilestoneState {
  readonly milestone: PlanMilestone;
  readonly status: MilestoneStatus;
  /** Steps that reached the only success status. */
  readonly succeeded: number;
  /** Steps that ran at all, including the ones that failed. */
  readonly ran: number;
  readonly total: number;
  /** Step ids that failed, so the risk is attributable rather than aggregate. */
  readonly failedStepIds: readonly string[];
}

/**
 * Derives a milestone's state from the steps it contains.
 *
 * Ordering matters and is deliberate: a single failure makes the milestone
 * failed even if other steps succeeded, because a milestone is a claim about an
 * objective and a broken part does not become unbroken by having working
 * neighbours.
 */
export function milestoneState(
  milestone: PlanMilestone,
  steps: readonly { id: string; status: ExecutionStatus }[],
): MilestoneState {
  const byId = new Map(steps.map((step) => [step.id, step.status]));
  const owned = milestone.stepIds.map((id) => ({ id, status: byId.get(id) }));
  const known = owned.filter((entry): entry is { id: string; status: ExecutionStatus } => entry.status !== undefined);

  const succeeded = known.filter((entry) => isSuccess(entry.status)).length;
  const ran = known.filter((entry) => didRun(entry.status)).length;
  const failedStepIds = known.filter((entry) => isFailure(entry.status) || entry.status === "blocked").map((e) => e.id);

  // A milestone whose steps were all refused is blocked, not failed: nothing
  // was attempted, so there is no result to have gone wrong. One genuine failure
  // anywhere makes it failed, because "could not run" and "ran and broke" are
  // different facts and the second is the one that needs attention.
  const allBlocked = failedStepIds.length > 0 && failedStepIds.every((id) => byId.get(id) === "blocked");
  const status: MilestoneStatus =
    failedStepIds.length > 0
      ? allBlocked
        ? "blocked"
        : "failed"
      : succeeded === milestone.stepIds.length && milestone.stepIds.length > 0
        ? "succeeded"
        : ran > 0
          ? "in_progress"
          : "not_started";

  return {
    milestone,
    status,
    succeeded,
    ran,
    total: milestone.stepIds.length,
    failedStepIds,
  };
}

/**
 * Checks a hierarchy against the plan it sits on.
 *
 * Returns problems rather than throwing: a planner produces this from a model
 * reply, so the useful answer is the full list of what is wrong.
 */
export function validatePlanHierarchy(
  milestones: readonly PlanMilestone[],
  steps: readonly { id: string }[],
): string[] {
  const problems: string[] = [];
  const stepIds = new Set(steps.map((step) => step.id));
  const milestoneIds = new Set(milestones.map((m) => m.id));
  const claimed = new Map<string, string>();

  if (milestones.length !== milestoneIds.size) problems.push("duplicate milestone ids");

  for (const milestone of milestones) {
    if (milestone.stepIds.length === 0) {
      problems.push(`milestone "${milestone.id}" claims no steps`);
    }
    for (const stepId of milestone.stepIds) {
      if (!stepIds.has(stepId)) {
        problems.push(`milestone "${milestone.id}" refers to unknown step "${stepId}"`);
        continue;
      }
      const owner = claimed.get(stepId);
      // A step in two milestones would let both count it, so progress could
      // exceed 100% and a failure in one could be hidden by the other.
      if (owner !== undefined) {
        problems.push(`step "${stepId}" is claimed by both "${owner}" and "${milestone.id}"`);
      } else {
        claimed.set(stepId, milestone.id);
      }
    }
    for (const dependency of milestone.dependsOn ?? []) {
      if (!milestoneIds.has(dependency)) {
        problems.push(`milestone "${milestone.id}" depends on unknown milestone "${dependency}"`);
      }
    }
  }

  for (const stepId of stepIds) {
    if (!claimed.has(stepId)) problems.push(`step "${stepId}" belongs to no milestone`);
  }

  const cyclic = findMilestoneCycle(milestones);
  if (cyclic !== null) problems.push(`milestone dependency cycle: ${cyclic.join(" -> ")}`);

  return problems;
}

function findMilestoneCycle(milestones: readonly PlanMilestone[]): string[] | null {
  const edges = new Map(milestones.map((m) => [m.id, m.dependsOn ?? []]));
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];

  const visit = (id: string): string[] | null => {
    const marker = state.get(id);
    if (marker === "done") return null;
    if (marker === "visiting") return [...path, id];
    state.set(id, "visiting");
    path.push(id);
    for (const next of edges.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle !== null) return cycle;
    }
    path.pop();
    state.set(id, "done");
    return null;
  };

  for (const milestone of milestones) {
    const cycle = visit(milestone.id);
    if (cycle !== null) return cycle;
  }
  return null;
}

/** Aggregate progress, for the report. Counts, not a percentage dressed as one. */
export function planHierarchyProgress(
  milestones: readonly PlanMilestone[],
  steps: readonly { id: string; status: ExecutionStatus }[],
): {
  readonly milestones: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly inProgress: number;
  readonly notStarted: number;
  readonly stepsSucceeded: number;
  readonly stepsTotal: number;
} {
  const states = milestones.map((milestone) => milestoneState(milestone, steps));
  return {
    milestones: states.length,
    succeeded: states.filter((s) => s.status === "succeeded").length,
    failed: states.filter((s) => s.status === "failed" || s.status === "blocked").length,
    inProgress: states.filter((s) => s.status === "in_progress").length,
    notStarted: states.filter((s) => s.status === "not_started").length,
    stepsSucceeded: states.reduce((sum, s) => sum + s.succeeded, 0),
    stepsTotal: states.reduce((sum, s) => sum + s.total, 0),
  };
}
