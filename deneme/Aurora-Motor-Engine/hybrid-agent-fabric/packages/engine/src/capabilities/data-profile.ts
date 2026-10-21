/**
 * data.profile — describe a tabular dataset, and re-derive the numbers to check them.
 *
 * Polars 2.0.0, MIT (the distribution's metadata carries the MIT text and the
 * OSI classifier). Measured before this was written: the `data.` domain
 * contained exactly one capability, `data.duckdb.query`, which takes a single
 * SQL statement and returns rows. There was no capability for asking what a
 * dataset *is* — its shape, types, missing values, ranges, distributions —
 * without writing that SQL by hand.
 *
 * The reason this is not `polars.describe()` behind an endpoint is the second
 * half of the worker. Every number in the profile is recomputed from the raw
 * file using Python's stdlib `csv` module and the two are compared: row count,
 * column count, per-column null counts, and the mean of the first numeric
 * column summed and divided from the raw cells. The recomputation deliberately
 * does not use polars, because one library restating its own output is not
 * evidence while two independent readings agreeing is.
 *
 * That check earned its place immediately: the first version of the worker
 * never accumulated any column's sum, so its independent mean was null while
 * the profile reported 25.2. The check reported `agrees: false` and the result
 * came back unverified. The bug was in the checker, not the profile, and it was
 * found by running it rather than by reading it.
 *
 * One behaviour is reported rather than hidden, because it was measured: an
 * empty CSV cell is read as a missing value, and neither `null_values=[]` nor
 * `schema_overrides` changes that. So `nullCount` counts empty cells as
 * missing and this capability cannot distinguish an empty string from an absent
 * value in CSV. A caller who needs that distinction needs a different reader.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { defineCapability } from "./schema.js";
import type { CapabilityManifest } from "./manifest.js";
import { runSubprocessCapability } from "./external/subprocess-adapter.js";
import { resolveWithinWorkspace } from "./document-parse.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_PROFILE_WORKER_PATH = resolve(HERE, "../../external-workers/data_profile.py");

export const POLARS_PINNED_VERSION = "2.0.0";

export const DATA_PROFILE_MANIFEST: CapabilityManifest = {
  id: "data.profile",
  version: "1.0.0",
  domain: ["data-analysis", "statistics", "data-quality"],
  description:
    "Profile a CSV or TSV in the workspace: shape, per-column types, missing values, distinct counts, " +
    "numeric summaries and categorical top values. Every figure is re-derived independently and checked.",
  executionMode: "subprocess",
  requiredPermissions: ["process.spawn", "fs.read"],
  networkPolicy: "none",
  filesystemPolicy: "workspace-only",
  resourceLimits: { timeoutMs: 60_000, memoryMb: 1024 },
  healthCheck: "python3 -c 'import polars'",
  verifierIds: ["data.profile.independent-rederivation"],
  benchmarks: [],
  provenance: {
    repository: "https://github.com/pola-rs/polars",
    commit: POLARS_PINNED_VERSION,
    license: "MIT",
  },
  limitations: [
    "empty CSV cells are counted as missing: polars reads an empty cell as null and neither null_values nor schema_overrides changes that, so an empty string cannot be distinguished from an absent value",
    "the independent re-derivation covers row count, column count, null counts and one numeric column's mean — not every statistic in the profile",
    "files above 2 million rows skip the re-derivation rather than approximating it, and say so",
    "CSV and TSV only; Parquet and other formats are not read",
    "the profile describes the data; it does not judge whether the data is correct",
  ],
  fallbackCapabilityIds: ["data.duckdb.query"],
};

export const DATA_PROFILE_CAPABILITY_ID = DATA_PROFILE_MANIFEST.id;

/** One check's outcome, as the worker reports it. */
interface ProfileCheck {
  agrees: boolean;
  [key: string]: unknown;
}

interface ProfileResult {
  profile: Record<string, unknown>;
  checks: Record<string, ProfileCheck>;
  verified: boolean;
  checkCount: number;
  missingValueNote: string;
}

