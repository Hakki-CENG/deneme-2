/**
 * FAZ 9 1/3 — verifying computed results without asking a model.
 *
 * FAZ 9's line is the one that matters: "LLM tek karar verici olmamalı; harici
 * doğrulayıcı araçlar şart." For code, `verify.run` already executes the
 * project's own build and tests. For a *number* — a statistic, a solved
 * equation, a fitted coefficient — nothing did that. A model could state a
 * result and the report would carry it.
 *
 * This recomputes. A claim is paired with code that produces the value again,
 * the code runs, and the two are compared. The model's answer is never the
 * evidence; only the executed result is.
 *
 * Measured first: there is no Python, pandas, sympy or notebook support in this
 * repository — no CAS, no symbolic verifier, no proof checker. Those are gaps
 * and are recorded as such rather than declared by name. What this provides is
 * the numeric half, which needs no external toolchain: it takes a function that
 * computes, and it can run here.
 *
 * Five rules:
 *
 *   1. A claim with no check is `no-check`, never verified. That is the plan's
 *      requirement made concrete: without a computation, the model's word is
 *      all there is, and it does not decide.
 *   2. A check that throws is `did-not-run`. Not a mismatch — the value was
 *      never produced — and certainly not a pass.
 *   3. Tolerance is stated, never assumed. With none supplied the comparison is
 *      exact and the evidence says so; an unstated epsilon that quietly absorbs
 *      a wrong answer is worse than no tolerance at all.
 *   4. NaN never verifies, including against a NaN claim. NaN === NaN is false,
 *      and "the computation produced nothing" is not agreement.
 *   5. Run more than once and the results must agree. `reproduced-inconsistently`
 *      is its own outcome, because a number that changes between runs is not a
 *      result however close it is to the claim.
 *
 * `computationVerifier` wraps this as a `V2_empirical` verifier, the same tier
 * `empiricalVerifier` uses. That is deliberate: V2 counts as external evidence
 * to FAZ 6's `acceptCodeWork`, so a recomputation can carry a claim that a
 * consensus of models cannot.
 */

import { empiricalVerifier, type Verifier, type VerifierScope } from "../execution/verification-factory.js";

export interface NumericClaim {
  readonly id: string;
  /** What is being claimed, in words a reader can check the number against. */
  readonly statement: string;
  readonly value: number;
  /** How the value was obtained. Recorded, not trusted. */
  readonly producedBy: string;
}

export interface NumericCheck {
  readonly claimId: string;
  /** Recomputes the value. Must actually compute, not return the claim. */
  readonly recompute: () => Promise<number>;
  /**
   * Accepted difference. Absent means exact comparison, and the evidence says
   * so — an unstated tolerance is how a wrong number passes.
   */
  readonly tolerance?: { readonly absolute?: number; readonly relative?: number };
}

export type NumericClaimOutcome =
  | "verified"
  | "mismatch"
  | "did-not-run"
  | "no-check"
  | "reproduced-inconsistently";

export interface NumericClaimResult {
  readonly claimId: string;
  readonly outcome: NumericClaimOutcome;
  readonly claimed: number;
  readonly computed: number[];
  readonly evidence: string;
}

export interface ComputationVerificationOptions {
  /** How many times to recompute. Above 1, the runs must agree. */
  readonly runs?: number;
  /** Default tolerance for checks that do not state one. Still stated in evidence. */
  readonly defaultTolerance?: { readonly absolute?: number; readonly relative?: number };
}

export interface ComputationVerification {
  readonly results: readonly NumericClaimResult[];
  readonly verified: number;
  readonly mismatched: number;
  readonly didNotRun: number;
  readonly noCheck: number;
  readonly inconsistent: number;
  /** `pass` only when every claim recomputed and matched. */
  readonly verdict: "pass" | "fail" | "uncertain";
  readonly summary: string;
}

/**
 * Recomputes every claimed number and compares.
 *
 * Claims are the unit of reporting: a claim with no check appears in the results
 * as `no-check` rather than disappearing, because a missing check is the finding.
 */
