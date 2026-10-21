/**
 * FAZ 14 1/3 — over a long task, every step can look right and the result can
 * still not be what was asked for.
 *
 * Measured first. "replan" appears in 14 files, "reflect" in 22, "checkpoint" in
 * 8, "rollback" in 32 — the replan/reflect/checkpoint/rollback half of this phase
 * substantially exists. **"goal drift" appears in zero files**, and so does "long
 * horizon". The one mechanism FAZ 14 names that the engine does not have is the
 * one that notices the task stopped being the task.
 *
 * Drift is the long-horizon failure mode the others cannot catch. A checkpoint
 * records where you were; a rollback returns you there; a replan picks a new
 * route. All of them assume the destination is still the destination. Over a
 * hundred steps, each locally reasonable, the work can arrive somewhere nobody
 * asked for — and every one of those mechanisms would report success on the way.
 *
 * The honest constraint, and the reason this is small: drift cannot be detected
 * by inspecting how a step feels. It can only be measured against something
 * explicit. So this measures a trajectory against stated goal criteria, and
 * refuses to answer when there is nothing to measure against.
 *
 * Five rules:
 *
 *   1. A goal with no criteria is `unmeasurable`, never "on-goal". You cannot
 *      drift from something that was never specified, and reporting "on-goal"
 *      would be a claim dressed as a measurement.
 *   2. A step naming a criterion that does not exist is an error, not a trace. It
 *      is worse than a step naming nothing: it asserts a connection that is not
 *      there, and silently ignoring it would launder that assertion.
 *   3. Unaccounted steps are counted and reported with the proportion, never
 *      quietly absorbed.
 *   4. A failed step is not drift. Drift is about direction, not failure —
 *      counting failures as drift would make a task that failed honestly read as
 *      one that wandered off, and send a replan after the wrong problem.
 *   5. A criterion no step serves is an uncovered goal. Drift has two directions:
 *      work that serves nothing, and a goal nothing serves. Only the first is
 *      usually noticed.
 */

export interface GoalCriterion {
  readonly id: string;
  readonly statement: string;
}

export interface Goal {
  readonly statement: string;
  readonly criteria: readonly GoalCriterion[];
}

export interface TrajectoryStep {
  readonly id: string;
  readonly description: string;
  /** Which goal criterion this step serves. Absent means unaccounted for. */
  readonly servesCriterion?: string;
  readonly succeeded: boolean;
}

export type DriftVerdict = "on-goal" | "drifting" | "unmeasurable";

export interface DriftReport {
  readonly goal: string;
  readonly verdict: DriftVerdict;
  readonly steps: number;
  /** Steps that serve a stated criterion. */
  readonly accounted: number;
  /** Steps that serve nothing stated. */
  readonly unaccounted: number;
  /** Steps naming a criterion that does not exist. */
  readonly invalidTraces: readonly string[];
  /** Criteria no step serves. */
  readonly uncoveredCriteria: readonly GoalCriterion[];
  /** Failed steps, reported separately because they are not drift. */
  readonly failures: number;
  readonly detail: string;
}

/**
 * Measures a trajectory against a goal.
 *
 * `traceThreshold` is the proportion of steps that must be accounted for before
 * the trajectory counts as on-goal. It defaults to 1: a step that serves nothing
 * is a step nobody can justify, and a long task is exactly where "mostly on-goal"
 * becomes "somewhere else" one hundred steps later.
 */
export function detectGoalDrift(
  goal: Goal,
  trajectory: readonly TrajectoryStep[],
  options: { traceThreshold?: number } = {},
): DriftReport {
  const traceThreshold = options.traceThreshold ?? 1;
  const base = {
    goal: goal.statement,
    steps: trajectory.length,
    failures: trajectory.filter((step) => !step.succeeded).length,
  };

  // Rule 1: nothing to measure against.
  if (goal.criteria.length === 0) {
    return {
      ...base,
      verdict: "unmeasurable",
      accounted: 0,
      unaccounted: trajectory.length,
      invalidTraces: [],
      uncoveredCriteria: [],
      detail:
        "the goal states no criteria, so drift cannot be measured — this is an absence of a reference, not evidence that the work is on-goal",
    };
  }

  const criterionIds = new Set(goal.criteria.map((criterion) => criterion.id));

  // Rule 2: a trace to a criterion that does not exist is an error.
  const invalidTraces = trajectory
    .filter((step) => step.servesCriterion !== undefined && !criterionIds.has(step.servesCriterion))
    .map((step) => `${step.id} claims to serve "${step.servesCriterion}", which the goal does not state`);

  const accountedSteps = trajectory.filter(
    (step) => step.servesCriterion !== undefined && criterionIds.has(step.servesCriterion),
  );
  const served = new Set(accountedSteps.map((step) => step.servesCriterion));

  // Rule 5: the goal nobody worked toward.
  const uncoveredCriteria = goal.criteria.filter((criterion) => !served.has(criterion.id));

  // Rule 3: steps serving nothing stated. Invalid traces do not count as
  // accounted — an assertion of a link that is not there is not a link.
  const unaccounted = trajectory.length - accountedSteps.length;
  const accountedRatio = trajectory.length === 0 ? 0 : accountedSteps.length / trajectory.length;

  if (trajectory.length === 0) {
    return {
      ...base,
      verdict: "unmeasurable",
      accounted: 0,
      unaccounted: 0,
      invalidTraces,
      uncoveredCriteria,
      detail: "nothing has been executed yet, so there is no trajectory to measure",
    };
  }

  const problems: string[] = [];
  if (invalidTraces.length > 0) problems.push(`${invalidTraces.length} step(s) trace to criteria the goal does not state`);
  if (unaccounted > 0) {
    problems.push(`${unaccounted}/${trajectory.length} step(s) serve no stated criterion (${Math.round((1 - accountedRatio) * 100)}% of the trajectory)`);
  }
  if (uncoveredCriteria.length > 0) {
    problems.push(`${uncoveredCriteria.length} criterion/criteria have no step serving them: ${uncoveredCriteria.map((c) => c.statement).join("; ")}`);
  }

  const drifting =
    invalidTraces.length > 0 || accountedRatio < traceThreshold || uncoveredCriteria.length > 0;

  return {
    ...base,
    verdict: drifting ? "drifting" : "on-goal",
    accounted: accountedSteps.length,
    unaccounted,
    invalidTraces,
    uncoveredCriteria,
    detail:
      problems.length > 0
        ? problems.join("; ") +
          (base.failures > 0
            ? `; ${base.failures} step(s) failed, which is recorded separately because failure is not drift`
            : "")
        : `every step traces to a stated criterion and every criterion has a step serving it`,
  };
}

/**
 * Whether a drift report can be acted on.
 *
 * `unmeasurable` is not a pass. Treating it as one would let a goal nobody wrote
 * down certify any trajectory at all.
 */
export function isDriftReportActionable(report: DriftReport): boolean {
  return report.verdict !== "unmeasurable";
}
