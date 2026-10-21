/**
 * P1.1: the execution contract as a measurable value.
 *
 * The point of these cases is the honesty property — that a run which skipped a
 * stage says so, and that an unknown stage name cannot be silently absorbed into
 * a claim of full coverage.
 */
import { describe, expect, it } from "vitest";
import {
  CONVERSATION_CONTRACT,
  CONTRACT_STAGES,
  TASK_CONTRACT,
  contractCoverage,
  coverageAgainstExpected,
  isContractStage,
} from "../src/execution/execution-contract.js";

describe("the contract itself", () => {
  it("names the nine stages in travel order", () => {
    expect(CONTRACT_STAGES).toEqual([
      "understand", "recall", "plan", "route", "execute", "observe", "verify", "recover", "learn",
    ]);
  });

  it("recognises its own stages and nothing else", () => {
    expect(isContractStage("verify")).toBe(true);
    expect(isContractStage("Validate")).toBe(false);
    expect(isContractStage("")).toBe(false);
  });
});

describe("contractCoverage", () => {
  it("names the skipped stages rather than implying them", () => {
    const covered = contractCoverage(["route", "execute", "observe"]);
    expect(covered.performed).toEqual(["route", "execute", "observe"]);
    expect(covered.skipped).toEqual(["understand", "recall", "plan", "verify", "recover", "learn"]);
  });

  it("reports full coverage only when everything ran", () => {
    expect(contractCoverage(TASK_CONTRACT).coverage).toBe(1);
    expect(contractCoverage(TASK_CONTRACT).skipped).toEqual([]);
  });

  it("measures an empty run as zero, not as complete", () => {
    const covered = contractCoverage([]);
    expect(covered.coverage).toBe(0);
    expect(covered.performed).toEqual([]);
    expect(covered.skipped).toEqual([...CONTRACT_STAGES]);
  });

  it("deduplicates and orders regardless of input order", () => {
    const covered = contractCoverage(["learn", "route", "route"]);
    expect(covered.performed).toEqual(["route", "learn"]);
  });

  it("rejects an unknown stage instead of silently dropping it", () => {
    // A caller that reports a stage which does not exist is buggy; absorbing the
    // name would let it claim coverage it never earned.
    expect(() => contractCoverage(["route", "teleport"])).toThrow(/not a contract stage/);
  });
});

describe("coverageAgainstExpected", () => {
  it("scores a conversation against what a conversation owes", () => {
    const result = coverageAgainstExpected(["route", "execute", "observe"], CONVERSATION_CONTRACT);
    expect(result.coverage).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it("shows what a conversation is missing when it skips one of its own stages", () => {
    const result = coverageAgainstExpected(["route", "execute"], CONVERSATION_CONTRACT);
    expect(result.missing).toEqual(["observe"]);
    expect(result.coverage).toBeCloseTo(2 / 3, 6);
  });

  it("does not punish a conversation for not planning or learning", () => {
    const result = coverageAgainstExpected(CONVERSATION_CONTRACT, CONVERSATION_CONTRACT);
    expect(result.missing).not.toContain("plan");
    expect(result.missing).not.toContain("learn");
  });

  it("returns zero rather than NaN for an empty expectation", () => {
    expect(coverageAgainstExpected([], []).coverage).toBe(0);
  });
});
