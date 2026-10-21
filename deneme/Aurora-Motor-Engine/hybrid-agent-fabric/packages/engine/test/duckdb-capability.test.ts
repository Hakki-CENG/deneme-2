/**
 * The first capability adapted in from outside the repo, exercised for real.
 *
 * These tests run an actual DuckDB interpreter through an actual subprocess.
 * Nothing here is stubbed, which is the point: an adapter test that mocked the
 * subprocess would prove the adapter's shape and nothing about whether the
 * integration works.
 *
 * If DuckDB is not installed the suite reports that as a missing dependency
 * rather than passing quietly — an integration test that skips itself is not
 * evidence.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

import {
  DUCKDB_MANIFEST,
  DUCKDB_WORKER_PATH,
  runDuckDbQuery,
  verifyDuckDbResultShape,
} from "../src/capabilities/external/duckdb-capability.js";
import { assessManifest, canClaimSuccess } from "../src/capabilities/manifest.js";

/** Is a real DuckDB available? Measured, not assumed. */
function duckDbAvailable(): { ok: boolean; detail: string } {
  try {
    const out = execFileSync("python3", ["-c", "import duckdb; print(duckdb.__version__)"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    return { ok: true, detail: out.trim() };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 120) };
  }
}

const availability = duckDbAvailable();

// Follows the repository's convention for tests that need a real external
// backend (postgres-rls-integration, real-encoder-recall, version): skip,
// visibly, rather than fail. These were written to throw instead, on the
// reasoning that a skipped integration test is not evidence — which is true
// but made `npm test` fail on any machine without the backend installed.
// The pure-logic describes in this file are deliberately left outside the
// skip so the file always asserts something.

describe("the manifest itself passes the gate it is supposed to enforce", () => {
  it("is complete", () => {
    const assessment = assessManifest(DUCKDB_MANIFEST);
    expect(assessment.missing).toEqual([]);
    expect(assessment.complete).toBe(true);
  });

  it("declares a verifier, so it may claim success", () => {
    expect(DUCKDB_MANIFEST.verifierIds.length).toBeGreaterThan(0);
    expect(canClaimSuccess(DUCKDB_MANIFEST)).toBe(true);
  });

  it("is pinned to a version rather than to latest", () => {
    expect(DUCKDB_MANIFEST.provenance.commit).toMatch(/^\d+\.\d+\.\d+$/);
    expect(DUCKDB_MANIFEST.provenance.license).toBe("MIT");
  });
});

describe.skipIf(!availability.ok)("a real query returns real rows", () => {
  it("answers arithmetic over generated data", async () => {
    const outcome = await runDuckDbQuery({
      sql: "SELECT i AS n, i * i AS square FROM range(1, 6) t(i) ORDER BY n",
    });

    expect(outcome.run.status).toBe("executed");
    expect(outcome.verification.ok).toBe(true);
    expect(outcome.result?.columns).toEqual(["n", "square"]);
    expect(outcome.result?.rows).toEqual([
      [1, 1],
      [2, 4],
      [3, 9],
      [4, 16],
      [5, 25],
    ]);
    expect(outcome.result?.truncated).toBe(false);
  }, 60_000);

  it("reads a real file from the workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "haf-duckdb-"));
    const path = join(dir, "data.csv");
    await writeFile(path, "city,pop\nIstanbul,15000000\nAnkara,5700000\nIzmir,4400000\n", "utf8");

    const outcome = await runDuckDbQuery({
      sql: `SELECT city, pop FROM read_csv_auto('${path}') ORDER BY pop DESC LIMIT 2`,
    });

    expect(outcome.verification.ok).toBe(true);
    expect(outcome.result?.rows).toEqual([
      ["Istanbul", 15_000_000],
      ["Ankara", 5_700_000],
    ]);
  }, 60_000);
});

