/**
 * P3: propose several strategies, then choose one for a stated reason.
 *
 * The properties under test are the honesty ones — a single proposal must not be
 * padded, and a tie must not be reported as a decision.
 */
import { describe, expect, it } from "vitest";
import { parseStrategyProposals, selectStrategy } from "../src/aurora/strategy-generator.js";
import type { TaskStrategy } from "../src/aurora/strategy-generator.js";

function strategy(overrides: Partial<TaskStrategy> = {}): TaskStrategy {
  return {
    id: "s1",
    name: "incremental patch",
    approach: "change only the failing function",
    rationale: "smallest blast radius",
    riskLevel: "low",
    estimatedMs: 10_000,
    ...overrides,
  };
}

describe("selectStrategy", () => {
  it("picks the lowest risk, then the fastest", () => {
    const chosen = selectStrategy([
      strategy({ id: "fast-risky", riskLevel: "high", estimatedMs: 1000 }),
      strategy({ id: "slow-safe", riskLevel: "low", estimatedMs: 9000 }),
      strategy({ id: "mid", riskLevel: "medium", estimatedMs: 2000 }),
    ]);
    expect(chosen.chosen?.id).toBe("slow-safe");
    expect(chosen.discriminated).toBe(true);
  });

  it("rejects candidates over the accepted risk and says why", () => {
    const result = selectStrategy(
      [strategy({ id: "risky", riskLevel: "high" }), strategy({ id: "safe", riskLevel: "low" })],
      { maxRisk: "low" },
    );
    expect(result.chosen?.id).toBe("safe");
    expect(result.rejected).toEqual([{ id: "risky", reason: expect.stringContaining("risk high") }]);
  });

  it("rejects candidates over the time budget", () => {
    const result = selectStrategy([strategy({ id: "slow", estimatedMs: 60_000 })], { maxEstimatedMs: 30_000 });
    expect(result.chosen).toBeUndefined();
    expect(result.reason).toContain("every proposed strategy was rejected");
  });

  it("reports a tie as not a real choice", () => {
    const result = selectStrategy([
      strategy({ id: "a", estimatedMs: 5000 }),
      strategy({ id: "b", estimatedMs: 5000 }),
    ]);
    expect(result.discriminated).toBe(false);
    expect(result.reason).toContain("not a real choice");
  });

  it("is honest about having nothing to choose from", () => {
    const result = selectStrategy([]);
    expect(result.chosen).toBeUndefined();
    expect(result.reason).toBe("no strategies were proposed");
  });

  it("counts a single candidate as a single candidate", () => {
    const result = selectStrategy([strategy()]);
    expect(result.chosen?.id).toBe("s1");
    // One candidate cannot be discriminated against anything.
    expect(result.discriminated).toBe(true);
    expect(result.reason).toContain("1 eligible candidate");
  });
});

describe("parseStrategyProposals", () => {
  it("reads well-formed proposals", () => {
    const parsed = parseStrategyProposals({
      strategies: [
        { id: "a", name: "patch", approach: "edit the function", rationale: "small", risk: "low", estimatedMs: 5000, steps: ["locate", "edit"] },
        { name: "rewrite", approach: "replace the module", risk: "high", estimatedMs: 40_000 },
      ],
    });
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.steps).toEqual(["locate", "edit"]);
    // No id supplied, so one is derived rather than left empty.
    expect(parsed[1]?.id).toBe("strategy-2");
    expect(parsed[1]?.rationale).toBe("");
  });

  it("drops entries that are not strategies rather than padding the list", () => {
    const parsed = parseStrategyProposals({
      strategies: [{ name: "", approach: "x" }, { name: "real", approach: "y" }, 42, null],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).toBe("real");
  });

  it("returns nothing for a reply that proposed no strategies", () => {
    expect(parseStrategyProposals({ steps: [] })).toEqual([]);
    expect(parseStrategyProposals("not json")).toEqual([]);
    expect(parseStrategyProposals(null)).toEqual([]);
  });

  it("treats an unknown risk as medium rather than low", () => {
    const parsed = parseStrategyProposals({ strategies: [{ name: "x", approach: "y", risk: "extreme" }] });
    expect(parsed[0]?.riskLevel).toBe("medium");
  });
});
