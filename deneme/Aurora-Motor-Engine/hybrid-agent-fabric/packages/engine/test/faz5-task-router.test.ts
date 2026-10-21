/**
 * FAZ 5 — Semantic Task Router.
 *
 * The plan's own example is the load-bearing case: a performance problem that
 * must be fixed and shipped safely is not one category, it is several experts.
 * These tests hold the router to that, and to the rule that it never falls back
 * to keyword matching.
 */

import { describe, expect, it } from "vitest";

import { ExpertRegistry, type CapabilitySource } from "../src/experts/expert-registry.js";
import type { ExpertDefinition } from "../src/experts/expert-definition.js";
import {
  parseCapabilityRequirements,
  routeTask,
  type CapabilityRequirement,
} from "../src/experts/task-router.js";
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

function expert(id: string, serves: string[], overrides: Partial<ExpertDefinition> = {}): ExpertDefinition {
  return {
    id,
    domain: id,
    tools: ["agent.list"],
    safety: { maxCapabilityRisk: "workspace_read" },
    memoryNamespace: `expert.${id}`,
    servesCapabilities: serves,
    ...overrides,
  };
}

function requirement(capability: string, confidence = 0.9): CapabilityRequirement {
  return { capability, evidence: `the task mentions ${capability}`, confidence };
}

describe("parseCapabilityRequirements", () => {
  it("reads a bare list", () => {
    const parsed = parseCapabilityRequirements([
      { capability: "code_change", evidence: "must be fixed", confidence: 0.8 },
    ]);
    expect(parsed).toEqual([{ capability: "code_change", evidence: "must be fixed", confidence: 0.8 }]);
  });

  it("reads the wrapped form", () => {
    expect(parseCapabilityRequirements({ requirements: [{ capability: "web_research", evidence: "e", confidence: 1 }] })).toHaveLength(1);
  });

  it("skips entries it cannot read instead of repairing them", () => {
    const parsed = parseCapabilityRequirements([
      { capability: "code_change", evidence: "e", confidence: 0.5 },
      { capability: "   ", evidence: "e", confidence: 0.5 },
      { evidence: "no capability named", confidence: 0.5 },
      "not an object",
      null,
    ]);
    expect(parsed.map((r) => r.capability)).toEqual(["code_change"]);
  });

  it("treats an unknown confidence as zero, never as middling", () => {
    // A number invented here would sail past any threshold the caller set.
    for (const confidence of [undefined, "high", 1.5, -0.2, Number.NaN]) {
      const parsed = parseCapabilityRequirements([{ capability: "code_change", evidence: "e", confidence }]);
      expect(parsed[0]?.confidence, `confidence=${String(confidence)}`).toBe(0);
    }
  });

  it("yields nothing from something that is not a list at all", () => {
    expect(parseCapabilityRequirements("the task is about code")).toEqual([]);
    expect(parseCapabilityRequirements(undefined)).toEqual([]);
  });
});

describe("routeTask never substitutes keyword matching", () => {
  it("selects nobody and says so when there is no analysis", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("swe", ["code_change"]));

    const routing = routeTask([], registry);
    expect(routing.source).toBe("none");
    expect(routing.matches).toEqual([]);
    // The reason must not read as "no expert was needed".
    expect(routing.reason).toContain("no capability analysis was available");
    expect(routing.reason).toContain("does not substitute keyword matching");
  });

  it("selects nobody when every requirement is below the threshold", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("swe", ["code_change"]));

    const routing = routeTask([requirement("code_change", 0.1)], registry, { minConfidence: 0.5 });
    expect(routing.source).toBe("none");
    expect(routing.matches).toEqual([]);
    expect(routing.lowConfidence).toEqual(["code_change"]);
    expect(routing.reason).toContain("nothing was selected on a guess");
  });
});

