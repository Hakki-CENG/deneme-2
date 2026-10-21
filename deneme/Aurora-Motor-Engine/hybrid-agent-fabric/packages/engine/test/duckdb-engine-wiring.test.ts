/**
 * The DuckDB capability is reachable from a booted engine, not just from a
 * function in a module.
 *
 * This is the test that decides whether the integration is real. An adapter
 * that works when called directly but is not registered with the broker cannot
 * be selected by any plan, which makes it a library rather than a capability —
 * the exact gap this repo keeps closing.
 *
 * Boots a real HybridAgentEngine and drives the capability through the real
 * CapabilityBroker, against a real DuckDB interpreter.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";
import { DUCKDB_CAPABILITY_ID } from "../src/capabilities/duckdb.js";

let root: string | undefined;

function duckDbAvailable(): boolean {
  try {
    execFileSync("python3", ["-c", "import duckdb"], { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

const HAS_DUCKDB = duckDbAvailable();

// Follows the repository's convention for tests that need a real external
// backend (postgres-rls-integration, real-encoder-recall, version): skip,
// visibly, rather than fail. These were written to throw instead, on the
// reasoning that a skipped integration test is not evidence — which is true
// but made `npm test` fail on any machine without the backend installed.
// The pure-logic describes in this file are deliberately left outside the
// skip so the file always asserts something.

async function bootEngine(): Promise<HybridAgentEngine> {
  root = await mkdtemp(join(tmpdir(), "haf-duckdb-engine-"));
  const engine = new HybridAgentEngine({
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
});

describe.skipIf(!HAS_DUCKDB)("a booted engine exposes the DuckDB capability to the planner", () => {
  it("is in the capability list, so a plan can select it", async () => {
    const engine = await bootEngine();

    const listed = engine.capabilities.list();
    const found = listed.find((item) => item.id === DUCKDB_CAPABILITY_ID);

    expect(found, "the capability was not registered with the broker").toBeDefined();
    expect(found?.source).toBe("core");
    expect(found?.sideEffect).toBe(false);
  }, 120_000);

  it("declares the manifest alongside the capability", async () => {
    const engine = await bootEngine();

    const manifest = engine.capabilities.manifestFor(DUCKDB_CAPABILITY_ID);

    expect(manifest).toBeDefined();
    expect(manifest?.provenance.license).toBe("MIT");
    expect(manifest?.verifierIds.length).toBeGreaterThan(0);
  }, 120_000);
});

describe.skipIf(!HAS_DUCKDB)("executing it through the broker runs real DuckDB", () => {
  it("returns real rows to a caller that went through the broker", async () => {
    const engine = await bootEngine();

    const output = (await engine.capabilities.execute(
      DUCKDB_CAPABILITY_ID,
      { sql: "SELECT i AS n, i * 2 AS doubled FROM range(1, 4) t(i) ORDER BY n" },
      {
        tenantId: "tenant-test",
        sessionId: "00000000-0000-0000-0000-000000000001",
        familyId: "00000000-0000-0000-0000-000000000002",
        turnId: "00000000-0000-0000-0000-000000000003",
        toolCallId: "00000000-0000-0000-0000-000000000004",
        source: "user",
        workspacePath: root ?? tmpdir(),
      } as never,
    )) as Record<string, unknown>;

    expect(output.installed).toBe(true);
    expect(output.columns).toEqual(["n", "doubled"]);
    expect(output.rows).toEqual([
      [1, 2],
      [2, 4],
      [3, 6],
    ]);
    expect(output.rowCount).toBe(3);
  }, 120_000);

  it("reads a real workspace file through the broker", async () => {
    const engine = await bootEngine();
    const csv = join(root ?? tmpdir(), "sales.csv");
    await writeFile(csv, "region,amount\neast,120\nwest,340\nnorth,80\n", "utf8");

    const output = (await engine.capabilities.execute(
      DUCKDB_CAPABILITY_ID,
      { sql: `SELECT region, amount FROM read_csv_auto('${csv}') ORDER BY amount DESC LIMIT 1` },
      {
        tenantId: "tenant-test",
        sessionId: "00000000-0000-0000-0000-000000000001",
        familyId: "00000000-0000-0000-0000-000000000002",
        turnId: "00000000-0000-0000-0000-000000000003",
        toolCallId: "00000000-0000-0000-0000-000000000004",
        source: "user",
        workspacePath: root ?? tmpdir(),
      } as never,
    )) as Record<string, unknown>;

    expect(output.rows).toEqual([["west", 340]]);
  }, 120_000);

  it("stops a destructive statement at the policy layer, before the tool runs", async () => {
    const engine = await bootEngine();

    // Measured, and better than the adapter alone would give: the engine's own
    // risk analysis classifies the call as critical and blocks it, so the
    // subprocess is never even spawned. The worker's own single-statement rule
    // is the second layer, asserted in duckdb-capability.test.ts.
    await expect(
      engine.capabilities.execute(
        DUCKDB_CAPABILITY_ID,
        { sql: "SELECT 1; DROP TABLE x" },
        {
          tenantId: "tenant-test",
          sessionId: "00000000-0000-0000-0000-000000000001",
          familyId: "00000000-0000-0000-0000-000000000002",
          turnId: "00000000-0000-0000-0000-000000000003",
          toolCallId: "00000000-0000-0000-0000-000000000004",
          source: "user",
          workspacePath: root ?? tmpdir(),
        } as never,
      ),
    ).rejects.toThrow(/blocked by policy|SQL-DROP/i);
  }, 120_000);
});