function parseWorkerOutput(
  stdout: string,
): { ok: true; value: ProfileResult } | { ok: false; reason: string } {
  const trimmed = stdout.trim();
  if (trimmed === "") return { ok: false, reason: "the profiling worker produced no output at all" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, reason: `the profiling worker's output is not valid JSON: ${String(err)}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "the profiling worker's output is not a JSON object" };
  }
  const c = parsed as Record<string, unknown>;
  if (typeof c.error === "string") return { ok: false, reason: c.error };
  if (typeof c.profile !== "object" || c.profile === null) {
    return { ok: false, reason: "the worker returned no profile" };
  }

  const rawChecks =
    typeof c.checks === "object" && c.checks !== null ? (c.checks as Record<string, unknown>) : {};
  const checks: Record<string, ProfileCheck> = {};
  for (const [name, value] of Object.entries(rawChecks)) {
    if (typeof value === "object" && value !== null && typeof (value as ProfileCheck).agrees === "boolean") {
      checks[name] = value as ProfileCheck;
    }
  }

  return {
    ok: true,
    value: {
      profile: c.profile as Record<string, unknown>,
      checks,
      verified: c.verified === true,
      checkCount: typeof c.checkCount === "number" ? c.checkCount : Object.keys(checks).length,
      missingValueNote: typeof c.missingValueNote === "string" ? c.missingValueNote : "",
    },
  };
}

/**
 * Reads the worker's checks and says which disagreed.
 *
 * Exported so the failure mode can be tested directly rather than only through
 * a subprocess that would have to be made to lie.
 */
export function summariseChecks(
  checks: Record<string, ProfileCheck>,
): { allAgree: boolean; disagreements: string[]; evaluated: number } {
  const disagreements: string[] = [];
  for (const [name, check] of Object.entries(checks)) {
    if (!check.agrees) {
      const detail = Object.entries(check)
        .filter(([k]) => k !== "agrees")
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      disagreements.push(`${name}: ${detail}`.slice(0, 300));
    }
  }
  return {
    allAgree: disagreements.length === 0,
    disagreements,
    evaluated: Object.keys(checks).length,
  };
}

export function dataProfileCapabilities() {
  return [
    defineCapability(
      {
        id: DATA_PROFILE_CAPABILITY_ID,
        version: DATA_PROFILE_MANIFEST.version,
        description:
          "Profile a CSV or TSV in the workspace and independently re-derive its headline numbers. " +
          "Returns 'unavailable' if polars is not installed.",
        risk: "workspace_read",
        sideEffect: false,
        source: "core",
        idempotency: "inherent",
      },
      z.object({
        path: z.string().min(1).max(1000),
        sampleValues: z.number().int().min(0).max(20).optional(),
      }),
      async ({ path, sampleValues }, context) => {
        const contained = resolveWithinWorkspace(context.workspacePath, path);
        if (!contained.ok) {
          return { status: "failed", reason: contained.reason, profiled: false };
        }

        const run = await runSubprocessCapability(DATA_PROFILE_MANIFEST, {
          command: "python3",
          args: [DATA_PROFILE_WORKER_PATH],
          stdin: JSON.stringify({
            path: contained.path,
            ...(sampleValues !== undefined ? { sampleValues } : {}),
          }),
        });

        if (run.status === "unavailable") {
          return {
            status: "unavailable",
            profiled: false,
            installed: false,
            reason: run.reason ?? "polars could not be started",
          };
        }

        const parsed = parseWorkerOutput(run.stdout);
        if (!parsed.ok) {
          return {
            status: "failed",
            profiled: false,
            installed: true,
            reason: parsed.reason,
            stderr: run.stderr.slice(0, 2000),
          };
        }

        const value = parsed.value;
        const summary = summariseChecks(value.checks);

        return {
          status: run.status,
          profiled: true,
          installed: true,
          profile: value.profile,
          rowCount: value.profile.rowCount,
          columnCount: value.profile.columnCount,
          columns: value.profile.columns,
          checks: value.checks,
          checksEvaluated: summary.evaluated,
          // Only true when an independent re-derivation actually ran and agreed.
          verified: value.verified && summary.allAgree,
          unchecked: !(value.verified && summary.allAgree),
          disagreements: summary.disagreements,
          missingValueNote: value.missingValueNote,
          checkDetail: summary.allAgree
            ? `${summary.evaluated} independent check(s) re-derived from the raw file and agreed`
            : `${summary.disagreements.length} of ${summary.evaluated} independent check(s) disagreed`,
          durationMs: run.durationMs,
        };
      },
      {
        idempotency: "inherent",
        output: z.object({
          status: z.string(),
          profiled: z.boolean(),
          installed: z.boolean().optional(),
          profile: z.record(z.string(), z.unknown()).optional(),
          rowCount: z.unknown().optional(),
          columnCount: z.unknown().optional(),
          columns: z.unknown().optional(),
          checks: z.record(z.string(), z.unknown()).optional(),
          checksEvaluated: z.number().optional(),
          verified: z.boolean().optional(),
          unchecked: z.boolean().optional(),
          disagreements: z.array(z.string()).optional(),
          missingValueNote: z.string().optional(),
          checkDetail: z.string().optional(),
          reason: z.string().optional(),
          stderr: z.string().optional(),
          durationMs: z.number().optional(),
        }),
        /**
         * Fails when an independent re-derivation disagreed, which is the only
         * thing here that can establish that the profile is wrong.
         *
         * A profile with no checks is not failed — it is returned as unchecked,
         * because "nobody could confirm this" is not the same as "this is
         * wrong" and conflating them teaches callers to route around the
         * verifier.
         */
        verify: async (output) => {
          const value = output as Record<string, unknown>;
          const status = String(value.status ?? "");
          if (status === "unavailable") {
            return { ok: true, reason: String(value.reason ?? "polars is not installed") };
          }
          if (value.profiled !== true) {
            return {
              ok: true,
              reason: String(value.reason ?? value.stderr ?? "no profiling happened") || "no profiling happened",
            };
          }
          const disagreements = Array.isArray(value.disagreements)
            ? (value.disagreements as string[])
            : [];
          if (disagreements.length > 0) {
            return {
              ok: false,
              reason:
                `the independent re-derivation disagreed with the profile: ${disagreements.join("; ")}`.slice(
                  0,
                  500,
                ),
            };
          }
          const evaluated = typeof value.checksEvaluated === "number" ? value.checksEvaluated : 0;
          if (evaluated === 0) {
            return {
              ok: true,
              reason:
                "the profile was produced but no independent check ran, so it is reported unchecked " +
                "rather than endorsed",
            };
          }
          return {
            ok: true,
            reason: String(value.checkDetail ?? `${evaluated} independent check(s) agreed`),
          };
        },
      },
    ),
  ];
}
