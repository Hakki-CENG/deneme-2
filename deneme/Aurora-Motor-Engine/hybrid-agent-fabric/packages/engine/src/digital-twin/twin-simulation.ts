/**
 * FAZ 23 1/3 — the three questions a digital twin is asked, separated by kind.
 *
 * Measured first. `digital-twin/digital-twin-service.ts` is 346 lines and every
 * method is add/get/update/record: `createTwin`, `addProject`, `addTool`,
 * `addWorkflow`, `addConstraint`, `updatePreferences`. `sync()` already throws
 * rather than returning `{ synced: true }` for a sync that contacted nothing.
 * maturity.ts records the module as `experimental` and names the gap exactly:
 * "Maintains a mirrored state record; no simulation loop … Needs an actual
 * simulation/prediction loop before the name is honest."
 *
 * FAZ 23 asks for three questions. They are not the same kind of thing, and
 * reporting them in one voice is how a guess comes to look like arithmetic:
 *
 *   1. "How is my workload this week?"   — a SUM over recorded estimates.
 *   2. "Where is the delay risk?"        — a THRESHOLD over recorded dates.
 *   3. "If I take this decision, what
 *       changes next week?"              — a COUNTERFACTUAL, which needs a
 *                                          transition model.
 *
 * The first two are computable from what the twin already stores: `WorkflowStep`
 * carries `estimatedMinutes`, and `Deadline` carries a `date` and a `priority`.
 * The third is not, and this is where the honest answer differs from the
 * plausible one. FAZ 22 built a transition model, but nothing feeds it
 * (state, action, next-state) triples, so there are no observed transitions to
 * project forward. Inventing them would be a forecast wearing a simulation's
 * clothes.
 *
 * Five rules:
 *
 *   1. A workload figure is a sum over recorded steps and names the records it
 *      summed, so the number can be audited rather than trusted.
 *   2. Delay risk is computed from a deadline's date against a supplied `now`,
 *      never read from its declared `status`. The twin stores
 *      `status: "upcoming" | "at_risk" | "overdue" | "met"` on every deadline, and
 *      nothing checked it against the date — so a contradiction between the two is
 *      reported, not resolved silently in favour of either.
 *   3. A counterfactual with no transition model returns `cannot-simulate` and
 *      names what is missing. It never returns a fabricated forecast.
 *   4. Each answer states its kind (`sum`, `threshold`, `counterfactual`) and its
 *      evidence, so a reader can see which numbers were counted and which were not
 *      computed at all.
 *   5. This does not make the twin's name honest. There is still no simulation loop
 *      over real data, and `digital-twin` stays `experimental` in the registry.
 *
 * Also recorded rather than papered over: the state model holds User, Projects,
 * Tools, Workflows and Constraints. FAZ 23 also asks for Tasks, Calendar, Goals,
 * Resources and Devices, and those are not in `DigitalTwin`. Adding fields would
 * be easy; they would be empty, and an empty field reads as a modelled concept that
 * is not modelled.
 */

export type AnswerKind = "sum" | "threshold" | "counterfactual";

export interface WorkloadLine {
  readonly workflowId: string;
  readonly stepId: string;
  readonly stepName: string;
  readonly estimatedMinutes: number;
}

export interface WorkloadAnswer {
  readonly kind: "sum";
  readonly question: "workload";
  readonly totalMinutes: number;
  readonly steps: readonly WorkloadLine[];
  readonly evidence: string;
}

export type DeadlineRisk = "overdue" | "due-soon" | "on-track";

export interface DeadlineFinding {
  readonly deadlineId: string;
  readonly title: string;
  readonly date: string;
  readonly priority: string;
  readonly risk: DeadlineRisk;
  readonly daysFromNow: number;
  /** The twin's own `status` field, when it disagrees with the date. */
  readonly statusContradiction?: string;
}

export interface DelayRiskAnswer {
  readonly kind: "threshold";
  readonly question: "delay-risk";
  readonly findings: readonly DeadlineFinding[];
  /** Deadlines whose declared status contradicts their date. */
  readonly contradictions: number;
  readonly evidence: string;
}

export interface CannotSimulateAnswer {
  readonly kind: "counterfactual";
  readonly question: "counterfactual";
  readonly simulated: false;
  readonly reason: "no-observed-transitions";
  readonly missing: string;
  readonly evidence: string;
}

export type TwinAnswer = WorkloadAnswer | DelayRiskAnswer | CannotSimulateAnswer;

export interface TwinWorkflow {
  readonly id: string;
  readonly steps: readonly { id: string; name: string; estimatedMinutes: number }[];
}

export interface TwinDeadline {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly priority?: string;
  readonly status?: "upcoming" | "at_risk" | "overdue" | "met";
}

/** A deadline this many days out or sooner is "due soon". */
export const DUE_SOON_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/**
 * Answers the workload question as a sum.
 *
 * Returns the lines it summed rather than only the total: a total nobody can
 * decompose is a number to nod at, not a number to act on.
 */
