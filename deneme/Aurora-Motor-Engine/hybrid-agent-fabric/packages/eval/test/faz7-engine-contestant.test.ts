/**
 * FAZ 7 3/3 — the engine-backed contestant, and an arena that runs end to end.
 *
 * The mapping test is the one that matters: a report claiming `succeeded`
 * without a passing verification must score as *unverified* success, so the
 * arena cannot become a way around FAZ 6's rule.
 */

import { describe, expect, it } from "vitest";
import { autonomyFor } from "@haf/engine";
import type { VerificationReport } from "@haf/engine";

import { engineContestant, runCodingArena, taskResultFromReport } from "../src/benchmarking/engine-contestant.js";
import type { EngineRunner, ScorableReport } from "../src/benchmarking/engine-contestant.js";

// `autonomy` comes from the engine's own mapping so this fixture cannot drift
// away from what a real report carries.
const pass: VerificationReport = {
  verdict: "pass",
  results: [],
  strongestTier: "V2_empirical",
  autonomy: autonomyFor("V2_empirical"),
  status: "succeeded",
  summary: "executed tests passed",
};

const uncertain: VerificationReport = { ...pass, verdict: "uncertain", strongestTier: "V3_consensus", status: "unverified" };

function report(fields: Partial<ScorableReport> = {}): ScorableReport {
  return { status: "succeeded", verification: pass, attempts: 1, durationMs: 100, ...fields };
}

/** An engine that returns a scripted report per description. */
function scriptedEngine(byDescription: Record<string, ScorableReport>): EngineRunner & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    execute: async (description) => {
      calls.push(description);
      const found = byDescription[description];
      if (found === undefined) throw new Error(`no scripted report for: ${description}`);
      return found;
    },
  };
}

describe("taskResultFromReport reuses the engine's own vocabulary", () => {
  it("counts a verified success as verified", () => {
    const result = taskResultFromReport("t", report());
    expect(result).toMatchObject({ success: true, verified: true, completed: true, recovered: false, latencyMs: 100 });
  });

  it("does not let a self-assessed success claim verification", () => {
    // FAZ 6's rule, seen from the arena side: `succeeded` with no passing
    // verification is an unverified success, and ranks below a verified one.
    const result = taskResultFromReport("t", report({ verification: undefined }));
    expect(result.success).toBe(true);
    expect(result.verified).toBe(false);
  });

  it("does not let an uncertain verification count as a pass", () => {
    const result = taskResultFromReport("t", report({ verification: uncertain }));
    expect(result.verified).toBe(false);
  });

  it("does not count `executed` as success", () => {
    // The engine's own comment: code that ran without being checked is not code
    // that worked.
    const result = taskResultFromReport("t", report({ status: "executed", verification: undefined }));
    expect(result.success).toBe(false);
    expect(result.completed).toBe(true);
  });

  it("counts a failure as work that ran, not as success", () => {
    const result = taskResultFromReport("t", report({ status: "failed", verification: undefined }));
    expect(result.success).toBe(false);
    expect(result.completed).toBe(true);
  });

  it("does not count skipped work as work that ran", () => {
    const result = taskResultFromReport("t", report({ status: "skipped", verification: undefined }));
    expect(result.completed).toBe(false);
  });

  it("counts recovery only when a retry actually succeeded", () => {
    expect(taskResultFromReport("t", report({ attempts: 3 })).recovered).toBe(true);
    expect(taskResultFromReport("t", report({ attempts: 3, status: "failed", verification: undefined })).recovered).toBe(false);
    expect(taskResultFromReport("t", report({ attempts: 1 })).recovered).toBe(false);
  });
});

describe("engineContestant drives the engine", () => {
  it("executes each task description and maps the report", async () => {
    const engine = scriptedEngine({ "refactor the parser": report() });
    const contestant = engineContestant("aurora", engine, { "refactor-1": "refactor the parser" });

    const result = await contestant.run!("refactor-1");
    expect(result).toMatchObject({ taskId: "refactor-1", success: true, verified: true });
    expect(engine.calls).toEqual(["refactor the parser"]);
  });

  it("reports an undefined task as not completed rather than inventing a failure", async () => {
    const engine = scriptedEngine({});
    const contestant = engineContestant("aurora", engine, {});
    const result = await contestant.run!("missing-task");
    expect(result).toMatchObject({ taskId: "missing-task", completed: false });
    expect(engine.calls).toEqual([]);
  });
});

describe("runCodingArena end to end", () => {
  it("produces no headline when no rival is installed", async () => {
    const engine = scriptedEngine({ "fix the bug": report() });

    const { headline, report: arenaReport, outcome } = await runCodingArena(
      "debugging",
      { "debug-1": "fix the bug" },
      engine,
      { rivals: [{ agent: "codex", binary: "codex", run: async (taskId) => ({ taskId, success: true }) }] },
    );

    // The rival binary is not on this machine, so there is no comparison.
    expect(outcome.declined.map((entry) => entry.agent)).toEqual(["codex"]);
    expect(arenaReport.comparable).toBe(false);
    expect(headline).toBeUndefined();
    expect(engine.calls).toEqual(["fix the bug"]);
  });

  it("produces a headline when an opponent can actually run", async () => {
    const engine = scriptedEngine({ "fix the bug": report() });

    // `node` is present, so this exercises the real end-to-end path rather than
    // only the decline path. The opponent's result is supplied by the test.
    const { headline, report: arenaReport } = await runCodingArena(
      "debugging",
      { "debug-1": "fix the bug" },
      engine,
      { rivals: [{ agent: "node-stand-in", binary: "node", run: async (taskId) => ({ taskId, success: true }) }] },
    );

    expect(arenaReport.comparable).toBe(true);
    expect(arenaReport.wins).toBe(1);
    expect(headline).toContain("won 1, drew 0 and lost 0 of 1 opposed task(s)");
  });

  it("runs every task in the family through the engine", async () => {
    const engine = scriptedEngine({ "fix the bug": report(), "rename the symbol": report() });
    const { outcome } = await runCodingArena(
      "refactor",
      { "refactor-1": "fix the bug", "refactor-2": "rename the symbol" },
      engine,
    );
    expect(engine.calls.sort()).toEqual(["fix the bug", "rename the symbol"]);
    expect(outcome.runs[0]?.results).toHaveLength(2);
  });
});