export async function verifyNumericClaims(
  claims: readonly NumericClaim[],
  checks: readonly NumericCheck[],
  options: ComputationVerificationOptions = {},
): Promise<ComputationVerification> {
  const runs = Math.max(1, options.runs ?? 1);
  const results: NumericClaimResult[] = [];

  for (const claim of claims) {
    const check = checks.find((item) => item.claimId === claim.id);

    if (check === undefined) {
      results.push({
        claimId: claim.id,
        outcome: "no-check",
        claimed: claim.value,
        computed: [],
        evidence: `no recomputation was supplied for "${claim.statement}"; the model's word is all there is, and it does not decide`,
      });
      continue;
    }

    const computed: number[] = [];
    let failure: string | undefined;
    for (let run = 0; run < runs; run += 1) {
      try {
        computed.push(await check.recompute());
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        break;
      }
    }

    if (failure !== undefined || computed.length === 0) {
      results.push({
        claimId: claim.id,
        outcome: "did-not-run",
        claimed: claim.value,
        computed,
        evidence: `recomputation did not produce a value${failure === undefined ? "" : `: ${failure}`}`,
      });
      continue;
    }

    // Rule 5: a number that moves between runs is not a result.
    if (new Set(computed).size > 1) {
      results.push({
        claimId: claim.id,
        outcome: "reproduced-inconsistently",
        claimed: claim.value,
        computed,
        evidence: `${runs} runs produced different values: ${computed.join(", ")}`,
      });
      continue;
    }

    const value = computed[0] as number;

    // Rule 4: NaN never verifies, not even against a NaN claim.
    if (!Number.isFinite(value)) {
      results.push({
        claimId: claim.id,
        outcome: "mismatch",
        claimed: claim.value,
        computed,
        evidence: `recomputation produced ${value}, which is not a finite number`,
      });
      continue;
    }
    if (!Number.isFinite(claim.value)) {
      results.push({
        claimId: claim.id,
        outcome: "mismatch",
        claimed: claim.value,
        computed,
        evidence: `the claimed value ${claim.value} is not a finite number, so nothing can confirm it`,
      });
      continue;
    }

    const tolerance = check.tolerance ?? options.defaultTolerance;
    const matches = withinTolerance(claim.value, value, tolerance);
    results.push({
      claimId: claim.id,
      outcome: matches ? "verified" : "mismatch",
      claimed: claim.value,
      computed,
      evidence: `${describeTolerance(tolerance)}: claimed ${claim.value}, recomputed ${value}`,
    });
  }

  const verified = results.filter((r) => r.outcome === "verified").length;
  const mismatched = results.filter((r) => r.outcome === "mismatch").length;
  const didNotRun = results.filter((r) => r.outcome === "did-not-run").length;
  const noCheck = results.filter((r) => r.outcome === "no-check").length;
  const inconsistent = results.filter((r) => r.outcome === "reproduced-inconsistently").length;

  // Zero claims proves nothing, mirroring "zero tests is not a pass".
  const verdict: ComputationVerification["verdict"] =
    results.length === 0
      ? "uncertain"
      : mismatched + didNotRun + noCheck + inconsistent === 0
        ? "pass"
        : mismatched + inconsistent > 0
          ? "fail"
          : "uncertain";

  const parts: string[] = [`${verified}/${results.length} recomputed and matched`];
  if (mismatched > 0) parts.push(`${mismatched} mismatched`);
  if (inconsistent > 0) parts.push(`${inconsistent} not reproducible`);
  if (didNotRun > 0) parts.push(`${didNotRun} did not run`);
  if (noCheck > 0) parts.push(`${noCheck} had no recomputation at all`);
  if (results.length === 0) parts.push("nothing was claimed, so nothing was verified");

  return { results, verified, mismatched, didNotRun, noCheck, inconsistent, verdict, summary: parts.join("; ") };
}

/**
 * Wraps recomputation as a `V2_empirical` verifier.
 *
 * V2 is an external tier: FAZ 6's `acceptCodeWork` accepts a code claim on V1 or
 * V2 evidence and refuses it on consensus alone. A recomputation therefore
 * carries weight that agreement between models does not — which is exactly the
 * distinction FAZ 9 asks for.
 */
export function computationVerifier(
  name: string,
  claims: readonly NumericClaim[],
  checks: readonly NumericCheck[],
  options: ComputationVerificationOptions & { scope?: VerifierScope } = {},
): Verifier {
  return empiricalVerifier(
    name,
    async () => {
      const verification = await verifyNumericClaims(claims, checks, options);
      // Mapped onto the passed/failed shape the empirical tier expects. A claim
      // that was never recomputed counts as neither: it is not a failure of the
      // computation, it is an absence of one.
      return {
        passed: verification.verified,
        failed: verification.mismatched + verification.inconsistent,
        output: `${verification.summary}. ${verification.results
          .filter((result) => result.outcome !== "verified")
          .map((result) => `${result.claimId}: ${result.evidence}`)
          .join(" | ")
          .slice(0, 1200)}`,
      };
    },
    options.scope ?? "goal",
  );
}

function withinTolerance(
  claimed: number,
  computed: number,
  tolerance: { readonly absolute?: number; readonly relative?: number } | undefined,
): boolean {
  if (claimed === computed) return true;
  const difference = Math.abs(claimed - computed);
  if (tolerance?.absolute !== undefined && difference <= tolerance.absolute) return true;
  if (tolerance?.relative !== undefined && claimed !== 0) {
    return difference / Math.abs(claimed) <= tolerance.relative;
  }
  return false;
}

function describeTolerance(
  tolerance: { readonly absolute?: number; readonly relative?: number } | undefined,
): string {
  if (tolerance === undefined) return "exact comparison, no tolerance stated";
  const bits: string[] = [];
  if (tolerance.absolute !== undefined) bits.push(`absolute ±${tolerance.absolute}`);
  if (tolerance.relative !== undefined) bits.push(`relative ±${tolerance.relative * 100}%`);
  return bits.length === 0 ? "exact comparison, no tolerance stated" : `tolerance ${bits.join(", ")}`;
}