export function answerWorkload(workflows: readonly TwinWorkflow[]): WorkloadAnswer {
  const steps: WorkloadLine[] = [];
  for (const workflow of workflows) {
    for (const step of workflow.steps) {
      steps.push({
        workflowId: workflow.id,
        stepId: step.id,
        stepName: step.name,
        estimatedMinutes: step.estimatedMinutes,
      });
    }
  }
  const totalMinutes = steps.reduce((sum, step) => sum + step.estimatedMinutes, 0);
  return {
    kind: "sum",
    question: "workload",
    totalMinutes,
    steps,
    evidence:
      steps.length === 0
        ? "no workflow steps are recorded, so this is a sum over an empty set rather than a week with no work"
        : `summed estimatedMinutes over ${steps.length} recorded step(s) across ${workflows.length} workflow(s)`,
  };
}

/**
 * Answers the delay-risk question from dates, not from declared status.
 *
 * `now` is supplied rather than read from the clock, so a caller can ask about a
 * date in the past without the answer changing under it.
 */
export function answerDelayRisk(
  deadlines: readonly TwinDeadline[],
  now: Date,
  options: { dueSoonDays?: number } = {},
): DelayRiskAnswer {
  const dueSoonDays = options.dueSoonDays ?? DUE_SOON_DAYS;
  const findings: DeadlineFinding[] = [];
  let contradictions = 0;

  for (const deadline of deadlines) {
    const date = new Date(deadline.date);
    if (Number.isNaN(date.getTime())) {
      // An unparseable date is not "on track"; it is a record that cannot be
      // evaluated, and reporting it as safe would be the error this rule exists
      // to prevent.
      findings.push({
        deadlineId: deadline.id,
        title: deadline.title,
        date: deadline.date,
        priority: deadline.priority ?? "unspecified",
        risk: "overdue",
        daysFromNow: Number.NaN,
        statusContradiction: `the date "${deadline.date}" could not be parsed, so no risk could be computed and it is reported as the worst case rather than as on-track`,
      });
      contradictions += 1;
      continue;
    }

    const daysFromNow = Math.floor((date.getTime() - now.getTime()) / MS_PER_DAY);
    const risk: DeadlineRisk = daysFromNow < 0 ? "overdue" : daysFromNow <= dueSoonDays ? "due-soon" : "on-track";

    const contradiction = contradictingStatus(deadline.status, risk, daysFromNow);
    if (contradiction !== undefined) contradictions += 1;

    findings.push({
      deadlineId: deadline.id,
      title: deadline.title,
      date: deadline.date,
      priority: deadline.priority ?? "unspecified",
      risk,
      daysFromNow,
      ...(contradiction === undefined ? {} : { statusContradiction: contradiction }),
    });
  }

  const atRisk = findings.filter((finding) => finding.risk !== "on-track");
  return {
    kind: "threshold",
    question: "delay-risk",
    findings: [...atRisk, ...findings.filter((finding) => finding.risk === "on-track")],
    contradictions,
    evidence:
      `${atRisk.length} of ${deadlines.length} deadline(s) are overdue or due within ${dueSoonDays} days, computed from dates against ${now.toISOString()}` +
      (contradictions > 0
        ? `; ${contradictions} record(s) carry a declared status that contradicts their date and are reported rather than resolved`
        : ""),
  };
}

/**
 * Answers a counterfactual.
 *
 * Today the answer is always `cannot-simulate`, and that is the point: a counterfactual
 * needs a transition model, FAZ 22 has one, and nothing observes transitions for it.
 * When a source of observed transitions exists, this is where it plugs in.
 */
export function answerCounterfactual(
  _decision: string,
  _transitions: readonly { fromState: string; action: string; toState: string }[] = [],
): CannotSimulateAnswer {
  return {
    kind: "counterfactual",
    question: "counterfactual",
    simulated: false,
    reason: "no-observed-transitions",
    missing:
      "a source of observed (state, action, next-state) transitions. DigitalTwinService records projects, workflows and deadlines but emits no transitions, so there is nothing to project forward",
    evidence:
      "refused rather than guessed. A fabricated forecast would be indistinguishable from a simulated one to anyone reading the answer",
  };
}

/**
 * Whether a declared status contradicts the risk computed from the date.
 *
 * Returns `undefined` when they agree, so agreement is silent and disagreement is
 * the thing that surfaces.
 */
function contradictingStatus(
  status: TwinDeadline["status"],
  risk: DeadlineRisk,
  daysFromNow: number,
): string | undefined {
  if (status === undefined) return undefined;
  const saysBad = status === "at_risk" || status === "overdue";
  const isBad = risk !== "on-track";
  if (saysBad === isBad) return undefined;
  if (status === "met" && isBad) {
    return `declared "met" but the date is ${daysFromNow} day(s) from now, which computes as ${risk}`;
  }
  return `declared "${status}" but the date computes as ${risk} (${daysFromNow} day(s) from now)`;
}