describe("routeTask selects multiple experts", () => {
  it("routes the plan's own example across several experts", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("swe", ["code_change", "performance"]));
    registry.register(expert("performance", ["performance"]));
    registry.register(expert("security", ["security_review"]));
    registry.register(expert("research", ["web_research"]));
    registry.register(expert("devops", ["deployment"]));

    const routing = routeTask(
      [
        requirement("performance"),
        requirement("code_change"),
        requirement("deployment"),
        requirement("security_review"),
        requirement("web_research"),
      ],
      registry,
    );

    expect(routing.source).toBe("analysis");
    expect(routing.matches.map((m) => m.expertId)).toEqual(["swe", "devops", "performance", "research", "security"]);
    expect(routing.uncovered).toEqual([]);
    // The multi-expert answer is the point: five capabilities, five experts.
    expect(routing.matches).toHaveLength(5);
  });

  it("orders by coverage, not by registration order", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("narrow", ["code_change"]));
    registry.register(expert("broad", ["code_change", "security_review"]));

    const routing = routeTask([requirement("code_change"), requirement("security_review")], registry);
    expect(routing.matches[0]?.expertId).toBe("broad");
    expect(routing.matches[0]?.serves).toEqual(["code_change", "security_review"]);
  });

  it("breaks ties by id so the answer does not depend on registration order", () => {
    const forward = new ExpertRegistry(source("agent.list"));
    forward.register(expert("alpha", ["code_change"]));
    forward.register(expert("beta", ["code_change"]));

    const backward = new ExpertRegistry(source("agent.list"));
    backward.register(expert("beta", ["code_change"]));
    backward.register(expert("alpha", ["code_change"]));

    const a = routeTask([requirement("code_change")], forward).matches.map((m) => m.expertId);
    const b = routeTask([requirement("code_change")], backward).matches.map((m) => m.expertId);
    expect(a).toEqual(["alpha", "beta"]);
    expect(b).toEqual(a);
  });

  it("lists served capabilities in the order the task raised them", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("swe", ["code_change", "performance"]));
    const routing = routeTask([requirement("performance"), requirement("code_change")], registry);
    expect(routing.matches[0]?.serves).toEqual(["performance", "code_change"]);
  });
});

describe("routeTask reports what it could not cover", () => {
  it("names requirements no expert serves instead of dropping them", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("swe", ["code_change"]));

    const routing = routeTask([requirement("code_change"), requirement("legal_review")], registry);
    expect(routing.matches.map((m) => m.expertId)).toEqual(["swe"]);
    expect(routing.uncovered).toEqual(["legal_review"]);
    expect(routing.reason).toContain("uncovered: legal_review");
  });

  it("selects nobody when no expert serves anything required", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("swe", ["code_change"]));
    const routing = routeTask([requirement("legal_review")], registry);
    expect(routing.matches).toEqual([]);
    expect(routing.uncovered).toEqual(["legal_review"]);
    expect(routing.reason).toContain("no registered expert serves any of the required capabilities");
  });

  it("does not select an expert that is registered but unusable", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("broken", ["code_change"], { tools: ["ghost.tool"] }));
    const routing = routeTask([requirement("code_change")], registry);
    expect(routing.matches).toEqual([]);
    expect(routing.uncovered).toEqual(["code_change"]);
  });

  it("does not select an expert that declares nothing", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("vague", []));
    expect(routeTask([requirement("code_change")], registry).matches).toEqual([]);
  });

  it("reports set-aside requirements alongside the ones it used", () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register(expert("swe", ["code_change"]));
    const routing = routeTask([requirement("code_change", 0.9), requirement("legal_review", 0.05)], registry, {
      minConfidence: 0.5,
    });
    expect(routing.source).toBe("analysis");
    expect(routing.matches.map((m) => m.expertId)).toEqual(["swe"]);
    expect(routing.lowConfidence).toEqual(["legal_review"]);
    // A requirement nobody looked at must not be reported as covered.
    expect(routing.uncovered).toEqual([]);
    expect(routing.reason).toContain("set aside for low confidence: legal_review");
  });
});
