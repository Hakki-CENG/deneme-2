/**
 * FAZ 9 1/3 — recomputation as the decider.
 *
 * The five rules, plus the one that makes this more than a utility: the wrapper
 * is a V2 empirical verifier, which is a tier FAZ 6's `acceptCodeWork` accepts
 * and consensus is not. The last test proves that connection rather than
 * asserting it in a comment.
 */

import { describe, expect, it } from "vitest";

import { computationVerifier, verifyNumericClaims } from "../src/science/computation-verifier.js";
import type { NumericCheck, NumericClaim } from "../src/science/computation-verifier.js";
import { acceptCodeWork } from "../src/experts/coding-expert.js";
import type { VerificationReport } from "../src/execution/verification-factory.js";

const claim = (id: string, value: number, statement = `the value is ${value}`): NumericClaim => ({
  id,
  statement,
  value,
  producedBy: "model reasoning",
});

const check = (claimId: string, recompute: () => Promise<number>, tolerance?: NumericCheck["tolerance"]): NumericCheck => ({
  claimId,
  recompute,
  ...(tolerance === undefined ? {} : { tolerance }),
});

describe("a claim that recomputes is verified", () => {
  it("passes when the computation agrees", async () => {
    const verification = await verifyNumericClaims(
      [claim("mean", 4)],
      [check("mean", async () => (2 + 4 + 6) / 3)],
    );
    expect(verification.verdict).toBe("pass");
    expect(verification.results[0]?.outcome).toBe("verified");
    expect(verification.results[0]?.evidence).toContain("claimed 4, recomputed 4");
  });
});

describe("rule 1 — without a computation the model's word does not decide", () => {
  it("reports no-check rather than verified", async () => {
    const verification = await verifyNumericClaims([claim("mean", 4)], []);
    expect(verification.results[0]?.outcome).toBe("no-check");
    expect(verification.results[0]?.evidence).toContain("the model's word is all there is");
    expect(verification.verdict).toBe("uncertain");
    expect(verification.noCheck).toBe(1);
  });

  it("does not let an unrelated check stand in", async () => {
    const verification = await verifyNumericClaims(
      [claim("mean", 4)],
      [check("something-else", async () => 4)],
    );
    expect(verification.results[0]?.outcome).toBe("no-check");
  });
});

describe("rule 2 — a check that throws did not run", () => {
  it("is neither a mismatch nor a pass", async () => {
    const verification = await verifyNumericClaims(
      [claim("mean", 4)],
      [check("mean", async () => {
        throw new Error("no pandas in this sandbox");
      })],
    );
    expect(verification.results[0]?.outcome).toBe("did-not-run");
    expect(verification.results[0]?.evidence).toContain("no pandas in this sandbox");
    // Uncertain, not fail: the value was never produced, so nothing disagreed.
    expect(verification.verdict).toBe("uncertain");
  });
});

describe("rule 3 — tolerance is stated, never assumed", () => {
  it("compares exactly when no tolerance is given, and says so", async () => {
    const verification = await verifyNumericClaims(
      [claim("sum", 0.3)],
      [check("sum", async () => 0.1 + 0.2)],
    );
    // 0.1 + 0.2 is 0.30000000000000004. Exact comparison must not absorb it.
    expect(verification.results[0]?.outcome).toBe("mismatch");
    expect(verification.results[0]?.evidence).toContain("exact comparison, no tolerance stated");
    expect(verification.verdict).toBe("fail");
  });

  it("accepts a stated absolute tolerance and records it", async () => {
    const verification = await verifyNumericClaims(
      [claim("sum", 0.3)],
      [check("sum", async () => 0.1 + 0.2, { absolute: 1e-9 })],
    );
    expect(verification.results[0]?.outcome).toBe("verified");
    expect(verification.results[0]?.evidence).toContain("absolute ±1e-9");
  });

  it("accepts a stated relative tolerance", async () => {
    const verification = await verifyNumericClaims(
      [claim("growth", 1000)],
      [check("growth", async () => 1000.4, { relative: 0.001 })],
    );
    expect(verification.results[0]?.outcome).toBe("verified");
    expect(verification.results[0]?.evidence).toContain("relative ±0.1%");
  });
});

