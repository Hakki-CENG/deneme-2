/**
 * FAZ 5 — the router is actually reached.
 *
 * Without these, `routeTask` is a correct function nothing calls, and
 * `understanding.capabilities` is a field nothing reads. The point of the phase
 * is that a task gets routed, so the tests run the loop and look at the report.
 */

import { describe, expect, it } from "vitest";

import { UnifiedExecutionLoop } from "../src/execution/unified-execution-loop.js";
import { ExpertRegistry, type CapabilitySource } from "../src/experts/expert-registry.js";
import type { ExpertDefinition } from "../src/experts/expert-definition.js";
import type { GoalUnderstanding } from "../src/execution/task-context.js";
import type { CapabilityDescriptor } from "../src/types.js";

function source(...ids: string[]): CapabilitySource {
  const descriptors: CapabilityDescriptor[] = ids.map((id) => ({
    id,
    version: "1.0.0",
    description: id,
    risk: "pure",
    sideEffect: false,
    inputSchema: {},
    source: "core",
  }));
  return { list: () => descriptors };
}

function expert(id: string, serves: string[]): ExpertDefinition {
  return {
    id,
    domain: id,
    tools: ["agent.list"],
    safety: { maxCapabilityRisk: "workspace_read" },
    memoryNamespace: `expert.${id}`,
    servesCapabilities: serves,
  };
}

function understandingWith(capabilities: GoalUnderstanding["capabilities"]): GoalUnderstanding {
  return {
    goal: "Fix the slow checkout endpoint and ship it safely",
    constraints: [],
    preferences: [],
    risks: [],
    successCriteria: [],
    missingInformation: [],
    ambiguity: 0.1,
    clarifyingQuestions: [],
    capabilities,
    recommendation: "act",
    source: "model",
  };
}

function loop(experts?: ExpertRegistry, capabilities: GoalUnderstanding["capabilities"] = []) {
  return new UnifiedExecutionLoop(
    {
      runAgent: async () => ({ completed: true, summary: "done" }),
      plan: async () => [{ id: "s1", description: "fix it", dependencies: [] }],
      understandGoal: async () => understandingWith(capabilities),
      ...(experts === undefined ? {} : { experts }),
    },
    { maxAttempts: 1 },
  );
}

describe("the loop routes on what understanding extracted", () => {
  it("puts the selected experts in the report", async () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("swe", ["code_change", "performance"]));
    registry.register(expert("devops", ["deployment"]));
    registry.register(expert("unrelated", ["legal_review"]));

    const report = await loop(registry, [
      { capability: "performance", evidence: "slow", confidence: 0.9 },
      { capability: "code_change", evidence: "fix", confidence: 0.9 },
      { capability: "deployment", evidence: "ship it", confidence: 0.7 },
    ]).run({ tenantId: "local", goal: "Fix the slow checkout endpoint and ship it safely" });

    expect(report.routing, "the report carries no routing").toBeDefined();
    expect(report.routing?.source).toBe("analysis");
    expect(report.routing?.matches.map((m) => m.expertId)).toEqual(["swe", "devops"]);
    expect(report.routing?.uncovered).toEqual([]);
  });

  it("records a requirement no expert serves", async () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("swe", ["code_change"]));

    const report = await loop(registry, [
      { capability: "code_change", evidence: "fix", confidence: 0.9 },
      { capability: "legal_review", evidence: "terms", confidence: 0.8 },
    ]).run({ tenantId: "local", goal: "Fix it and check the terms" });

    expect(report.routing?.uncovered).toEqual(["legal_review"]);
    // The gap is also observable, not only in the routing record.
    expect(
      report.observations.some((o) => o.summary.includes("no expert serves") && o.summary.includes("legal_review")),
    ).toBe(true);
  });

  it("reports honestly when understanding extracted nothing to route on", async () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("swe", ["code_change"]));

    const report = await loop(registry, []).run({ tenantId: "local", goal: "Fix the checkout" });

    // Routing ran and found nothing — not the same as routing not running.
    expect(report.routing).toBeDefined();
    expect(report.routing?.source).toBe("none");
    expect(report.routing?.matches).toEqual([]);
    expect(report.routing?.reason).toContain("no capability analysis was available");
  });

  it("omits the field entirely when no registry was supplied", async () => {
    const report = await loop(undefined, [
      { capability: "code_change", evidence: "fix", confidence: 0.9 },
    ]).run({ tenantId: "local", goal: "Fix the checkout" });

    // Absent means nobody was asked to route. Present-and-empty would claim a
    // routing happened and selected nobody, which did not.
    expect(report.routing).toBeUndefined();
  });

  it("does not route to an expert that is registered but unusable", async () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register({ ...expert("broken", ["code_change"]), tools: ["ghost.tool"] });

    const report = await loop(registry, [
      { capability: "code_change", evidence: "fix", confidence: 0.9 },
    ]).run({ tenantId: "local", goal: "Fix the checkout" });

    expect(report.routing?.matches).toEqual([]);
    expect(report.routing?.uncovered).toEqual(["code_change"]);
  });
});
