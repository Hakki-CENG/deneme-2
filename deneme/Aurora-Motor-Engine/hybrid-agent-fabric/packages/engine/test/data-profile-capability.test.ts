/**
 * data.profile — describing a dataset, and checking the description.
 *
 * The load-bearing case is the one that proves the check can fail. A profile
 * whose numbers are merely restated by the same library that produced them is
 * not verified, and the worker re-derives them with Python's stdlib csv module
 * precisely so that "agrees" means something. `summariseChecks` is tested
 * against a lying check for that reason: if the disagreement path were never
 * exercised, `verified: true` would be an assertion about nothing.
 *
 * That path is not hypothetical. The first version of the worker never
 * accumulated any column's sum, so its independent mean was null against a
 * profile that said 25.2, and the result correctly came back unverified. The
 * bug was in the checker and running it is what found it.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";
import {
  DATA_PROFILE_CAPABILITY_ID,
  DATA_PROFILE_MANIFEST,
  summariseChecks,
} from "../src/capabilities/data-profile.js";
import { assessManifest } from "../src/capabilities/manifest.js";

const FIXTURE_CSV = resolve(process.cwd(), "test/fixtures/profile-sample.csv");

// Follows the repository's convention for tests needing a real external
// backend: skip visibly rather than fail. The pure-logic describes always run.
function polarsAvailable(): { ok: boolean; detail: string } {
  try {
    const out = execFileSync("python3", ["-c", "import polars; print(polars.__version__)"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    return { ok: true, detail: out.trim() };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 140) };
  }
}

const POLARS = polarsAvailable();

let root: string | undefined;
let engine: HybridAgentEngine | undefined;

async function bootEngine(): Promise<HybridAgentEngine> {
  root = await mkdtemp(join(tmpdir(), "haf-profile-"));
  engine = new HybridAgentEngine({
    homePath: root,
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
  } as never);
  await engine.initialize();
  return engine;
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
  engine = undefined;
});

function context() {
  return {
    tenantId: "tenant-test",
    sessionId: "00000000-0000-0000-0000-000000000001",
    familyId: "00000000-0000-0000-0000-000000000002",
    turnId: "00000000-0000-0000-0000-000000000003",
    toolCallId: "00000000-0000-0000-0000-000000000004",
    source: "user",
    workspacePath: root ?? tmpdir(),
  } as never;
}

async function profile(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const booted = engine ?? (await bootEngine());
  return (await booted.capabilities.execute(
    DATA_PROFILE_CAPABILITY_ID,
    input,
    context(),
  )) as Record<string, unknown>;
}

describe("the manifest and the check reader, without needing polars installed", () => {
  it("is complete, MIT, and names the fallback it complements", () => {
    expect(assessManifest(DATA_PROFILE_MANIFEST).complete).toBe(true);
    expect(DATA_PROFILE_MANIFEST.provenance.license).toBe("MIT");
    expect(DATA_PROFILE_MANIFEST.provenance.commit).toMatch(/^\d+\.\d+\.\d+$/);
    expect(DATA_PROFILE_MANIFEST.fallbackCapabilityIds).toContain("data.duckdb.query");
  });

  it("declares the missing-value behaviour it cannot avoid", () => {
    const limitation = DATA_PROFILE_MANIFEST.limitations.find((l) => l.includes("empty CSV cells"));
    expect(limitation).toBeDefined();
    // It must say the parameter that does not help, so nobody re-litigates it.
    expect(limitation).toContain("null_values");
    expect(limitation).toContain("schema_overrides");
  });

  it("says plainly what the independent check does not cover", () => {
    expect(
      DATA_PROFILE_MANIFEST.limitations.some((l) => l.includes("not every statistic")),
    ).toBe(true);
  });

  it("reads agreeing checks as agreeing", () => {
    const summary = summariseChecks({
      rowCount: { agrees: true, profile: 120, independent: 120 },
      columnCount: { agrees: true, profile: 5, independent: 5 },
    });
    expect(summary.allAgree).toBe(true);
    expect(summary.evaluated).toBe(2);
    expect(summary.disagreements).toEqual([]);
  });

  it("reads a disagreeing check as a failure, and says what differed", () => {
    // The path that makes `verified: true` mean anything. Never exercised, it
    // would be a flag that is always on.
    const summary = summariseChecks({
      rowCount: { agrees: true, profile: 120, independent: 120 },
      numericMean: { agrees: false, column: "adet", profile: 25.2, independent: 25.9 },
    });
    expect(summary.allAgree).toBe(false);
    expect(summary.disagreements).toHaveLength(1);
    expect(summary.disagreements[0]).toContain("numericMean");
    expect(summary.disagreements[0]).toContain("25.9");
  });

  it("reports every disagreement, not just the first", () => {
    const summary = summariseChecks({
      a: { agrees: false, profile: 1, independent: 2 },
      b: { agrees: true },
      c: { agrees: false, profile: 3, independent: 4 },
    });
    expect(summary.evaluated).toBe(3);
    expect(summary.disagreements).toHaveLength(2);
  });
});

describe.skipIf(!POLARS.ok)("profiling a real dataset", () => {
  it("is registered with its manifest", async () => {
    const booted = await bootEngine();

    expect(booted.capabilities.list().some((c) => c.id === DATA_PROFILE_CAPABILITY_ID)).toBe(true);
    expect(engine!.capabilities.manifestFor(DATA_PROFILE_CAPABILITY_ID)?.provenance.license).toBe(
      "MIT",
    );
  }, 120_000);

  it("reports the fixture's real shape, types and missing values", async () => {
    await bootEngine();
    await copyFile(FIXTURE_CSV, join(root!, "data.csv"));

    const out = await profile({ path: "data.csv" });

    expect(out.status).toBe("executed");
    expect(out.profiled).toBe(true);
    expect(out.rowCount).toBe(120);
    expect(out.columnCount).toBe(5);

    const columns = out.columns as Array<Record<string, unknown>>;
    const byName = Object.fromEntries(columns.map((c) => [c.name as string, c]));

    expect(byName.bolge!.dtype).toBe("String");
    expect(byName.adet!.dtype).toContain("Int");
    expect(byName.fiyat!.dtype).toContain("Float");

    // Every fifth row was written with an empty `not` cell, so 24 of 120.
    expect(byName.not!.nullCount).toBe(24);
    expect(byName.bolge!.nullCount).toBe(0);
    expect(byName.bolge!.distinctCount).toBe(3);
  }, 300_000);

  it("verifies the profile against an independent re-derivation", async () => {
    await bootEngine();
    await copyFile(FIXTURE_CSV, join(root!, "data.csv"));

    const out = await profile({ path: "data.csv" });

    expect(out.verified).toBe(true);
    expect(out.unchecked).toBe(false);
    expect(out.disagreements).toEqual([]);
    // Row count, column count, null counts, numeric mean, invariants.
    expect(out.checksEvaluated).toBeGreaterThanOrEqual(5);

    const checks = out.checks as Record<string, { agrees: boolean; profile?: unknown; independent?: unknown }>;
    expect(checks.rowCount!.agrees).toBe(true);
    expect(checks.rowCount!.profile).toBe(120);
    expect(checks.rowCount!.independent).toBe(120);
    // The mean was summed and divided from the raw cells by different code.
    expect(checks.numericMean!.agrees).toBe(true);
    expect(checks.numericMean!.profile).toBe(checks.numericMean!.independent);
    expect(String(out.checkDetail)).toContain("agreed");
  }, 300_000);

  it("summarises numeric columns and ranks categorical ones", async () => {
    await bootEngine();
    await copyFile(FIXTURE_CSV, join(root!, "data.csv"));

    const out = await profile({ path: "data.csv", sampleValues: 2 });
    const columns = out.columns as Array<Record<string, unknown>>;
    const byName = Object.fromEntries(columns.map((c) => [c.name as string, c]));

    const adet = byName.adet!;
    expect(typeof adet.mean).toBe("number");
    expect(typeof adet.min).toBe("number");
    expect(typeof adet.max).toBe("number");
    expect(Number(adet.min)).toBeLessThanOrEqual(Number(adet.max));

    const top = byName.bolge!.topValues as Array<{ value: string; count: number }>;
    expect(top).toHaveLength(2);
    // Counts must descend, or "top" means nothing.
    expect(top[0]!.count).toBeGreaterThanOrEqual(top[1]!.count);
  }, 300_000);

  it("carries the missing-value caveat into the result, not just the manifest", async () => {
    await bootEngine();
    await copyFile(FIXTURE_CSV, join(root!, "data.csv"));

    const out = await profile({ path: "data.csv" });

    expect(String(out.missingValueNote)).toContain("empty cells are counted as missing");
  }, 300_000);
});

describe.skipIf(!POLARS.ok)("inputs that must not produce a profile", () => {
  it("refuses a path outside the workspace", async () => {
    await bootEngine();

    const out = await profile({ path: "../../etc/passwd" });

    expect(out.profiled).toBe(false);
    expect(String(out.reason)).toContain("escapes the workspace");
  }, 120_000);

  it("refuses a file that is not CSV or TSV", async () => {
    await bootEngine();
    await writeFile(join(root!, "notes.txt"), "a,b\n1,2\n");

    const out = await profile({ path: "notes.txt" });

    expect(out.profiled).toBe(false);
    expect(String(out.reason)).toContain("not a CSV or TSV");
  }, 120_000);

  it("reports an empty file and a header-only file, distinctly", async () => {
    await bootEngine();
    await writeFile(join(root!, "empty.csv"), "");
    await writeFile(join(root!, "headeronly.csv"), "a,b\n");

    const empty = await profile({ path: "empty.csv" });
    expect(empty.profiled).toBe(false);
    expect(String(empty.reason)).toContain("empty");

    const headerOnly = await profile({ path: "headeronly.csv" });
    expect(headerOnly.profiled).toBe(false);
    expect(String(headerOnly.reason)).toContain("no data rows");
  }, 180_000);

  it("reports a malformed CSV as a parse failure rather than a partial profile", async () => {
    await bootEngine();
    await writeFile(join(root!, "bad.csv"), 'a,b\n1,"unclosed\n2,x\n');

    const out = await profile({ path: "bad.csv" });

    expect(out.profiled).toBe(false);
    expect(String(out.reason)).toContain("could not be parsed");
  }, 180_000);

  it("rejects a nonsensical sampleValues at the input schema, before anything runs", async () => {
    await bootEngine();
    await copyFile(FIXTURE_CSV, join(root!, "data.csv"));

    // Written expecting the worker's own range check to answer. It never gets
    // the chance: the capability's zod schema bounds sampleValues at 20, so the
    // broker rejects the call during validation and no subprocess is spawned.
    // That is the stronger result, and it is what is asserted. The worker's
    // check remains as a second layer for anything that reaches it another way.
    await expect(profile({ path: "data.csv", sampleValues: 99 })).rejects.toThrow(
      /less than or equal to 20|too_big/i,
    );
  }, 180_000);
});
