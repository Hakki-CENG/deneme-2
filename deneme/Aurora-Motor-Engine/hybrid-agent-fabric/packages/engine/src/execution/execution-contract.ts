/**
 * P1.1 — the single execution contract.
 *
 * Every task is supposed to travel the same road:
 *
 *   Goal → Understand → Recall → Plan → Route → Execute → Observe → Verify
 *        → Recover → Learn
 *
 * `UnifiedExecutionLoop` is that road, and it is constructed in exactly one
 * place (`engine.ts`), so the loop itself is not the problem. The problem this
 * module exists to make visible is that *other* execution paths exist and most
 * of them travel only part of the road. Measured on the conversational turn
 * (`runtime/session-actor.ts`, 1091 lines): the words `understand`, `recall` and
 * `learn` appear **zero** times. A user talking to Aurora therefore runs a path
 * that routes, executes and observes — and never verifies, recalls or learns.
 *
 * That may be the right design for a chat turn. What is not acceptable is that
 * nothing *said so*. An absent stage and a skipped stage looked identical from
 * outside, so a report claiming success carried no indication that no verifier
 * had run.
 *
 * So the contract is now a value, not a diagram: a run records which stages it
 * performed, and the skipped ones are named. A reader can tell "we verified" from
 * "we did not verify" without reading the source.
 */

/** The ten stages, in the order a task travels them. */
export const CONTRACT_STAGES = [
  "understand",
  "recall",
  "plan",
  "route",
  "execute",
  "observe",
  "verify",
  "recover",
  "learn",
] as const;

export type ContractStage = (typeof CONTRACT_STAGES)[number];

export interface ContractCoverage {
  /** Stages this run actually performed, in contract order. */
  readonly performed: readonly ContractStage[];
  /** Stages it did not, in contract order. Named, not implied. */
  readonly skipped: readonly ContractStage[];
  /** `performed / 9`. A convenience, never a quality score. */
  readonly coverage: number;
}

/**
 * Which of the nine stages a run covered.
 *
 * Unknown strings are rejected rather than ignored: a stage name that does not
 * exist in the contract is a bug in the caller, and silently dropping it would
 * report full coverage for a run that performed nothing.
 */
export function contractCoverage(performed: Iterable<string>): ContractCoverage {
  const seen = new Set<ContractStage>();
  for (const stage of performed) {
    if (!isContractStage(stage)) {
      throw new Error(`"${stage}" is not a contract stage; expected one of: ${CONTRACT_STAGES.join(", ")}`);
    }
    seen.add(stage);
  }
  const done = CONTRACT_STAGES.filter((stage) => seen.has(stage));
  const skipped = CONTRACT_STAGES.filter((stage) => !seen.has(stage));
  return { performed: done, skipped, coverage: done.length / CONTRACT_STAGES.length };
}

export function isContractStage(value: string): value is ContractStage {
  return (CONTRACT_STAGES as readonly string[]).includes(value);
}

/**
 * The stages a path is *expected* to perform.
 *
 * A conversational turn is not a task: it has no goal to decompose and nothing to
 * promote into memory. Declaring that up front is what keeps `skipped` honest —
 * otherwise every chat turn would look like a task that failed to do six things.
 */
export const TASK_CONTRACT: readonly ContractStage[] = CONTRACT_STAGES;
export const CONVERSATION_CONTRACT: readonly ContractStage[] = ["route", "execute", "observe"];

/**
 * Coverage measured against the stages this kind of run was expected to perform.
 *
 * This is the number worth reading: a conversation that routes, executes and
 * observes is 3/3, not 3/9.
 */
export function coverageAgainstExpected(
  performed: Iterable<string>,
  expected: readonly ContractStage[],
): { performed: readonly ContractStage[]; missing: readonly ContractStage[]; coverage: number } {
  const covered = contractCoverage(performed);
  const performedSet = new Set(covered.performed);
  const missing = expected.filter((stage) => !performedSet.has(stage));
  return {
    performed: covered.performed,
    missing,
    coverage: expected.length === 0 ? 0 : (expected.length - missing.length) / expected.length,
  };
}