describe("rule 4 — NaN never verifies", () => {
  it("refuses a NaN computation", async () => {
    const verification = await verifyNumericClaims(
      [claim("ratio", 1)],
      [check("ratio", async () => 0 / 0)],
    );
    expect(verification.results[0]?.outcome).toBe("mismatch");
    expect(verification.results[0]?.evidence).toContain("not a finite number");
  });

  it("refuses a NaN claim even against a NaN computation", async () => {
    // NaN === NaN is false, and "both produced nothing" is not agreement.
    const verification = await verifyNumericClaims(
      [claim("ratio", Number.NaN)],
      [check("ratio", async () => Number.NaN)],
    );
    expect(verification.results[0]?.outcome).toBe("mismatch");
  });
});

describe("rule 5 — a number that moves between runs is not a result", () => {
  it("reports inconsistency rather than accepting the closest run", async () => {
    let call = 0;
    const verification = await verifyNumericClaims(
      [claim("estimate", 4)],
      [check("estimate", async () => {
        call += 1;
        return call === 1 ? 4 : 4.0000001;
      })],
      { runs: 3 },
    );
    expect(verification.results[0]?.outcome).toBe("reproduced-inconsistently");
    expect(verification.results[0]?.evidence).toContain("3 runs produced different values");
    expect(verification.verdict).toBe("fail");
  });

  it("accepts runs that agree", async () => {
    const verification = await verifyNumericClaims(
      [claim("mean", 4)],
      [check("mean", async () => (2 + 4 + 6) / 3)],
      { runs: 3 },
    );
    expect(verification.results[0]?.outcome).toBe("verified");
    expect(verification.results[0]?.computed).toEqual([4, 4, 4]);
  });
});

describe("nothing claimed proves nothing", () => {
  it("is uncertain, mirroring that zero tests is not a pass", async () => {
    const verification = await verifyNumericClaims([], []);
    expect(verification.verdict).toBe("uncertain");
    expect(verification.summary).toContain("nothing was claimed");
  });
});

describe("the wrapper is external evidence, not opinion", () => {
  it("is a V2 empirical verifier", () => {
    const verifier = computationVerifier("recompute", [claim("mean", 4)], [check("mean", async () => 4)]);
    expect(verifier.tier).toBe("V2_empirical");
    expect(verifier.name).toBe("recompute");
  });

  it("reports passed and failed counts from the recomputation", async () => {
    const verifier = computationVerifier(
      "recompute",
      [claim("good", 4), claim("bad", 9)],
      [check("good", async () => 4), check("bad", async () => 3)],
    );
    const outcome = await verifier.run({} as never, {} as never);
    expect(outcome.verdict).toBe("fail");
    expect(outcome.evidence).toContain("1/2 recomputed and matched");
    expect(outcome.evidence).toContain("bad:");
  });

  it("carries a claim that FAZ 6 refuses on consensus alone", async () => {
    // The connection that makes this more than a helper: V2 is a tier
    // acceptCodeWork accepts, and V3 consensus is not.
    const verifier = computationVerifier("recompute", [claim("mean", 4)], [check("mean", async () => 4)]);
    const outcome = await verifier.run({} as never, {} as never);
    expect(outcome.verdict).toBe("pass");

    // A verifier returns only verdict/evidence/confidence; VerificationFactory
    // supplies tier, verifier and scope from the verifier's own definition
    // (verification-factory.ts:195-199). Reproduced here because the test drives
    // the verifier directly rather than through the factory.
    const report: VerificationReport = {
      verdict: "pass",
      results: [
        {
          ...outcome,
          tier: verifier.tier,
          verifier: verifier.name,
          scope: verifier.scope ?? "goal",
        },
      ],
      strongestTier: "V2_empirical",
      autonomy: "high",
      status: "succeeded",
      summary: outcome.evidence,
    };
    const decision = acceptCodeWork(report);
    expect(decision.accepted).toBe(true);
    // `deciding` carries the results that decided it, not tier names.
    expect(decision.deciding.some((result) => result.tier === "V2_empirical")).toBe(true);
  });
});
