/**
 * FAZ 6 — Coding Expert.
 *
 * Two claims are held to here. That every tool the expert declares is one the
 * engine actually registers — checked by reading `src/capabilities/` rather than
 * by trusting this file. And that code work is never accepted on the strength of
 * evaluators agreeing with each other.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  acceptCodeWork,
  codingExpert,
  isExternalVerdictTier,
} from "../src/experts/coding-expert.js";
import { validateExpertDefinition } from "../src/experts/expert-definition.js";
import type { VerifierOutcome, VerifierTier, VerificationReport } from "../src/execution/verification-factory.js";

/** Every capability id registered anywhere under src/capabilities/. */
async function registeredCapabilityIds(): Promise<Set<string>> {
  const dir = join(process.cwd(), "src", "capabilities");
  const ids = new Set<string>();
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith(".ts")) continue;
    const text = await readFile(join(dir, entry), "utf8");
    for (const match of text.matchAll(/id:\s*"([a-z][a-z0-9.-]*)"/g)) ids.add(match[1] as string);
  }
  return ids;
}

function outcome(tier: VerifierTier, verdict: "pass" | "fail" | "uncertain", verifier = "check"): VerifierOutcome {
  return { verdict, tier, verifier, evidence: `${verifier} said ${verdict}`, confidence: verdict === "uncertain" ? 0.2 : 0.9, scope: "workspace" };
}

function report(...results: VerifierOutcome[]): VerificationReport {
  const definite = results.filter((r) => r.verdict !== "uncertain");
  const order: VerifierTier[] = ["V1_formal", "V2_empirical", "V3_consensus", "V4_unverifiable"];
  const strongestTier = order.find((tier) => definite.some((r) => r.tier === tier));
  return {
    verdict: results.some((r) => r.verdict === "fail") ? "fail" : results.some((r) => r.verdict === "pass") ? "pass" : "uncertain",
    results,
    strongestTier,
    autonomy: "controlled",
    status: "succeeded",
    summary: `${results.length} outcome(s)`,
  };
}

describe("the coding expert is real, not aspirational", () => {
  it("declares only capabilities the engine registers", async () => {
    const registered = await registeredCapabilityIds();
    expect(registered.size, "no capability ids were found to check against").toBeGreaterThan(50);

    const expert = codingExpert();
    const missing = expert.tools.filter((tool) => !registered.has(tool));
    expect(missing, `tools that exist only in this file: ${missing.join(", ")}`).toEqual([]);
  });

  it("validates against the inventory it declares", async () => {
    const registered = await registeredCapabilityIds();
    const inventory = [...registered].map((id) => ({ id }));
    expect(validateExpertDefinition(codingExpert(), inventory)).toEqual([]);
  });

  it("does not hold publishing tools", async () => {
    // Pushing and cloning change things outside the workspace. They are
    // registered capabilities, but this expert must not reach them.
    const expert = codingExpert();
    expect(expert.tools).not.toContain("git.push");
    expect(expert.tools).not.toContain("git.clone");
    // The way back is in scope.
    expect(expert.tools).toContain("git.rollback");
  });
});

describe("acceptCodeWork refuses to take Aurora's own word for it", () => {
  it("refuses when nothing was executed", () => {
    const acceptance = acceptCodeWork(report());
    expect(acceptance.accepted).toBe(false);
    expect(acceptance.deciding).toEqual([]);
    expect(acceptance.reason).toContain("nothing was executed");
  });

  it("refuses a pass that rests only on evaluators agreeing", () => {
    const acceptance = acceptCodeWork(
      report(outcome("V3_consensus", "pass"), outcome("V3_consensus", "pass", "second-opinion")),
    );
    expect(acceptance.accepted).toBe(false);
    // The reason has to say why, or the refusal reads as a bug.
    expect(acceptance.reason).toContain("agreement between evaluators is not an exit code");
  });

  it("refuses the unverifiable tier too", () => {
    const acceptance = acceptCodeWork(report(outcome("V4_unverifiable", "pass")));
    expect(acceptance.accepted).toBe(false);
    expect(acceptance.reason).toContain("V4_unverifiable");
  });

  it("accepts when an executed check passed", () => {
    const acceptance = acceptCodeWork(report(outcome("V2_empirical", "pass", "vitest")));
    expect(acceptance.accepted).toBe(true);
    expect(acceptance.deciding.map((o) => o.verifier)).toEqual(["vitest"]);
    expect(acceptance.reason).toContain("vitest (V2_empirical)");
  });

  it("accepts a formal proof", () => {
    expect(acceptCodeWork(report(outcome("V1_formal", "pass", "tsc"))).accepted).toBe(true);
  });

  it("does not let a weaker pass outvote a compiler failure", () => {
    const acceptance = acceptCodeWork(
      report(outcome("V3_consensus", "pass"), outcome("V1_formal", "fail", "tsc")),
    );
    expect(acceptance.accepted).toBe(false);
    expect(acceptance.deciding.map((o) => o.verifier)).toEqual(["tsc"]);
    expect(acceptance.reason).toContain("tsc (V1_formal)");
  });

  it("refuses when checks ran but none reached a verdict", () => {
    const acceptance = acceptCodeWork(report(outcome("V2_empirical", "uncertain", "flaky-test")));
    expect(acceptance.accepted).toBe(false);
    expect(acceptance.reason).toContain("none reached a definite verdict");
  });

  it("accepts when an executed pass sits alongside an abstention", () => {
    const acceptance = acceptCodeWork(
      report(outcome("V2_empirical", "pass", "vitest"), outcome("V3_consensus", "uncertain", "reviewer")),
    );
    expect(acceptance.accepted).toBe(true);
    expect(acceptance.deciding.map((o) => o.verifier)).toEqual(["vitest"]);
  });
});

describe("isExternalVerdictTier", () => {
  it("counts execution, not opinion", () => {
    expect(isExternalVerdictTier("V1_formal")).toBe(true);
    expect(isExternalVerdictTier("V2_empirical")).toBe(true);
    expect(isExternalVerdictTier("V3_consensus")).toBe(false);
    expect(isExternalVerdictTier("V4_unverifiable")).toBe(false);
  });
});
