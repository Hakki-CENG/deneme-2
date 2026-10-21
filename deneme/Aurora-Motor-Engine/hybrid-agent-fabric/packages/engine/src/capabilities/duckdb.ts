/**
 * The DuckDB capability, registered so the planner can actually route to it.
 *
 * The adapter alone was not enough. `runDuckDbQuery()` existed and worked, but
 * nothing registered it, so no plan could ever select it — which is precisely
 * the defect this repo keeps finding: a capability that exists and is not
 * wired is not a capability.
 *
 * Registered unconditionally, on purpose. The other capabilities in this file's
 * neighbourhood register only when their backing service is configured, and
 * that is right for them because their configuration is known at construction.
 * DuckDB's availability is a property of the target interpreter, which is not
 * known without running it, and spawning a subprocess on every engine boot to
 * find out would be a real cost for a maybe.
 *
 * So the capability is always visible, and calling it without DuckDB installed
 * returns `unavailable` — which is exactly what `execution/execution-status.ts`
 * defines that status for: "could not run: no backend, no credentials,
 * dependency missing." That is more honest than the alternative, where the
 * planner cannot see the capability at all and reports the gap as a missing
 * capability rather than a missing dependency.
 *
 * The verifier is wired through the capability contract, not left as a function
 * nobody calls. That is what lets a run claim `succeeded` rather than
 * `unverified`, per the manifest.
 */

import { z } from "zod";

import { defineCapability } from "./schema.js";
import {
  DUCKDB_MANIFEST,
  runDuckDbQuery,
  verifyDuckDbResultShape,
} from "./external/duckdb-capability.js";

/** The id the manifest declares, kept in one place so the two cannot drift. */
export const DUCKDB_CAPABILITY_ID = DUCKDB_MANIFEST.id;

export function duckDbCapabilities() {
  return [
    defineCapability(
      {
        id: DUCKDB_CAPABILITY_ID,
        version: DUCKDB_MANIFEST.version,
        description:
          "Run one read-only SQL statement against a DuckDB database or a workspace file and return the rows. " +
          "A second statement is refused. Returns status 'unavailable' if DuckDB is not installed in the interpreter.",
        risk: "workspace_read",
        sideEffect: false,
        source: "core",
        idempotency: "inherent",
      },
      z.object({
        sql: z.string().min(1).max(20_000),
        database: z.string().min(1).max(4096).optional(),
        limit: z.number().int().min(1).max(100_000).optional(),
      }),
      async ({ sql, database, limit }) => {
        const outcome = await runDuckDbQuery({
          sql,
          ...(database ? { database } : {}),
          ...(limit ? { limit } : {}),
        });

        // A missing backend is an absence of work, not a failure of the tool.
        if (outcome.run.status === "unavailable") {
          return {
            status: "unavailable",
            reason: outcome.run.reason ?? "DuckDB could not be started",
            installed: false,
          };
        }

        if (!outcome.verification.ok) {
          return {
            status: outcome.run.status,
            reason: outcome.verification.reason,
            installed: true,
            stderr: outcome.run.stderr.slice(0, 2000),
          };
        }

        return {
          status: outcome.run.status,
          installed: true,
          columns: outcome.result?.columns ?? [],
          rows: outcome.result?.rows ?? [],
          rowCount: outcome.result?.rowCount ?? 0,
          truncated: outcome.result?.truncated ?? false,
          durationMs: outcome.run.durationMs,
        };
      },
      {
        idempotency: "inherent",
        output: z.object({
          status: z.string(),
          installed: z.boolean(),
          columns: z.array(z.string()).optional(),
          rows: z.array(z.array(z.unknown())).optional(),
          rowCount: z.number().optional(),
          truncated: z.boolean().optional(),
          reason: z.string().optional(),
          stderr: z.string().optional(),
          durationMs: z.number().optional(),
        }),
        // The verifier named in the manifest, wired here so it actually runs.
        // It re-checks the shape from the returned rows rather than trusting the
        // adapter's own report, because a verifier that accepts the thing it is
        // supposed to check has not checked anything.
        verify: async (output) => {
          const value = output as Record<string, unknown>;
          if (value.status === "unavailable") {
            // Not a failure and not a pass: nothing ran, so there is nothing to
            // establish. Reporting `ok: true` here would be the exact mistake
            // this repo keeps removing.
            return {
              ok: false,
              reason: "DuckDB is not installed, so nothing ran and nothing can be verified",
            };
          }
          const columns = Array.isArray(value.columns) ? value.columns : [];
          const rows = Array.isArray(value.rows) ? value.rows : [];
          const rowCount = typeof value.rowCount === "number" ? value.rowCount : -1;
          const rechecked = verifyDuckDbResultShape(
            JSON.stringify({ columns, rows, rowCount, truncated: value.truncated ?? false }),
          );
          return { ok: rechecked.ok, reason: rechecked.reason };
        },
      },
    ),
  ];
}
