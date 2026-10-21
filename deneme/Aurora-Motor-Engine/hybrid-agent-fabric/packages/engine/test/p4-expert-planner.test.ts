/**
 * P4 — Expert Fabric: the planner facet.
 *
 * The claim this holds to is that the facet has a real consumer. The last block
 * feeds an expert's budgets into `validatePlanSteps`, the function the planner
 * itself uses, and shows a plan the engine would have accepted being refused
 * because of the expert.
 */

import { describe, expect, it } from "vitest";

import {
  plannerConstraintsFor,
  strategiesFor,
  validateExpertDefinition,
  type ExpertDefinition,
} from "../src/experts/expert-definition.js";
import { ExpertRegistry, type CapabilitySource } from "../src/experts/expert-registry.js";
import { DEFAULT_PLAN_CONSTRAINTS, validatePlanSteps } from "../src/aurora/task-planner.js";
import type { TaskStrategy } from "../src/aurora/strategy-generator.js";
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

/** The same capabilities as the plain record list `validateExpertDefinition` takes. */
function records(...ids: string[]) {
  return ids.map((id) => ({ id, risk: "pure" as const }));
}

function expert(overrides: Partial<ExpertDefinition> = {}): ExpertDefinition {
  return {
    id: "coding",
    domain: "software-engineering",
    tools: ["agent.list"],
    safety: { maxCapabilityRisk: "workspace_read" },
    memoryNamespace: "expert.coding",
    ...overrides,
  };
}

function strategy(id: string, riskLevel: "low" | "medium" | "high" = "low"): TaskStrategy {
  return { id, name: id, approach: "a", rationale: "b", riskLevel, estimatedMs: 10 };
}

describe("plannerConstraintsFor", () => {
  it("returns the engine defaults when the expert declares nothing", () => {
    const { constraints, loosened } = plannerConstraintsFor(expert());
    expect(constraints).toEqual(DEFAULT_PLAN_CONSTRAINTS);
    expect(loosened).toEqual([]);
  });

  it("applies a tightening", () => {
    const { constraints, loosened } = plannerConstraintsFor(
      expert({ planner: { constraints: { maxSteps: 4 } } }),
    );
    expect(constraints.maxSteps).toBe(4);
    expect(loosened).toEqual([]);
    // Untouched fields keep the engine's value rather than going missing.
    expect(constraints.maxTotalMs).toBe(DEFAULT_PLAN_CONSTRAINTS.maxTotalMs);
  });

  it("clamps a loosening and says so", () => {
    // A domain definition is not a reason to lift the bound that stops a runaway
    // decomposition from becoming a plan.
    const { constraints, loosened } = plannerConstraintsFor(
      expert({ planner: { constraints: { maxSteps: 500 } } }),
    );
    expect(constraints.maxSteps).toBe(DEFAULT_PLAN_CONSTRAINTS.maxSteps);
    expect(loosened).toHaveLength(1);
    expect(loosened[0]).toContain("maxSteps 500");
    expect(loosened[0]).toContain("clamped");
  });

  it("reports each loosened field separately", () => {
    const { loosened } = plannerConstraintsFor(
      expert({ planner: { constraints: { maxSteps: 999, maxTotalMs: 999_999_999, maxStepMs: 1 } } }),
    );
    expect(loosened.filter((l) => l.startsWith("maxSteps"))).toHaveLength(1);
    expect(loosened.filter((l) => l.startsWith("maxTotalMs"))).toHaveLength(1);
    expect(loosened.filter((l) => l.startsWith("maxStepMs"))).toHaveLength(0); // 1ms is a tightening
  });
});

describe("strategiesFor", () => {
  const strategies = [strategy("patch"), strategy("rewrite"), strategy("bisect")];

  it("allows every declared strategy when there is no allow-list", () => {
    expect(strategiesFor(expert({ strategies })).map((s) => s.id)).toEqual(["patch", "rewrite", "bisect"]);
  });

  it("keeps only the allowed ones", () => {
    const filtered = strategiesFor(expert({ strategies, planner: { allowedStrategies: ["patch", "bisect"] } }));
    expect(filtered.map((s) => s.id)).toEqual(["patch", "bisect"]);
  });

  it("yields nothing when the allow-list names nothing declared", () => {
    // The validator reports this; filtering must not paper over it.
    expect(strategiesFor(expert({ strategies, planner: { allowedStrategies: ["nope"] } }))).toEqual([]);
  });
});

describe("validateExpertDefinition on the planner facet", () => {
  it("accepts a tightened budget", () => {
    expect(validateExpertDefinition(expert({ planner: { constraints: { maxSteps: 3 } } }), records("agent.list"))).toEqual([]);
  });

  it("rejects a budget that cannot describe a plan", () => {
    for (const maxSteps of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const problems = validateExpertDefinition(expert({ planner: { constraints: { maxSteps } } }), records("agent.list"));
      expect(problems.some((p) => p.includes("maxSteps must be a positive number")), `maxSteps=${String(maxSteps)}`).toBe(true);
    }
  });

  it("rejects an allow-list naming an undeclared strategy", () => {
    const problems = validateExpertDefinition(
      expert({ strategies: [strategy("patch")], planner: { allowedStrategies: ["patch", "ghost"] } }),
      records("agent.list"),
    );
    expect(problems.some((p) => p.includes('"ghost"') && p.includes("not a declared strategy"))).toBe(true);
  });

  it("accepts an allow-list that only names declared strategies", () => {
    const problems = validateExpertDefinition(
      expert({ strategies: [strategy("patch"), strategy("rewrite")], planner: { allowedStrategies: ["patch"] } }),
      records("agent.list"),
    );
    expect(problems).toEqual([]);
  });
});

describe("the budgets reach the planner's own validator", () => {
  const rawSteps = [
    { name: "a", description: "first", risk: "low", estimatedMs: 100 },
    { name: "b", description: "second", risk: "low", estimatedMs: 100 },
    { name: "c", description: "third", risk: "low", estimatedMs: 100 },
  ];

  it("a plan the defaults accept is refused under the expert's tighter budget", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert({ planner: { constraints: { maxSteps: 2 } } }));

    expect(validatePlanSteps(rawSteps, DEFAULT_PLAN_CONSTRAINTS).ok).toBe(true);

    const constraints = registry.plannerConstraints("coding");
    expect(constraints).toBeDefined();
    const verdict = validatePlanSteps(rawSteps, constraints);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("limit 2");
  });

  it("an unusable expert gets no planning configuration at all", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert({ tools: ["ghost.tool"], planner: { constraints: { maxSteps: 2 } } }));
    expect(registry.plannerConstraints("coding")).toBeUndefined();
  });

  it("hands back the allow-listed strategies and nothing else", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(
      expert({ strategies: [strategy("patch"), strategy("rewrite")], planner: { allowedStrategies: ["rewrite"] } }),
    );
    expect(registry.strategies("coding").map((s) => s.id)).toEqual(["rewrite"]);
  });

  it("hands an unusable expert no strategies", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert({ tools: ["ghost.tool"], strategies: [strategy("patch")] }));
    expect(registry.strategies("coding")).toEqual([]);
  });
});
