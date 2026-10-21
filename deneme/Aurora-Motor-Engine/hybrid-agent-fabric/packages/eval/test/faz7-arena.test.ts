/**
 * FAZ 7 — Coding Expert Arena.
 *
 * The rules that matter are the ones that stop a number appearing where no
 * comparison happened. The last block is the state of this repository: no rival
 * coding agent is installed, so the arena must refuse a headline rather than
 * report a win rate against nobody.
 */

import { describe, expect, it } from "vitest";

import { arenaHeadline, rankResult, scoreArenaFamily } from "../src/benchmarking/arena.js";
import type { ComparisonRun, ComparisonTaskResult } from "../src/benchmarking/comparison.js";

function result(taskId: string, fields: Partial<ComparisonTaskResult> = {}): ComparisonTaskResult {
  return { taskId, ...fields };
}

const aurora = (results: ComparisonTaskResult[]): ComparisonRun => ({ agent: "aurora", results, source: "this repo" });
const rival = (agent: string, results: ComparisonTaskResult[]): ComparisonRun => ({ agent, results, source: "external" });

describe("rankResult", () => {
  it("orders verified above unverified above completed above nothing", () => {
    expect(rankResult(result("t", { verified: true, success: true })).rank).toBe(3);
    expect(rankResult(result("t", { success: true })).rank).toBe(2);
    expect(rankResult(result("t", { completed: true })).rank).toBe(1);
    expect(rankResult(result("t")).rank).toBe(0);
    expect(rankResult(undefined).rank).toBe(0);
  });

  it("does not let success alone claim verified", () => {
    expect(rankResult(result("t", { success: true })).label).toBe("unverified success");
  });
});

describe("head-to-head verdicts", () => {
  it("scores a win when the baseline is verified and the rival is not", () => {
    const report = scoreArenaFamily(
      "refactor",
      [aurora([result("refactor-1", { verified: true, success: true })]), rival("codex", [result("refactor-1", { success: true })])],
      "aurora",
    );
    expect(report.comparable).toBe(true);
    expect(report.wins).toBe(1);
    expect(report.verdicts[0]?.reason).toContain("verified success beats codex's unverified success");
  });

  it("scores a loss when the rival did better", () => {
    const report = scoreArenaFamily(
      "refactor",
      [aurora([result("refactor-1", { completed: true })]), rival("codex", [result("refactor-1", { verified: true, success: true })])],
      "aurora",
    );
    expect(report.losses).toBe(1);
    expect(report.verdicts[0]?.reason).toContain("beats the baseline's completed without success");
  });

  it("scores a draw when both reached the same place", () => {
    const report = scoreArenaFamily(
      "refactor",
      [aurora([result("refactor-1", { success: true })]), rival("codex", [result("refactor-1", { success: true })])],
      "aurora",
    );
    expect(report.draws).toBe(1);
    expect(report.verdicts[0]?.reason).toContain("both reached unverified success");
  });

  it("labels a draw between two failures as what it is", () => {
    const report = scoreArenaFamily(
      "refactor",
      [aurora([result("refactor-1")]), rival("codex", [result("refactor-1")])],
      "aurora",
    );
    expect(report.draws).toBe(1);
    expect(report.verdicts[0]?.reason).toContain("not a shared success");
  });

  it("measures against the field's best showing, not its average", () => {
    const report = scoreArenaFamily(
      "refactor",
      [
        aurora([result("refactor-1", { success: true })]),
        rival("codex", [result("refactor-1")]),
        rival("openhands", [result("refactor-1", { verified: true, success: true })]),
      ],
      "aurora",
    );
    // One rival failed, but the other verified — that is a loss, not a win.
    expect(report.losses).toBe(1);
    expect(report.verdicts[0]?.opponent?.agent).toBe("openhands");
  });
});

describe("tasks without an opponent are not wins", () => {
  it("reports no-verdict for a task only the baseline ran", () => {
    const report = scoreArenaFamily(
      "refactor",
      [aurora([result("refactor-1", { verified: true, success: true }), result("refactor-2", { verified: true, success: true })]), rival("codex", [result("refactor-1", { success: true })])],
      "aurora",
    );
    expect(report.wins).toBe(1);
    expect(report.noVerdicts).toBe(1);
    expect(report.verdicts.find((v) => v.taskId === "refactor-2")?.verdict).toBe("no-verdict");
    expect(report.honestNotes.some((n) => n.includes("excluded from the tally rather than counted as wins"))).toBe(true);
  });

  it("reports a loss for a task only the rival ran", () => {
    const report = scoreArenaFamily(
      "refactor",
      [aurora([result("refactor-1", { success: true })]), rival("codex", [result("refactor-1", { success: true }), result("refactor-2", { verified: true, success: true })])],
      "aurora",
    );
    expect(report.losses).toBe(1);
    expect(report.verdicts.find((v) => v.taskId === "refactor-2")?.reason).toContain("the baseline did not run this task");
  });
});

describe("an arena with nobody to compare against produces no number", () => {
  it("refuses a headline when only the baseline ran", () => {
    const report = scoreArenaFamily(
      "refactor",
      [aurora([result("refactor-1", { verified: true, success: true })])],
      "aurora",
      {
        availability: [
          { agent: "claude-code", available: false, reason: "not installed in this sandbox" },
          { agent: "codex", available: false, reason: "not installed in this sandbox" },
        ],
      },
    );

    // Not 100%. Not a win. Nothing to print.
    expect(report.comparable).toBe(false);
    expect(report.wins).toBe(0);
    expect(report.verdicts.every((v) => v.verdict === "no-verdict")).toBe(true);
    expect(arenaHeadline(report)).toBeUndefined();
    expect(report.unavailable.map((u) => u.agent)).toEqual(["claude-code", "codex"]);
    expect(report.honestNotes.some((n) => n.includes("not installed in this sandbox"))).toBe(true);
  });

  it("refuses a headline when the baseline itself produced nothing", () => {
    const report = scoreArenaFamily("refactor", [rival("codex", [result("refactor-1", { success: true })])], "aurora");
    expect(report.comparable).toBe(false);
    expect(arenaHeadline(report)).toBeUndefined();
    expect(report.honestNotes.some((n) => n.includes("the baseline agent \"aurora\" produced no results"))).toBe(true);
  });

  it("produces a headline only when a comparison actually happened", () => {
    const report = scoreArenaFamily(
      "refactor",
      [aurora([result("refactor-1", { verified: true, success: true })]), rival("codex", [result("refactor-1", { success: true })])],
      "aurora",
    );
    const headline = arenaHeadline(report);
    expect(headline).toBeDefined();
    expect(headline).toContain("won 1, drew 0 and lost 0 of 1 opposed task(s)");
    expect(headline).toContain("100% win rate");
  });
});

describe("families", () => {
  it("scores only the tasks in the named family", () => {
    const report = scoreArenaFamily(
      "refactor",
      [
        aurora([result("refactor-1", { verified: true, success: true }), result("perf-1", { verified: true, success: true })]),
        rival("codex", [result("refactor-1", { success: true }), result("perf-1")]),
      ],
      "aurora",
      { familyOf: (taskId) => taskId.split("-")[0] as string },
    );
    expect(report.verdicts.map((v) => v.taskId)).toEqual(["refactor-1"]);
    expect(report.wins).toBe(1);
  });
});
