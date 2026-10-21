/**
 * FAZ 6 2/4 — the rule is applied, not just available.
 *
 * `acceptCodeWork` on its own is a function nothing calls. These run the loop
 * with a task routed to the coding expert and check what the report says when
 * the only thing that liked the code was another model.
 */

import { describe, expect, it } from "vitest";

import { UnifiedExecutionLoop } from "../src/execution/unified-execution-loop.js";
import { ExpertRegistry, type CapabilitySource } from "../src/experts/expert-registry.js";
import { codingExpert } from "../src/experts/coding-expert.js";
import type { ExpertDefinition } from "../src/experts/expert-definition.js";
import { empiricalVerifier } from "../src/execution/verification-factory.js";
import type { Verifier, VerifierTier } from "../src/execution/verification-factory.js";
import type { GoalUnderstanding } from "../src/execution/task-context.js";
import type { CapabilityDescriptor, CapabilityRisk } from "../src/types.js";

/** A source containing exactly the tools an expert declares, at a given risk. */
function sourceFor(expert: ExpertDefinition, risk: CapabilityRisk = "pure"): CapabilitySource {
  const descriptors: CapabilityDescriptor[] = expert.tools.map((id) => ({
    id,
    version: "1.0.0",
    description: id,
    risk,
    sideEffect: false,
    inputSchema: {},
    source: "core",
  }));
  return { list: () => descriptors };
}

function understanding(capabilities: string[]): GoalUnderstanding {
  return {
    goal: "Fix the failing checkout test",
    constraints: [],
    preferences: [],
    risks: [],
    successCriteria: [],
    missingInformation: [],
    ambiguity: 0.1,
    clarifyingQuestions: [],
    capabilities: capabilities.map((capability) => ({ capability, evidence: "the goal says so", confidence: 0.9 })),
    recommendation: "act",
    source: "model",
  };
}

/** A verifier that passes on opinion alone — the failure mode this phase targets. */
function opinionVerifier(name: string, tier: VerifierTier = "V3_consensus"): Verifier {
  return {
    name,
    tier,
    scope: "goal",
    run: async () => ({ verdict: "pass", evidence: `${name} read the code and it looks correct`, confidence: 0.7 }),
  };
}

function loop(capabilities: string[], verifiers: readonly Verifier[], expert?: ExpertDefinition) {
  const registry = expert === undefined ? undefined : new ExpertRegistry(sourceFor(expert, "process"));
  registry?.register(expert as ExpertDefinition);
  return new UnifiedExecutionLoop(
    {
      runAgent: async () => ({ completed: true, summary: "patched checkout.ts" }),
      plan: async () => [{ id: "s1", description: "fix the test", dependencies: [] }],
      understandGoal: async () => understanding(capabilities),
      verifiersFor: async () => verifiers,
      ...(registry === undefined ? {} : { experts: registry }),
    },
    { maxAttempts: 1 },
  );
}

describe("a coding task is not verified by opinion", () => {
  it("downgrades a pass that rests only on evaluators agreeing", async () => {
    const report = await loop(["code_change"], [opinionVerifier("reviewer")], codingExpert()).run({
      tenantId: "local",
      goal: "Fix the failing checkout test",
    });

    expect(report.routing?.matches.map((m) => m.expertId)).toContain("coding");
    expect(report.verification?.verdict, "the consensus pass was taken at face value").toBe("uncertain");
    expect(report.verification?.status).toBe("unverified");
    expect(report.verification?.summary).toContain("this is code work");
    expect(report.verification?.summary).toContain("not a witness to whether it runs");
  });

  it("leaves a pass alone when something executed", async () => {
    const report = await loop(
      ["code_change"],
      [
        empiricalVerifier("vitest", async () => ({ passed: 12, failed: 0, output: "12 passed" })),
        opinionVerifier("reviewer"),
      ],
      codingExpert(),
    ).run({ tenantId: "local", goal: "Fix the failing checkout test" });

    expect(report.verification?.verdict).toBe("pass");
    expect(report.verification?.status).toBe("succeeded");
  });

  it("reports a compiler failure rather than downgrading it", async () => {
    const report = await loop(
      ["code_change"],
      [empiricalVerifier("tsc", async () => ({ passed: 0, failed: 3, output: "3 errors" }))],
      codingExpert(),
    ).run({ tenantId: "local", goal: "Fix the failing checkout test" });

    // A failure is a failure; the rule only stops unearned passes.
    expect(report.verification?.verdict).toBe("fail");
  });
});

describe("the rule is keyed to routing, not to the wording of the goal", () => {
  it("does not apply to a task that was not routed to a coding expert", async () => {
    // Same verifier, same wording — but nothing serves code_change, so this is
    // not code work and the coding rule has nothing to say.
    const report = await loop(["web_research"], [opinionVerifier("reviewer")], codingExpert()).run({
      tenantId: "local",
      goal: "Fix the failing checkout test",
    });

    expect(report.routing?.matches).toEqual([]);
    expect(report.verification?.verdict).toBe("pass");
    expect(report.verification?.summary ?? "").not.toContain("this is code work");
  });

  it("does not apply when there is no registry at all", async () => {
    const report = await loop(["code_change"], [opinionVerifier("reviewer")]).run({
      tenantId: "local",
      goal: "Fix the failing checkout test",
    });
    expect(report.routing).toBeUndefined();
    expect(report.verification?.verdict).toBe("pass");
  });
});
