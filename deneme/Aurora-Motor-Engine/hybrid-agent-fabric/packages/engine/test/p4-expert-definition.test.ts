/**
 * P4 — Expert Fabric: an expert definition is checked against the world it
 * claims to live in, not against itself.
 */

import { describe, expect, it } from "vitest";

import {
  strategyCriteriaForExpert,
  toolsOverRiskCeiling,
  validateExpertDefinition,
  type ExpertDefinition,
  type ExpertToolRecord,
} from "../src/experts/expert-definition.js";
import type { CapabilityRisk } from "../src/types.js";

// Real ids from src/capabilities/, so a rename there breaks this test rather
// than silently turning every expert's tool list into fiction.
const KNOWN: readonly ExpertToolRecord[] = [
  { id: "agent.spawn", risk: "process" },
  { id: "agent.list", risk: "pure" },
  { id: "checkpoint.capture", risk: "workspace_read" },
  { id: "artifact.list", risk: "workspace_read" },
];

function expert(overrides: Partial<ExpertDefinition> = {}): ExpertDefinition {
  return {
    id: "coding",
    domain: "software-engineering",
    tools: ["agent.list", "checkpoint.capture"],
    safety: { maxCapabilityRisk: "workspace_read" },
    memoryNamespace: "expert.coding",
    ...overrides,
  };
}

describe("validateExpertDefinition", () => {
  it("accepts a well-formed expert", () => {
    expect(validateExpertDefinition(expert(), KNOWN)).toEqual([]);
  });

  it("reports a tool that is not a registered capability", () => {
    const problems = validateExpertDefinition(expert({ tools: ["agent.list", "ghost.tool"] }), KNOWN);
    expect(problems.some((p) => p.includes('tool "ghost.tool" is not a registered capability'))).toBe(true);
  });

  it("reports every tool as unknown when no inventory was supplied", () => {
    // Validating without an inventory must not read as "all clear".
    const problems = validateExpertDefinition(expert());
    expect(problems.filter((p) => p.includes("not a registered capability"))).toHaveLength(2);
  });

  it("reports a duplicated tool", () => {
    const problems = validateExpertDefinition(expert({ tools: ["agent.list", "agent.list"] }), KNOWN);
    expect(problems.some((p) => p.includes('tool "agent.list" is declared twice'))).toBe(true);
  });

  it("reports an expert with no tools, because that is just a prompt", () => {
    const problems = validateExpertDefinition(expert({ tools: [] }), KNOWN);
    expect(problems.some((p) => p.includes("declares no tools"))).toBe(true);
  });

  it("reports empty id, domain and memory namespace", () => {
    const problems = validateExpertDefinition(expert({ id: " ", domain: "  ", memoryNamespace: "" }), KNOWN);
    expect(problems.some((p) => p.includes("expert id is empty"))).toBe(true);
    expect(problems.some((p) => p.includes("domain is empty"))).toBe(true);
    expect(problems.some((p) => p.includes("memoryNamespace is empty"))).toBe(true);
  });

  it("rejects whitespace inside a memory namespace", () => {
    // Namespaces are used as partition keys; a space in one is a collision waiting to happen.
    const problems = validateExpertDefinition(expert({ memoryNamespace: "expert coding" }), KNOWN);
    expect(problems.some((p) => p.includes("contains whitespace"))).toBe(true);
  });

  it("rejects a risk ceiling that is not on the ladder", () => {
    const bad = expert({ safety: { maxCapabilityRisk: "mildly risky" as CapabilityRisk } });
    const problems = validateExpertDefinition(bad, KNOWN);
    expect(problems.some((p) => p.includes("is not on the risk ladder"))).toBe(true);
  });

  it("delegates model policy problems to the existing P2 validator", () => {
    const problems = validateExpertDefinition(
      expert({ modelPolicy: { stages: { nonsense: "openai:gpt" } as never } }),
      KNOWN,
    );
    expect(problems.some((p) => p.includes("model policy") && p.includes("unknown stage"))).toBe(true);
  });

  it("reports a duplicated strategy", () => {
    const strategy = {
      id: "s1",
      name: "patch",
      approach: "a",
      rationale: "b",
      riskLevel: "low" as const,
      estimatedMs: 10,
    };
    const problems = validateExpertDefinition(expert({ strategies: [strategy, strategy] }), KNOWN);
    expect(problems.some((p) => p.includes('strategy "s1" is declared twice'))).toBe(true);
  });

  it("reports an empty evaluator category", () => {
    const problems = validateExpertDefinition(expert({ evaluatorCategories: ["coding", "  "] }), KNOWN);
    expect(problems.some((p) => p.includes("evaluatorCategories entry is empty"))).toBe(true);
  });
});

describe("toolsOverRiskCeiling", () => {
  it("flags a tool above the ceiling and leaves the rest", () => {
    const over = toolsOverRiskCeiling(expert({ tools: ["agent.spawn", "agent.list"] }), KNOWN);
    expect(over).toEqual(["agent.spawn"]); // process > workspace_read
  });

  it("allows a tool at exactly the ceiling", () => {
    expect(toolsOverRiskCeiling(expert({ tools: ["checkpoint.capture"] }), KNOWN)).toEqual([]);
  });

  it("treats an unknown risk as over the ceiling rather than safe", () => {
    const over = toolsOverRiskCeiling(expert({ tools: ["mystery.tool"] }), [
      { id: "mystery.tool" },
    ]);
    expect(over).toEqual(["mystery.tool"]);
  });

  it("returns nothing when the ceiling itself is invalid", () => {
    // validateExpertDefinition owns that complaint; this one must not invent a second.
    const bad = expert({ safety: { maxCapabilityRisk: "nope" as CapabilityRisk }, tools: ["agent.spawn"] });
    expect(toolsOverRiskCeiling(bad, KNOWN)).toEqual([]);
  });
});

describe("strategyCriteriaForExpert", () => {
  it("maps the workspace-only rungs to low", () => {
    for (const risk of ["pure", "workspace_read", "workspace_write"] as CapabilityRisk[]) {
      expect(strategyCriteriaForExpert(expert({ safety: { maxCapabilityRisk: risk } })).maxRisk).toBe("low");
    }
  });

  it("maps process and network to medium", () => {
    for (const risk of ["process", "network"] as CapabilityRisk[]) {
      expect(strategyCriteriaForExpert(expert({ safety: { maxCapabilityRisk: risk } })).maxRisk).toBe("medium");
    }
  });

  it("maps the irreversible rungs to high", () => {
    for (const risk of ["external_side_effect", "privileged"] as CapabilityRisk[]) {
      expect(strategyCriteriaForExpert(expert({ safety: { maxCapabilityRisk: risk } })).maxRisk).toBe("high");
    }
  });

  it("falls back to the strictest reading for an unknown ceiling", () => {
    const bad = expert({ safety: { maxCapabilityRisk: "nope" as CapabilityRisk } });
    expect(strategyCriteriaForExpert(bad).maxRisk).toBe("low");
  });
});
