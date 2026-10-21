/**
 * FAZ 9 3/3 — turning a plan's numeric claims into recomputation.
 *
 * 1/3 could recompute and 2/3 made it a capability, but a task still had to ask
 * for recomputation by hand. This is the missing link: a plan step may declare a
 * number it will produce, and this turns those declarations into claims and
 * checks the verifier already understands.
 *
 * The declaration lives on the step (`TaskPlanStep.numericExpectation`,
 * `PlannedTaskStep.numericExpectation`) and validation rejects a value with no
 * command, so by the time it reaches here a claim always has a way to be
 * reproduced. What is *not* guaranteed is that the model declares anything at
 * all — an ordinary plan has no numeric expectations, and that is fine: there is
 * then nothing to recompute and nothing is claimed to have been checked.
 *
 * This module runs no command itself. It takes a runner, so the same derivation
 * works against the sandbox in production and a stub in a test.
 */

import type { NumericExpectation } from "../execution/task-context.js";
import type {
  ComputationVerification,
  ComputationVerificationOptions,
  NumericCheck,
  NumericClaim,
} from "./computation-verifier.js";
import { verifyNumericClaims } from "./computation-verifier.js";

/** What this needs from a step, so planned and executed steps both fit. */
export interface StepWithExpectation {
  /** `name` on a planned step, `id` on an executed one. */
  readonly name?: string | undefined;
  readonly id?: string | undefined;
  readonly description?: string | undefined;
  readonly numericExpectation?: NumericExpectation | undefined;
}

/** Runs a command and returns the number it printed. */
export type NumericRunner = (command: string) => Promise<number>;

/** A step that carries a claim, with the id used to key it. */
export interface DeclaredNumericClaim {
  readonly stepId: string;
  readonly stepDescription: string;
  readonly expectation: NumericExpectation;
}

/**
 * The numeric claims a plan actually declares.
 *
 * Steps without an expectation are absent from the result rather than present as
 * unchecked, because "this step claimed nothing" is not a finding.
 */
export function declaredNumericClaims(steps: readonly StepWithExpectation[]): readonly DeclaredNumericClaim[] {
  const out: DeclaredNumericClaim[] = [];
  for (const step of steps) {
    if (step.numericExpectation === undefined) continue;
    const stepId = step.name ?? step.id;
    if (stepId === undefined || stepId.length === 0) continue;
    out.push({
      stepId,
      stepDescription: step.description ?? stepId,
      expectation: step.numericExpectation,
    });
  }
  return out;
}

/** Builds the verifier's claims from what the plan declared. */
export function numericClaimsFromSteps(steps: readonly StepWithExpectation[]): NumericClaim[] {
  return declaredNumericClaims(steps).map((declared) => ({
    id: declared.stepId,
    statement: declared.stepDescription,
    value: declared.expectation.value,
    // The step asserted this; the command decides whether it holds.
    producedBy: "plan declaration",
  }));
}

/** Builds the verifier's checks, routing each step's command through `run`. */
export function numericChecksFromSteps(
  steps: readonly StepWithExpectation[],
  run: NumericRunner,
): NumericCheck[] {
  return declaredNumericClaims(steps).map((declared) => ({
    claimId: declared.stepId,
    ...(declared.expectation.tolerance === undefined ? {} : { tolerance: declared.expectation.tolerance }),
    recompute: () => run(declared.expectation.command),
  }));
}

/**
 * Recomputes every number a plan declared.
 *
 * A plan that declared nothing yields zero claims, which the verifier reports as
 * `uncertain` with "nothing was claimed" — not as a pass. Nothing here lets an
 * unchecked plan look verified.
 */
export async function verifyPlanNumbers(
  steps: readonly StepWithExpectation[],
  run: NumericRunner,
  options: ComputationVerificationOptions = {},
): Promise<ComputationVerification> {
  return verifyNumericClaims(numericClaimsFromSteps(steps), numericChecksFromSteps(steps, run), options);
}
