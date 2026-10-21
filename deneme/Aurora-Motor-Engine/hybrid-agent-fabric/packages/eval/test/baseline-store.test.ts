/**
 * Persisted baselines.
 *
 * The properties that matter are the refusal cases: a missing baseline must not
 * be read as an improvement, a corrupt file must not throw, and a rising average
 * must not license a task that regressed or a safety violation that appeared.
 */
import { mkdtemp, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { compareAgainstBaseline, listBaselines, loadBaseline, saveBaseline } from "../src/baselines/baseline-store.js";
import type { BaselineRecord } from "../src/baselines/baseline-store.js";
import { deriveOutcomeMetrics } from "../src/metrics/outcome-metrics.js";
import type { RunRecord } from "../src/tasks/types.js";

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    taskId: "t1",
    domain: "coding",
    succeeded: true,
    verified: true,
    attempts: 1,
    recovered: false,
    toolCalls: 4,
    toolFailures: 0,
    steps: 4,
    costUsd: 0.01,
    durationMs: 1000,
    contextTokens: 500,
    contextBudget: 1000,
    safetyViolations: 0,
    sessions: 1,
    replans: 0,
    ...overrides,
  };
}

function record(runs: RunRecord[], overrides: Partial<BaselineRecord> = {}): BaselineRecord {
  return {
    id: "b1",
    label: "main",
    gitSha: "abc123",
    version: "1.65.0",
    model: "mock",
    generatedAt: "2026-10-01T00:00:00.000Z",
    metrics: deriveOutcomeMetrics(runs),
    runs,
    ...overrides,
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "baseline-store-"));
});

describe("saveBaseline / loadBaseline", () => {
  it("round-trips a record", async () => {
    const runs = [run(), run({ taskId: "t2", domain: "research" })];
    await saveBaseline(dir, record(runs));
    const loaded = await loadBaseline(dir, "b1");
    expect(loaded?.id).toBe("b1");
    expect(loaded?.runs).toHaveLength(2);
    expect(loaded?.metrics.taskSuccess).toBe(1);
  });

  it("leaves no temporary file behind", async () => {
    await saveBaseline(dir, record([run()]));
    const entries = await readdir(dir);
    expect(entries.filter((e) => e.endsWith(".tmp"))).toEqual([]);
  });

  it("returns null rather than throwing for a missing baseline", async () => {
    expect(await loadBaseline(join(dir, "nope"), "b1")).toBeNull();
    expect(await loadBaseline(dir, "absent")).toBeNull();
  });

  it("returns null rather than throwing for a corrupt file", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "baseline-broken.json"), "{not json", "utf8");
    expect(await loadBaseline(dir, "broken")).toBeNull();
  });

  it("rejects a file that is valid JSON but not a baseline", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "baseline-junk.json"), JSON.stringify({ hello: "world" }), "utf8");
    expect(await loadBaseline(dir, "junk")).toBeNull();
  });

  it("makes the most recently saved record the latest", async () => {
    await saveBaseline(dir, record([run()], { id: "old", generatedAt: "2026-09-01T00:00:00.000Z" }));
    await saveBaseline(dir, record([run()], { id: "new", generatedAt: "2026-10-01T00:00:00.000Z" }));
    expect((await loadBaseline(dir))?.id).toBe("new");
    // And latest.json must be parseable on its own.
    expect(JSON.parse(await readFile(join(dir, "latest.json"), "utf8")).id).toBe("new");
  });
});

describe("listBaselines", () => {
  it("lists newest first and skips files that are not baselines", async () => {
    await saveBaseline(dir, record([run()], { id: "old", generatedAt: "2026-09-01T00:00:00.000Z" }));
    await saveBaseline(dir, record([run()], { id: "new", generatedAt: "2026-10-01T00:00:00.000Z" }));
    await writeFile(join(dir, "notes.txt"), "ignore me", "utf8");
    const listed = await listBaselines(dir);
    expect(listed.map((b) => b.id)).toEqual(["new", "old"]);
    expect(listed[0]?.taskSuccess).toBe(1);
  });

  it("returns an empty list for a directory that does not exist", async () => {
    expect(await listBaselines(join(dir, "missing"))).toEqual([]);
  });
});

describe("compareAgainstBaseline", () => {
  it("returns null when there is no baseline, instead of claiming an improvement", async () => {
    expect(await compareAgainstBaseline(join(dir, "nothing"), [run()])).toBeNull();
  });

  it("reports improvement when the candidate is genuinely better", async () => {
    await saveBaseline(dir, record([run({ succeeded: true }), run({ taskId: "t2", succeeded: false })]));
    const result = await compareAgainstBaseline(dir, [run(), run({ taskId: "t2", succeeded: true })]);
    expect(result?.verdict).toBe("improved");
    expect(result?.blocking).toBe(false);
  });

  it("blocks on a task regression even when the aggregate improved", async () => {
    await saveBaseline(
      dir,
      record([run({ taskId: "a", succeeded: false }), run({ taskId: "b", succeeded: true }), run({ taskId: "c", succeeded: false })]),
    );
    // Two new passes lift the average, but task b — which used to pass — breaks.
    const candidate = [run({ taskId: "a", succeeded: true }), run({ taskId: "b", succeeded: false }), run({ taskId: "c", succeeded: true })];
    const result = await compareAgainstBaseline(dir, candidate);
    expect(result?.verdict).toBe("regressed");
    expect(result?.blocking).toBe(true);
    expect(result?.regressions.map((r) => r.taskId)).toEqual(["b"]);
  });

  it("blocks when safety violations rise even if everything else improved", async () => {
    await saveBaseline(dir, record([run({ succeeded: false }), run({ taskId: "t2", succeeded: false })]));
    const result = await compareAgainstBaseline(dir, [run({ safetyViolations: 1 }), run({ taskId: "t2" })]);
    expect(result?.blocking).toBe(true);
    expect(result?.reasons.join(" ")).toContain("safety violations rose");
  });

  it("compares against a named baseline rather than the latest when asked", async () => {
    await saveBaseline(dir, record([run({ succeeded: false })], { id: "strict", generatedAt: "2026-09-01T00:00:00.000Z" }));
    await saveBaseline(dir, record([run()], { id: "lenient", generatedAt: "2026-10-01T00:00:00.000Z" }));
    const result = await compareAgainstBaseline(dir, [run()], { baselineId: "strict" });
    expect(result?.baselineId).toBe("strict");
    expect(result?.verdict).toBe("improved");
  });
});
