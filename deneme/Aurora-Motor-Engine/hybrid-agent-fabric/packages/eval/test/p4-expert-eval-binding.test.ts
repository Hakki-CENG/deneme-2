/**
 * P4 — Expert Fabric: an expert's evaluation claims, checked here because the
 * suites that decide whether they are true live here.
 */

import { describe, expect, it } from "vitest";

import type { ExpertDefinition } from "@haf/engine";

import {
  isEvalCategory,
  unmeasuredCategories,
  validateExpertEvalBinding,
} from "../src/experts/expert-eval-binding.js";
import { CORE_EVAL_SUITE } from "../src/tasks/core-tasks.js";
import { EVAL_CATEGORIES, type EvalSuite, type EvalTask } from "../src/tasks/types.js";

function expert(overrides: Partial<ExpertDefinition> = {}): ExpertDefinition {
  return {
    id: "coding",
    domain: "software-engineering",
    tools: ["agent.list"],
    safety: { maxCapabilityRisk: "workspace_read" },
    memoryNamespace: "expert.coding",
    evaluatorCategories: ["coding"],
    benchmarkSuite: CORE_EVAL_SUITE.id,
    ...overrides,
  };
}

/** A suite holding tasks in exactly the given categories. */
function suiteWith(id: string, ...categories: EvalSuite["tasks"][number]["category"][]): EvalSuite {
  const tasks = categories.map((category, index) => ({
    id: `${id}-${index}`,
    category,
    name: `${category} task ${index}`,
    instruction: "do the thing",
    grading: { method: "command", command: "true", expected: "" },
  })) as unknown as EvalTask[];
  return { id, name: id, description: id, tasks };
}

describe("isEvalCategory", () => {
  it("accepts every real category", () => {
    for (const category of EVAL_CATEGORIES) expect(isEvalCategory(category)).toBe(true);
  });

  it("rejects something that only looks like one", () => {
    expect(isEvalCategory("Coding")).toBe(false);
    expect(isEvalCategory("software-engineering")).toBe(false);
    expect(isEvalCategory("")).toBe(false);
  });
});

describe("validateExpertEvalBinding", () => {
  it("accepts an expert whose claims match the real suite", () => {
    expect(validateExpertEvalBinding(expert(), [CORE_EVAL_SUITE])).toEqual([]);
  });

  it("rejects a category that is not real", () => {
    const problems = validateExpertEvalBinding(expert({ evaluatorCategories: ["coding", "devops"] }), [CORE_EVAL_SUITE]);
    expect(problems.some((p) => p.includes('"devops"') && p.includes("not an eval category"))).toBe(true);
    // The message must say what would have been valid, or it is not actionable.
    expect(problems.some((p) => p.includes("capability_acquisition"))).toBe(true);
  });

  it("rejects a benchmark suite that does not exist", () => {
    const problems = validateExpertEvalBinding(expert({ benchmarkSuite: "aurora-imaginary" }), [CORE_EVAL_SUITE]);
    expect(problems.some((p) => p.includes("aurora-imaginary") && p.includes("not a known suite"))).toBe(true);
  });

  it("distinguishes 'no suites supplied' from 'suite does not exist'", () => {
    // Without this, a caller who forgot to pass suites would be told their suite
    // is wrong, which sends them looking in the wrong place.
    const problems = validateExpertEvalBinding(expert(), []);
    expect(problems.some((p) => p.includes("cannot be checked, no suites were supplied"))).toBe(true);
    expect(problems.some((p) => p.includes("not a known suite"))).toBe(false);
  });

  it("says nothing about a benchmark suite that was never declared", () => {
    expect(validateExpertEvalBinding(expert({ benchmarkSuite: undefined }), [])).toEqual([]);
  });
});

describe("unmeasuredCategories", () => {
  it("reports a valid category no task exercises", () => {
    // Every category here is real, so validateExpertEvalBinding is clean — and
    // the expert is still not measured on half of what it claims.
    const e = expert({ evaluatorCategories: ["coding", "multimodal"], benchmarkSuite: "tiny" });
    const suites = [suiteWith("tiny", "coding")];
    expect(validateExpertEvalBinding(e, suites)).toEqual([]);
    expect(unmeasuredCategories(e, suites)).toEqual(["multimodal"]);
  });

  it("reports nothing when every claimed category is exercised", () => {
    const e = expert({ evaluatorCategories: ["coding", "security"], benchmarkSuite: "tiny" });
    expect(unmeasuredCategories(e, [suiteWith("tiny", "coding", "security")])).toEqual([]);
  });

  it("does not repeat the invalid-category complaint", () => {
    // That belongs to validateExpertEvalBinding; reporting it twice would make
    // one mistake look like two.
    const e = expert({ evaluatorCategories: ["devops"], benchmarkSuite: "tiny" });
    expect(unmeasuredCategories(e, [suiteWith("tiny", "coding")])).toEqual([]);
  });

  it("reports everything as unmeasured against an empty suite", () => {
    const e = expert({ evaluatorCategories: ["coding", "planning"], benchmarkSuite: "tiny" });
    expect(unmeasuredCategories(e, [suiteWith("tiny")])).toEqual(["coding", "planning"]);
  });
});
