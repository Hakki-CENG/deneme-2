/**
 * DuckDB — the first capability adapted in from outside the repo.
 *
 * Why this one first, from the survey rather than from preference:
 *
 *   - MIT licence, measured. No copyleft obligation reaches Aurora.
 *   - Last commit on the day of the survey; the project is actively maintained.
 *   - It fills a socket Aurora actually has. The engine's data-analysis story
 *     is thin, and a capability that can answer a SQL question over a
 *     workspace file is one the planner can route real work to.
 *   - It runs here. That matters more than it sounds: this integration is
 *     exercised end to end against a real DuckDB 1.5.6 interpreter, not
 *     against a stub that pretends to be one.
 *
 * What this file is honest about:
 *
 *   - `verifierIds` is populated, so a run may claim `succeeded`. The verifier
 *     is narrow and real: the result must be well-formed JSON carrying the
 *     columns and rows the worker promised. It does not judge whether the SQL
 *     answered the user's question — nothing here could.
 *   - The pinned commit is the version measured during the survey. It is not
 *     updated automatically; Gate F requires the benchmark to be re-run before
 *     a version moves.
 *   - `installed` is not asserted. Whether DuckDB is importable in the target
 *     interpreter is checked at run time, and its absence is reported as
 *     `unavailable` rather than as a failure of the tool.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { CapabilityManifest } from "../manifest.js";
import {
  runSubprocessCapability,
  type SubprocessRunResult,
} from "./subprocess-adapter.js";

/** The Python worker shipped alongside the package. */
const HERE = dirname(fileURLToPath(import.meta.url));
export const DUCKDB_WORKER_PATH = resolve(HERE, "../../../external-workers/duckdb_query.py");

/** Version measured during the 2026-10-19 survey. Pinned, not `latest`. */
export const DUCKDB_PINNED_VERSION = "1.5.6";

export const DUCKDB_MANIFEST: CapabilityManifest = {
  id: "data.duckdb.query",
  version: "1.0.0",
  domain: ["data-analysis", "sql", "analytics"],
  description:
    "Run a single read-only SQL statement against a DuckDB database or a workspace file and return the result rows as JSON.",
  executionMode: "subprocess",
  requiredPermissions: ["fs.read.workspace", "process.spawn"],
  networkPolicy: "none",
  filesystemPolicy: "read-allowlist",
  resourceLimits: { timeoutMs: 30_000, memoryMb: 512 },
  healthCheck: "python3 -c 'import duckdb'",
  verifierIds: ["data.duckdb.query.result-shape"],
  benchmarks: [],
  provenance: {
    repository: "https://github.com/duckdb/duckdb",
    commit: DUCKDB_PINNED_VERSION,
    license: "MIT",
  },
  limitations: [
    "one statement per call; a second statement is refused",
    "read-only unless the caller explicitly asks for a write",
    "row count is capped and truncation is reported as a flag",
    "no judgement about whether the SQL answered the intended question",
  ],
  fallbackCapabilityIds: [],
};

export interface DuckDbQueryRequest {
  readonly sql: string;
  /** Absolute path to a database file, or ":memory:". */
  readonly database?: string | undefined;
  readonly limit?: number | undefined;
}

export interface DuckDbQueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
  readonly rowCount: number;
  readonly truncated: boolean;
}

/**
 * The verifier named in the manifest.
 *
 * Deliberately narrow: it establishes that the worker returned the shape it
 * promised, which is a real check with a real failure mode. It does not and
 * cannot establish that the query was the right one — claiming otherwise would
 * be exactly the kind of unearned confidence this repo keeps removing.
 */
export function verifyDuckDbResultShape(stdout: string): {
  ok: boolean;
  reason: string;
  parsed?: DuckDbQueryResult;
} {
  const trimmed = stdout.trim();
  if (trimmed === "") return { ok: false, reason: "the worker produced no output at all" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, reason: `the worker's output is not valid JSON: ${String(err)}` };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "the worker's output is not a JSON object" };
  }

  const candidate = parsed as Record<string, unknown>;
  if (!Array.isArray(candidate.columns)) {
    return { ok: false, reason: "the result carries no columns array" };
  }
  if (!Array.isArray(candidate.rows)) {
    return { ok: false, reason: "the result carries no rows array" };
  }
  if (typeof candidate.rowCount !== "number") {
    return { ok: false, reason: "the result carries no numeric rowCount" };
  }
  if (candidate.rowCount !== candidate.rows.length) {
    return {
      ok: false,
      reason: `rowCount says ${String(candidate.rowCount)} but ${String(candidate.rows.length)} rows were returned`,
    };
  }

  return {
    ok: true,
    reason: "the result carries the columns, rows and count the worker promised",
    parsed: candidate as unknown as DuckDbQueryResult,
  };
}

export interface DuckDbRunOutcome {
  readonly run: SubprocessRunResult;
  /** Present only when the shape verifier passed. */
  readonly result?: DuckDbQueryResult | undefined;
  readonly verification: { ok: boolean; reason: string };
}

/**
 * Run a query through the subprocess adapter under the DuckDB manifest.
 *
 * The status returned is the adapter's, which already applies the manifest's
 * verifier rule. On top of that, the shape verifier decides whether the output
 * can be handed to a caller as data.
 */
export async function runDuckDbQuery(
  request: DuckDbQueryRequest,
  python = "python3",
): Promise<DuckDbRunOutcome> {
  const payload = JSON.stringify({
    sql: request.sql,
    database: request.database ?? ":memory:",
    limit: request.limit ?? 1000,
  });

  const run = await runSubprocessCapability(DUCKDB_MANIFEST, {
    command: python,
    args: [DUCKDB_WORKER_PATH],
    stdin: payload,
  });

  if (run.status !== "executed" && run.status !== "succeeded") {
    return {
      run,
      verification: {
        ok: false,
        reason: run.reason ?? `the worker ended as '${run.status}' and produced no result to check`,
      },
    };
  }

  const verification = verifyDuckDbResultShape(run.stdout);
  return {
    run,
    ...(verification.parsed ? { result: verification.parsed } : {}),
    verification: { ok: verification.ok, reason: verification.reason },
  };
}
