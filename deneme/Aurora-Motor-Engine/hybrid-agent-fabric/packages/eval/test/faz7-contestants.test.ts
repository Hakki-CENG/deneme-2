/**
 * FAZ 7 2/3 — contestants.
 *
 * The availability check does real filesystem work, so these tests assert what
 * this machine actually has rather than what a comment claims. The test that
 * names the rival agents from FAZ 7's list is the one that turns "no rival is
 * installed" from an assertion into a measurement.
 */

import { describe, expect, it } from "vitest";

import { arenaHeadline } from "../src/benchmarking/arena.js";
import {
  binaryAvailable,
  externalContestant,
  localContestant,
  runArenaFamily,
} from "../src/benchmarking/contestants.js";
import type { ComparisonTaskResult } from "../src/benchmarking/comparison.js";

const ok = (taskId: string, verified = true): ComparisonTaskResult => ({
  taskId,
  success: true,
  verified,
  completed: true,
});

describe("binaryAvailable measures the real PATH", () => {
  it("finds a binary that exists", async () => {
    const found = await binaryAvailable("node");
    expect(found.available).toBe(true);
  });

  it("reports a binary that does not exist, with the reason", async () => {
    const missing = await binaryAvailable("definitely-not-an-installed-agent-binary");
    expect(missing.available).toBe(false);
    expect(missing.reason).toContain("was not found executable on PATH");
  });

  it("does not claim the rival coding agents are installed", async () => {
    // FAZ 7 names these. This asserts a measured fact about this machine: if one
    // ever becomes available the test fails, which is the point — the arena's
    // "no comparison possible" would then be wrong too.
    const rivals = ["claude", "claude-code", "codex", "openhands", "opencode", "prime"];
    // Sequential: Array.filter cannot take an async predicate (it would keep
    // every element, since a Promise is truthy).
    const available: string[] = [];
    for (const binary of rivals) {
      const status = await binaryAvailable(binary);
      if (status.available) available.push(binary);
    }
    expect(available).toEqual([]);
  });
});

describe("an external contestant with no binary cannot run", () => {
  it("has no run function and says why", async () => {
    const contestant = await externalContestant("codex", "codex", async (taskId) => ok(taskId));
    expect(contestant.availability.available).toBe(false);
    expect(contestant.run).toBeUndefined();
    expect(contestant.availability.reason).toContain("not found executable on PATH");
  });

  it("can run when the binary is present", async () => {
    const contestant = await externalContestant("node-agent", "node", async (taskId) => ok(taskId));
    expect(contestant.availability.available).toBe(true);
    expect(contestant.run).toBeDefined();
  });
});

describe("runArenaFamily", () => {
  it("produces a real comparison between two contestants that ran", async () => {
    const outcome = await runArenaFamily("refactor", ["refactor-1"], [
      localContestant("aurora", async (taskId) => ok(taskId, true)),
      localContestant("stand-in", async (taskId) => ok(taskId, false)),
    ]);

    expect(outcome.report.comparable).toBe(true);
    expect(outcome.report.wins).toBe(1);
    expect(outcome.declined).toEqual([]);
    expect(arenaHeadline(outcome.report)).toContain("won 1, drew 0 and lost 0 of 1 opposed task(s)");
  });

  it("records declined contestants and refuses a headline", async () => {
    const codex = await externalContestant("codex", "codex", async (taskId) => ok(taskId));
    const openhands = await externalContestant("openhands", "openhands", async (taskId) => ok(taskId));

    const outcome = await runArenaFamily("refactor", ["refactor-1"], [
      localContestant("aurora", async (taskId) => ok(taskId)),
      codex,
      openhands,
    ]);

    // Both rivals declined, so there is no comparison — and no win rate.
    expect(outcome.declined.map((entry) => entry.agent).sort()).toEqual(["codex", "openhands"]);
    expect(outcome.declined.every((entry) => entry.reason?.includes("not found executable on PATH"))).toBe(true);
    expect(outcome.runs.map((run) => run.agent)).toEqual(["aurora"]);
    expect(outcome.report.comparable).toBe(false);
    expect(outcome.report.wins).toBe(0);
    expect(arenaHeadline(outcome.report)).toBeUndefined();
  });

  it("gives a declined contestant no results at all", async () => {
    const codex = await externalContestant("codex", "codex", async (taskId) => ok(taskId));
    const outcome = await runArenaFamily("refactor", ["refactor-1", "refactor-2"], [
      localContestant("aurora", async (taskId) => ok(taskId)),
      codex,
    ]);
    // A synthesised result for a contestant that never ran would be a fabricated
    // comparison. There must be exactly one run, and it is Aurora's.
    expect(outcome.runs).toHaveLength(1);
    expect(outcome.runs[0]?.results).toHaveLength(2);
  });

  it("names tasks nobody ran", async () => {
    const outcome = await runArenaFamily("refactor", ["refactor-1"], []);
    expect(outcome.unrunTaskIds).toEqual(["refactor-1"]);
    expect(outcome.runs).toEqual([]);
    expect(outcome.report.comparable).toBe(false);
    expect(arenaHeadline(outcome.report)).toBeUndefined();
  });

  it("records provenance so a number can be traced to how it was obtained", async () => {
    const outcome = await runArenaFamily("refactor", ["refactor-1"], [
      localContestant("aurora", async (taskId) => ok(taskId), "engine mock"),
    ]);
    expect(outcome.runs[0]?.source).toBe("engine mock");
  });
});
