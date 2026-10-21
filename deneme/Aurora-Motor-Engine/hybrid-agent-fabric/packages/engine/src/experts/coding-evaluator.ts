/**
 * FAZ 18 closed for the one expert that declares an evaluator category.
 *
 * Measured first, and the measurement changed the size of the job. I had recorded
 * this gap as "four evaluators unbound, and binding them needs domain knowledge".
 * What is actually there: exactly one expert declares `evaluatorCategories`
 * (`experts/coding-expert.ts:156`, category `"coding"`), and there are **zero**
 * `ExpertEvaluator` implementations anywhere in the tree. So the work was not
 * choosing among candidates with domain knowledge — it was writing the one evaluator
 * that the one declared category asks for. That is code, not judgement.
 *
 * The evaluator does not invent a check. It is `acceptCodeWork` from FAZ 6, which
 * already refuses to accept code work unless an external verifier decided it, and
 * which refuses a report built only from non-executed verdicts. Wrapping it means
 * the fabric's answer and the engine's answer cannot disagree, because they are the
 * same function.
 *
 * Three behaviours, and the third is the one that matters:
 *
 *   - an accepted report            -> `pass`
 *   - a report `acceptCodeWork`
 *     refuses                       -> `fail`, with its reason
 *   - **work that is not a
 *     VerificationReport at all**   -> `uncertain`
 *
 * The last is not a failed check. A wrong-shaped input means the check could not
 * run, and reporting that as `fail` would tell an operator the code is broken when
 * what is actually wrong is the thing handed to the evaluator. This is the same
 * distinction FAZ 9, 10 and 18 all encode, arriving in the fabric.
 *
 * The `probe` is real rather than decorative: a report whose only verdicts are
 * non-executed is exactly what `acceptCodeWork` refuses, which is what lets the
 * fabric prove at registration that this evaluator can fail.
 */

import { acceptCodeWork } from "./coding-expert.js";
import type { ExpertEvaluator, ExpertEvaluationOutcome } from "./evaluator-fabric.js";
import type { VerificationReport } from "../execution/verification-factory.js";

/** The expert id and domain `experts/coding-expert.ts` declares. */
export const CODING_EXPERT_ID = "coding";
export const CODING_EXPERT_DOMAIN = "software-engineering";

/** Whether `work` has the shape `acceptCodeWork` needs. */
function isVerificationReport(work: unknown): work is VerificationReport {
  if (typeof work !== "object" || work === null) return false;
  const candidate = work as { results?: unknown; verdict?: unknown };
  return Array.isArray(candidate.results) && typeof candidate.verdict === "string";
}

/**
 * The coding expert's evaluator, backed by the same rule the engine uses to accept
 * code work.
 */
export function codingExpertEvaluator(): ExpertEvaluator {
  return {
    expertId: CODING_EXPERT_ID,
    domain: CODING_EXPERT_DOMAIN,
    name: "external-verification",
    async evaluate(work: unknown): Promise<ExpertEvaluationOutcome> {
      if (!isVerificationReport(work)) {
        return {
          verdict: "uncertain",
          detail:
            "the work handed to this evaluator is not a VerificationReport, so the check could not run. " +
            "That is a gap in what was supplied, not a verdict about the code",
        };
      }
      const acceptance = acceptCodeWork(work);
      return {
        verdict: acceptance.accepted ? "pass" : "fail",
        detail: acceptance.reason,
      };
    },
    probe: {
      // A report carrying only non-executed verdicts. acceptCodeWork refuses it,
      // which is what proves this evaluator is capable of failing.
      // V4_unverifiable is deliberately not in EXTERNAL_VERDICT_TIERS
      // (V1_formal and V2_empirical are), so this is a report whose only verdict
      // came from something that never ran.
      work: {
        verdict: "pass",
        results: [
          {
            verdict: "pass",
            tier: "V4_unverifiable",
            verifier: "claimed",
            evidence: "the author says it works",
            confidence: 0.2,
            scope: "goal",
          },
        ],
        strongestTier: undefined,
        autonomy: "high",
        status: "succeeded",
        summary: "a report built from opinions rather than from anything that ran",
      } satisfies VerificationReport,
      why: "a report whose only verdicts are non-executed must be refused: agreement between evaluators is not an exit code",
    },
  };
}
