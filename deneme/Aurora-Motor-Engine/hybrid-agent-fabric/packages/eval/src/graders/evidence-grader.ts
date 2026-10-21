/**
 * Evidence and constraint grading.
 *
 * Two gaps in the original grader, both of which let a run look better than it
 * was:
 *
 *   1. Acceptance criteria only inspect the final artefact. A task can be passed
 *      by an agent that guessed the answer and never opened the repository.
 *      `expectedEvidence` fixes that by requiring the run to have left traces of
 *      the work behind.
 *   2. Nothing checked *how* a task was solved. Crossing a hard limit — calling
 *      a capability the task forbade, or replanning forty times — was invisible
 *      as long as the artefact came out right.
 *
 * Both are graded here, inside `gradeTask`, so they share the "graded exactly
 * once" property and surface as ordinary `GradeResult` entries in the report.
 *
 * The rule carried over from the schema work: **a check this runner cannot
 * perform fails the grade rather than passing it.** An unenforceable constraint
 * that reports `passed: true` is worse than no constraint, because the report
 * then claims a guarantee nobody provided.
 */
import type { EvalTask, ExpectedEvidence, GradeResult, TaskConstraint, TrajectoryEvent } from "../tasks/types.js";

/**
 * Whether an event's kind matches an evidence kind.
 *
 * The trajectory mapper prefixes engine events with `bus.` (see
 * `engine-eval-trajectory.ts`), while the runner's own events are unprefixed.
 * Matching on the suffix lets a task say `capability.finished` and work against
 * either source, instead of forcing task authors to know which one produced it.
 */
function kindMatches(eventKind: string, wanted: string): boolean {
  return eventKind === wanted || eventKind.endsWith(`.${wanted}`);
}

function payloadText(event: TrajectoryEvent): string {
  if (event.payload === undefined || event.payload === null) return "";
  return typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload);
}

function capabilityIdOf(event: TrajectoryEvent): string | undefined {
  const payload = event.payload as { capabilityId?: unknown } | undefined;
  return payload && typeof payload === "object" && typeof payload.capabilityId === "string"
    ? payload.capabilityId
    : undefined;
}

/** Grade every `expectedEvidence` entry the task declares. */
export function gradeExpectedEvidence(task: EvalTask, events: TrajectoryEvent[]): GradeResult[] {
  const expected: ExpectedEvidence[] = task.expectedEvidence ?? [];
  return expected.map((entry) => {
    const matching = events.filter((event) => {
      if (!kindMatches(event.kind, entry.kind)) return false;
      if (entry.contains === undefined) return true;
      return payloadText(event).includes(entry.contains);
    });
    const required = entry.minOccurrences ?? 1;
    const passed = matching.length >= required;
    return {
      criteria: "evidence",
      passed,
      score: passed ? 1 : 0,
      details: passed
        ? `found ${matching.length} "${entry.kind}" event(s)${entry.contains ? ` containing ${JSON.stringify(entry.contains)}` : ""}`
        : `expected at least ${required} "${entry.kind}" event(s)${entry.contains ? ` containing ${JSON.stringify(entry.contains)}` : ""}, found ${matching.length}`,
      evidence: { kind: entry.kind, found: matching.length, required },
    };
  });
}

/** Grade every hard constraint the task declares. */
export function gradeTaskConstraints(task: EvalTask, events: TrajectoryEvent[]): GradeResult[] {
  const constraints: TaskConstraint[] = task.constraints ?? [];
  return constraints.map((constraint) => gradeConstraint(constraint, events));
}

function gradeConstraint(constraint: TaskConstraint, events: TrajectoryEvent[]): GradeResult {
  const fail = (details: string, extra?: unknown): GradeResult => ({
    criteria: "constraint",
    passed: false,
    score: 0,
    details,
    ...(extra === undefined ? {} : { evidence: extra }),
  });
  const pass = (details: string, extra?: unknown): GradeResult => ({
    criteria: "constraint",
    passed: true,
    score: 1,
    details,
    ...(extra === undefined ? {} : { evidence: extra }),
  });

  switch (constraint.kind) {
    case "max_tool_calls": {
      if (typeof constraint.limit !== "number") {
        return fail(`constraint "${constraint.description}" is max_tool_calls but declares no numeric limit`);
      }
      // `tool_call` is what the engine emits per invocation; `capability.started`
      // is counted too so a run that only reports capability events is not
      // silently treated as having made no calls.
      const calls = events.filter(
        (event) => kindMatches(event.kind, "tool_call") || kindMatches(event.kind, "capability.started"),
      ).length;
      return calls <= constraint.limit
        ? pass(`${calls} tool call(s) within the limit of ${constraint.limit}`, { calls, limit: constraint.limit })
        : fail(`${constraint.description}: made ${calls} tool call(s), limit is ${constraint.limit}`, {
            calls,
            limit: constraint.limit,
          });
    }

    case "max_replans": {
      if (typeof constraint.limit !== "number") {
        return fail(`constraint "${constraint.description}" is max_replans but declares no numeric limit`);
      }
      const replans = events.filter((event) => event.kind.toLowerCase().includes("replan")).length;
      return replans <= constraint.limit
        ? pass(`${replans} replan(s) within the limit of ${constraint.limit}`, { replans, limit: constraint.limit })
        : fail(`${constraint.description}: replanned ${replans} time(s), limit is ${constraint.limit}`, {
            replans,
            limit: constraint.limit,
          });
    }

    case "no_capability": {
      const forbidden = constraint.value ?? [];
      if (forbidden.length === 0) {
        return fail(`constraint "${constraint.description}" is no_capability but lists no capability ids`);
      }
      const used = events
        .filter((event) => kindMatches(event.kind, "capability.started") || kindMatches(event.kind, "capability.finished"))
        .map(capabilityIdOf)
        .filter((id): id is string => id !== undefined && forbidden.includes(id));
      return used.length === 0
        ? pass(`none of the forbidden capabilities were called`, { forbidden })
        : fail(`${constraint.description}: called forbidden capability ${[...new Set(used)].join(", ")}`, {
            forbidden,
            used: [...new Set(used)],
          });
    }

    default:
      // Never pass an unknown kind: the report would otherwise claim a guarantee
      // that nothing checked.
      return fail(`unsupported constraint kind ${JSON.stringify(constraint.kind)} — this runner cannot check it`);
  }
}
