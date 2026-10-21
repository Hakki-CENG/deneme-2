/**
 * FAZ 19 1/3 — ranking by measurement, not by prediction.
 *
 * The load-bearing case is the first: a strategy that declares itself the fastest
 * and least risky loses on measured time. That is the whole point of the phase —
 * "Aurora should not say 'always my way'" — and a test that only exercised honest
 * inputs would not have shown it.
 */

import { describe, expect, it } from "vitest";

import { isArenaDecisive, raceStrategies } from "../src/aurora/strategy-arena.js";
import type { StrategyRunOutcome } from "../src/aurora/strategy-arena.js";
import type { TaskStrategy } from "../src/aurora/strategy-generator.js";

function strategy(id: string, name: string, fields: Partial<TaskStrategy> = {}): TaskStrategy {
  return {
    id,
    name,
    approach: `approach for ${name}`,
    rationale: `rationale for ${name}`,
    riskLevel: "low",
    estimatedMs: 1000,
    ...fields,
  };
}

function outcome(strategyId: string, fields: Partial<StrategyRunOutcome> = {}): StrategyRunOutcome {
  return {
    strategyId,
    ran: true,
    succeeded: true,
    verified: true,
    measuredMs: 1000,
    detail: "completed",
    ...fields,
  };
}

describe("rule 1 — the ranking ignores what a strategy predicted", () => {
  it("lets the strategy that claimed to be fastest lose on measurement", () => {
    // "aurora-native" declares itself the fastest and least risky, exactly the
    // self-estimate that selectStrategy ranks on. It measures slowest.
    const strategies = [
      strategy("a", "aurora-native", { riskLevel: "low", estimatedMs: 100 }),
      strategy("b", "delegation", { riskLevel: "medium", estimatedMs: 5000 }),
    ];
    const result = raceStrategies(strategies, [
      outcome("a", { measuredMs: 9000 }),
      outcome("b", { measuredMs: 900 }),
    ]);

    expect(result.comparable).toBe(true);
    expect(result.winner).toBe("b");
    expect(result.ranking[0]!.strategyId).toBe("b");
    expect(result.ranking[1]!.strategyId).toBe("a");
    expect(result.summary).toContain("fastest at 900ms");
  });

  it("does not mention estimates anywhere in the ranking", () => {
    const result = raceStrategies(
      [strategy("a", "one", { estimatedMs: 1 }), strategy("b", "two", { estimatedMs: 999999 })],
      [outcome("a", { measuredMs: 500 }), outcome("b", { measuredMs: 400 })],
    );
    expect(result.winner).toBe("b");
    expect(JSON.stringify(result.ranking)).not.toContain("999999");
  });
});

describe("rule 2 — a strategy that did not run is not last place", () => {
  it("reports it as not run and leaves it out of the ranking", () => {
    const result = raceStrategies(
      [strategy("a", "one"), strategy("b", "two"), strategy("c", "three")],
      [outcome("a", { measuredMs: 100 }), outcome("b", { measuredMs: 200 }), outcome("c", { ran: false, succeeded: false, verified: false, detail: "never started" })],
    );
    expect(result.notRun).toEqual(["c"]);
    expect(result.ranking.map((standing) => standing.strategyId)).toEqual(["a", "b"]);
    expect(result.summary).toContain("did not run");
  });

  it("treats a missing outcome the same as one that did not run", () => {
    const result = raceStrategies(
      [strategy("a", "one"), strategy("b", "two"), strategy("c", "three")],
      [outcome("a", { measuredMs: 100 }), outcome("b", { measuredMs: 200 })],
    );
    expect(result.notRun).toEqual(["c"]);
    expect(result.summary).toContain("did not run");
  });
});

describe("rule 3 — one measured result is not a comparison", () => {
  it("refuses to rank a single verified run", () => {
    const result = raceStrategies(
      [strategy("a", "one"), strategy("b", "two")],
      [outcome("a", { measuredMs: 100 }), outcome("b", { ran: false, succeeded: false, verified: false, detail: "failed to start" })],
    );
    expect(result.comparable).toBe(false);
    expect(result.ranking).toEqual([]);
    expect(result.winner).toBeUndefined();
    expect(result.summary).toContain("1 of 2 strategies produced a verified, measured outcome");
    expect(isArenaDecisive(result)).toBe(false);
  });

  it("refuses to rank an empty field", () => {
    const result = raceStrategies([], []);
    expect(result.comparable).toBe(false);
    expect(result.summary).toContain("0 of 0");
  });
});

describe("rule 4 — a tie is reported as a tie", () => {
  it("gives equal times the same place and no winner", () => {
    const result = raceStrategies(
      [strategy("a", "one"), strategy("b", "two")],
      [outcome("a", { measuredMs: 500 }), outcome("b", { measuredMs: 500 })],
    );
    expect(result.comparable).toBe(true);
    expect(result.winner).toBeUndefined();
    expect(result.ranking.map((standing) => standing.place)).toEqual([1, 1]);
    expect(result.summary).toContain("tied at 500ms");
    expect(isArenaDecisive(result)).toBe(false);
  });

  it("does not break the tie by proposal order", () => {
    const reversed = raceStrategies(
      [strategy("b", "two"), strategy("a", "one")],
      [outcome("b", { measuredMs: 500 }), outcome("a", { measuredMs: 500 })],
    );
    expect(reversed.winner).toBeUndefined();
  });
});

describe("rule 5 — an unchecked result cannot win", () => {
  it("excludes an unverified run from the ranking even when it was fastest", () => {
    const result = raceStrategies(
      [strategy("a", "one"), strategy("b", "two"), strategy("c", "three")],
      [
        outcome("a", { measuredMs: 10, verified: false, detail: "produced output nothing checked" }),
        outcome("b", { measuredMs: 500 }),
        outcome("c", { measuredMs: 900 }),
      ],
    );
    expect(result.unverified).toEqual(["a"]);
    expect(result.winner).toBe("b");
    expect(result.summary).toContain("cannot be ranked as a win");
  });

  it("reports no ranking when every run was unverified", () => {
    const result = raceStrategies(
      [strategy("a", "one"), strategy("b", "two")],
      [outcome("a", { verified: false }), outcome("b", { verified: false })],
    );
    expect(result.comparable).toBe(false);
    expect(result.unverified).toHaveLength(2);
  });

  it("excludes a run that did not succeed", () => {
    const result = raceStrategies(
      [strategy("a", "one"), strategy("b", "two"), strategy("c", "three")],
      [outcome("a", { measuredMs: 10, succeeded: false, detail: "errored" }), outcome("b", { measuredMs: 500 }), outcome("c", { measuredMs: 900 })],
    );
    expect(result.winner).toBe("b");
    expect(result.ranking.map((standing) => standing.strategyId)).toEqual(["b", "c"]);
  });
});

describe("placing", () => {
  it("gives distinct places to distinct times", () => {
    const result = raceStrategies(
      [strategy("a", "one"), strategy("b", "two"), strategy("c", "three")],
      [outcome("a", { measuredMs: 300 }), outcome("b", { measuredMs: 100 }), outcome("c", { measuredMs: 200 })],
    );
    expect(result.ranking.map((standing) => standing.place)).toEqual([1, 2, 3]);
    expect(result.ranking.map((standing) => standing.strategyId)).toEqual(["b", "c", "a"]);
  });

  it("is decisive only when there is a single winner", () => {
    const decided = raceStrategies(
      [strategy("a", "one"), strategy("b", "two")],
      [outcome("a", { measuredMs: 100 }), outcome("b", { measuredMs: 200 })],
    );
    expect(isArenaDecisive(decided)).toBe(true);
  });
});
