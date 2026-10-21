/**
 * FAZ 26 1/3 — whether splitting engine.ts is justified, measured rather than argued.
 *
 * The structural facts are read from the real file rather than asserted by hand, so
 * this test fails if engine.ts changes shape and the recorded measurement goes stale.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assessEngineSplit,
  COUPLING_THRESHOLD,
  isSizeAloneJustification,
  type CompositionName,
  type MethodRecord,
  type StructuralFacts,
} from "../src/experimental/engine-composition-audit.js";

const ENGINE_PATH = join(dirname(fileURLToPath(import.meta.url)), "../src/engine.ts");

/** Measures engine.ts the way the audit expects, from the file on disk. */
function measureEngine(): StructuralFacts {
  const lines = readFileSync(ENGINE_PATH, "utf8").split("\n");
  const importStatements = lines.filter((line) => line.startsWith("import ")).length;
  const ctorStart = lines.findIndex((line) => /^  constructor\(/.test(line));
  expect(ctorStart).toBeGreaterThan(0);

  // Walk braces to find the constructor's end, so the number is measured and not
  // transcribed from a previous run.
  let depth = 0;
  let ctorEnd = -1;
  for (let i = ctorStart; i < lines.length; i += 1) {
    depth += (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
    if (depth === 0 && i > ctorStart) {
      ctorEnd = i;
      break;
    }
  }
  expect(ctorEnd).toBeGreaterThan(ctorStart);

  const methodCount = lines.filter((line) => /^  (?:private |public |static )?(?:async )?[a-zA-Z]\w*\(/.test(line)).length;

  return {
    totalLines: lines.length - 1,
    constructorLines: ctorEnd - ctorStart + 1,
    methodLines: lines.length - 1 - ctorEnd - 1,
    methodCount,
    importStatements,
  };
}

function method(name: string, composition: CompositionName, foreignServices: readonly string[] = []): MethodRecord {
  return { name, composition, foreignServices };
}

describe("the structural facts are as recorded, read from the file", () => {
  const facts = measureEngine();

  it("is roughly 5.5K lines, as FAZ 26 says", () => {
    expect(facts.totalLines).toBeGreaterThan(5000);
    expect(facts.totalLines).toBeLessThan(6000);
  });

  it("has a constructor far larger than any method block", () => {
    expect(facts.constructorLines).toBeGreaterThan(1500);
    // The decisive fact: wiring is the largest single block in the file.
    expect(facts.constructorLines).toBeLessThan(facts.methodLines);
    expect(facts.methodLines).toBeGreaterThan(3000);
  });

  it("has few methods relative to its length", () => {
    expect(facts.methodCount).toBeGreaterThan(30);
    expect(facts.methodCount).toBeLessThan(60);
    // ~150 lines per method on average means the length is not 36 tangled
    // responsibilities; it is wiring and comments.
    expect(facts.totalLines / facts.methodCount).toBeGreaterThan(100);
  });

  it("has an import block that follows the services, not the methods", () => {
    expect(facts.importStatements).toBeGreaterThan(200);
  });
});

describe("rule 1 — line count alone is never a justification", () => {
  it("says so explicitly", () => {
    expect(isSizeAloneJustification(measureEngine())).toBe(false);
  });
});

describe("a split that moves methods is assessed as cosmetic", () => {
  it("reports low coupling and names what the split would leave untouched", () => {
    const facts = measureEngine();
    const methods: MethodRecord[] = [
      method("executeTask", "ExecutionComposition"),
      method("runVerify", "ExecutionComposition"),
      method("recall", "MemoryComposition"),
      method("routeModel", "ModelComposition"),
      method("screenInput", "SecurityComposition"),
      method("research", "ResearchComposition"),
    ];
    const assessment = assessEngineSplit(facts, methods);

    expect(assessment.verdict).toBe("cosmetic");
    expect(assessment.couplingRatio).toBe(0);
    expect(assessment.detail).toContain("constructor lines untouched");
    expect(assessment.notAddressed.join(" ")).toContain("the constructor");
    expect(assessment.notAddressed.join(" ")).toContain("import statements");
  });

  it("reports proposed compositions that would receive nothing", () => {
    const assessment = assessEngineSplit(measureEngine(), [method("executeTask", "ExecutionComposition")]);
    const empty = assessment.notAddressed.find((note) => note.includes("would receive no methods"));
    expect(empty).toBeDefined();
    expect(empty).toContain("7 of the 8 proposed compositions");
    expect(assessment.verdict).toBe("cosmetic");
  });
});

describe("rule 3 — high coupling is reported as the cost, not as readiness", () => {
  it("measures cross-composition dependencies", () => {
    const facts = measureEngine();
    // One method per proposed composition, so none of the eight is empty — the
    // point of this case is coupling, not coverage.
    const methods: MethodRecord[] = [
      method("boot", "EngineComposition", ["modelRouter", "memoryFusion"]),
      method("executeTask", "ExecutionComposition", ["modelRouter", "memoryFusion", "verifierFactory"]),
      method("recall", "MemoryComposition", ["vectorStore"]),
      method("routeModel", "ModelComposition", ["reliabilityRegistry"]),
      method("screenInput", "SecurityComposition", ["policyStore"]),
      method("research", "ResearchComposition", ["provenanceTrace"]),
      method("planTask", "CognitiveComposition", ["strategyArena"]),
      method("callTool", "IntegrationComposition"),
    ];
    const assessment = assessEngineSplit(facts, methods);

    expect(assessment.compositions.every((c) => c.methods > 0)).toBe(true);
    expect(assessment.couplingRatio).toBeCloseTo(7 / 8, 5);
    expect(assessment.couplingRatio).toBeGreaterThan(COUPLING_THRESHOLD);
    // Above the threshold the boundaries are not real, and the fix is a container
    // that owns construction — not a file split. So this is still a refusal.
    expect(assessment.verdict).toBe("entangled-needs-container");
    expect(assessment.detail).toContain("separating them requires a container that owns construction first");
    expect(assessment.compositions.find((c) => c.composition === "ExecutionComposition")!.coupled).toBe(1);
  });
});

describe("rule 5 — the assessment moves nothing", () => {
  it("carries no refactor instruction and is stable across calls", () => {
    const facts = measureEngine();
    const methods = [method("executeTask", "ExecutionComposition")];
    const first = assessEngineSplit(facts, methods);
    expect("plan" in first).toBe(false);
    expect("apply" in first).toBe(false);
    expect(assessEngineSplit(facts, methods)).toEqual(first);
  });
});
