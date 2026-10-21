/**
 * FAZ 18 closed for the coding expert: an evaluator that registers, and whose
 * verdicts are the engine's own.
 *
 * The load-bearing cases: the probe really is rejected (which is what makes
 * registration meaningful at all), and work that is not a report comes back
 * `uncertain` rather than `fail`.
 */

import { describe, expect, it } from "vitest";

import { acceptCodeWork } from "../src/experts/coding-expert.js";
import { CODING_EXPERT_DOMAIN, CODING_EXPERT_ID, codingExpertEvaluator } from "../src/experts/coding-evaluator.js";
import { EvaluatorFabric } from "../src/experts/evaluator-fabric.js";
import type { VerificationReport } from "../src/execution/verification-factory.js";

// Typed, not cast through `unknown`: EXTERNAL_VERDICT_TIERS is V1_formal and
// V2_empirical, and VerifierOutcome requires evidence and confidence. My first
// fixtures said tier "compiler" and carried a `scope` field, which compiled only
// because of the cast and were then correctly refused — the same mistake as
// hand-building a VerificationReport anywhere else in this repo.
const externalPass: VerificationReport = {
  verdict: "pass",
  results: [
    {
      verdict: "pass",
      tier: "V2_empirical",
      verifier: "tsc",
      evidence: "tsc -p tsconfig.json exited 0 with no diagnostics",
      confidence: 1,
      scope: "workspace",
    },
  ],
  strongestTier: "V2_empirical",
  autonomy: "high",
  status: "succeeded",
  summary: "tsc exited 0",
};

const opinionsOnly: VerificationReport = {
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
  summary: "nobody ran anything",
};

describe("the evaluator matches the expert it is for", () => {
  it("names the coding expert and its domain", () => {
    const evaluator = codingExpertEvaluator();
    expect(evaluator.expertId).toBe(CODING_EXPERT_ID);
    expect(evaluator.domain).toBe(CODING_EXPERT_DOMAIN);
    expect(evaluator.expertId).toBe("coding");
    expect(evaluator.domain).toBe("software-engineering");
  });
});

describe("the probe is real, so registration proves something", () => {
  it("rejects the work it is required to reject", async () => {
    const evaluator = codingExpertEvaluator();
    const outcome = await evaluator.evaluate(evaluator.probe.work);
    expect(outcome.verdict).toBe("fail");
    expect(outcome.detail).toContain("not an exit code");
  });

  it("registers in the fabric, which runs that probe", async () => {
    const fabric = new EvaluatorFabric();
    await expect(fabric.register(codingExpertEvaluator(), CODING_EXPERT_DOMAIN)).resolves.toBeUndefined();
  });

  it("refuses to register against a different domain", async () => {
    const fabric = new EvaluatorFabric();
    await expect(fabric.register(codingExpertEvaluator(), "finance")).rejects.toThrow();
  });
});

describe("the verdict is the engine's own, because it is the same function", () => {
  it("passes what acceptCodeWork accepts", async () => {
    const evaluator = codingExpertEvaluator();
    expect(acceptCodeWork(externalPass).accepted).toBe(true);
    expect((await evaluator.evaluate(externalPass)).verdict).toBe("pass");
  });

  it("fails what acceptCodeWork refuses, with the same reason", async () => {
    const evaluator = codingExpertEvaluator();
    const expected = acceptCodeWork(opinionsOnly);
    expect(expected.accepted).toBe(false);
    const outcome = await evaluator.evaluate(opinionsOnly);
    expect(outcome.verdict).toBe("fail");
    expect(outcome.detail).toBe(expected.reason);
  });
});

describe("work that is not a report is uncertain, not a failure", () => {
  it("says the check could not run rather than that the code is broken", async () => {
    const evaluator = codingExpertEvaluator();
    const outcome = await evaluator.evaluate({ text: "here is some code, trust me" });

    expect(outcome.verdict).toBe("uncertain");
    expect(outcome.detail).toContain("not a VerificationReport");
    expect(outcome.detail).toContain("a gap in what was supplied, not a verdict about the code");
  });

  it("treats null and a bare array the same way", async () => {
    const evaluator = codingExpertEvaluator();
    expect((await evaluator.evaluate(null)).verdict).toBe("uncertain");
    expect((await evaluator.evaluate([])).verdict).toBe("uncertain");
  });
});

describe("through the fabric, an expert with an evaluator is really evaluated", () => {
  it("returns the evaluator's verdict and marks the work evaluated", async () => {
    const fabric = new EvaluatorFabric();
    await fabric.register(codingExpertEvaluator(), CODING_EXPERT_DOMAIN);

    const passed = await fabric.evaluate(CODING_EXPERT_ID, externalPass);
    expect(passed.evaluated).toBe(true);
    expect(passed.verdict).toBe("pass");

    const failed = await fabric.evaluate(CODING_EXPERT_ID, opinionsOnly);
    expect(failed.evaluated).toBe(true);
    expect(failed.verdict).toBe("fail");
  });

  it("reports coding as covered and an unbound expert as not", async () => {
    const fabric = new EvaluatorFabric();
    await fabric.register(codingExpertEvaluator(), CODING_EXPERT_DOMAIN);
    const coverage = fabric.coverage([CODING_EXPERT_ID, "research"]);

    expect(coverage.covered).toContain(CODING_EXPERT_ID);
    expect(coverage.uncovered).toContain("research");
  });
});