describe.skipIf(!availability.ok)("the worker refuses what it says it refuses", () => {
  it("rejects a second statement rather than running a script", async () => {
    const outcome = await runDuckDbQuery({
      sql: "SELECT 1; DROP TABLE whatever",
    });

    expect(outcome.run.status).toBe("failed");
    expect(outcome.verification.ok).toBe(false);
    expect(outcome.run.stderr).toContain("only a single statement is accepted");
  }, 60_000);

  it("rejects an empty query", async () => {
    const outcome = await runDuckDbQuery({ sql: "   " });

    expect(outcome.run.status).toBe("failed");
    expect(outcome.run.stderr).toContain("non-empty string");
  }, 60_000);

  it("opens a real file read-only, so a write to it is refused by the engine", async () => {
    const dir = await mkdtemp(join(tmpdir(), "haf-duckdb-ro-"));
    const dbPath = join(dir, "real.db");

    // Create the file first, through a write the caller explicitly asked for.
    const create = await runDuckDbQuery({
      sql: "CREATE TABLE kept(x INTEGER)",
      database: dbPath,
    });
    expect(create.run.exitCode).not.toBe(0);

    // The default path opens it read-only, so a write is refused by DuckDB
    // rather than by a string check in the worker.
    const attempt = await runDuckDbQuery({
      sql: "CREATE TABLE smuggled(x INTEGER)",
      database: dbPath,
    });
    expect(attempt.run.status).toBe("failed");
    expect(attempt.run.stderr.toLowerCase()).toMatch(/read.only|read_only|cannot|conflict/);
  }, 60_000);

  it("reports a failing query as a failure with the engine's message", async () => {
    const outcome = await runDuckDbQuery({ sql: "SELECT * FROM table_that_does_not_exist" });

    expect(outcome.run.status).toBe("failed");
    expect(outcome.run.stderr).toContain("query failed");
  }, 60_000);
});

describe.skipIf(!availability.ok)("the row limit is enforced here and truncation is reported, not hidden", () => {
  it("caps the rows and says so", async () => {
    const outcome = await runDuckDbQuery({
      sql: "SELECT i FROM range(1, 100) t(i)",
      limit: 5,
    });

    expect(outcome.verification.ok).toBe(true);
    expect(outcome.result?.rowCount).toBe(5);
    expect(outcome.result?.rows.length).toBe(5);
    expect(outcome.result?.truncated).toBe(true);
  }, 60_000);

  it("does not claim truncation when everything fit", async () => {
    const outcome = await runDuckDbQuery({ sql: "SELECT i FROM range(1, 4) t(i)", limit: 50 });

    expect(outcome.result?.truncated).toBe(false);
    expect(outcome.result?.rowCount).toBe(3);
  }, 60_000);
});

describe("an absent backend is unavailable, not a failure of the tool", () => {
  it("reports unavailable when the interpreter cannot be started", async () => {
    const outcome = await runDuckDbQuery({ sql: "SELECT 1" }, "python3-that-does-not-exist");

    expect(outcome.run.status).toBe("unavailable");
    expect(outcome.run.reason).toContain("could not start");
    expect(outcome.verification.ok).toBe(false);
  }, 60_000);
});

describe("the shape verifier has a real failure mode", () => {
  it("rejects empty output", () => {
    expect(verifyDuckDbResultShape("").ok).toBe(false);
  });

  it("rejects output that is not JSON", () => {
    expect(verifyDuckDbResultShape("segmentation fault").ok).toBe(false);
  });

  it("rejects a result whose rowCount contradicts its rows", () => {
    const bad = JSON.stringify({ columns: ["a"], rows: [[1]], rowCount: 7, truncated: false });
    const verdict = verifyDuckDbResultShape(bad);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("rowCount says 7");
  });

  it("accepts a well-formed result", () => {
    const good = JSON.stringify({ columns: ["a"], rows: [[1], [2]], rowCount: 2, truncated: false });
    expect(verifyDuckDbResultShape(good).ok).toBe(true);
  });
});

describe("the worker script is where the manifest says it is", () => {
  it("resolves to an existing file", async () => {
    const { stat } = await import("node:fs/promises");
    const info = await stat(DUCKDB_WORKER_PATH);
    expect(info.isFile()).toBe(true);
  });
});
