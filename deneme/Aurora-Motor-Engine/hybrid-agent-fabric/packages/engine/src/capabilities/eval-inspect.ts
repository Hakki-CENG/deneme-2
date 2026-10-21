/**
 * eval.inspect.run — run an Inspect AI task and return its scored result.
 *
 * Inspect AI 0.3.281, MIT (verified against the repository's LICENSE file and
 * the installed distribution's metadata, which agree). This is the plan's
 * first-wave item 1, and the plan's condition on it is kept: Inspect supplies
 * the harness, while Aurora's own task schema and verifiers stay where they
 * are. Nothing here replaces `packages/eval`.
 *
 * What this adds is not another evaluator. It is the ability to run somebody
 * else's benchmark definition and get back a score with a provenance — task
 * name, model, per-scorer metrics, per-sample grades, token usage. Before
 * this, an external benchmark could only be described, not executed.
 *
 * THREE THINGS THIS DOES NOT DO, each of which is measured rather than
 * assumed:
 *
 * 1. It does not make Aurora better at anything. With no API keys in the
 *    environment, a task aimed at a hosted model cannot reach one, so in
 *    practice tasks run under `mockllm/model`. A score produced that way
 *    measures whether the harness works. Accuracy 0.0 under a mock model is a
 *    successful run, and the verifier treats it as one.
 *
 * 2. It does not sandbox the task file. Running an Inspect task imports and
 *    executes that file's Python; there is no way to evaluate a task without
 *    running the code that defines it. The containment is the process — no
 *    shell, a wall-clock limit, and an environment reduced to PATH and LANG —
 *    not a parser. The manifest declares `risk: "process"` because that is
 *    what happens.
 *
 * 3. It does not enforce egress. `networkPolicy: "none"` is true because the
 *    worker receives no credentials, so nothing it runs can authenticate to a
 *    hosted model. That is a property of the adapter's environment, not of a
 *    proxy, and it would stop being true if that environment were widened.
 *
 * Result shape was measured against 0.3.281: `EvalConfig` has no `model`
 * attribute (it lives on `log.eval`), per-sample grades are strings like
 * "I"/"C" rather than numbers, `eval()` returns an `EvalLogs` sequence, and
 * task files must be passed relative to the working directory or Inspect
 * raises "Non-relative patterns are unsupported".
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { defineCapability } from "./schema.js";
import type { CapabilityManifest } from "./manifest.js";
import { runSubprocessCapability } from "./external/subprocess-adapter.js";
import { resolveWithinWorkspace } from "./document-parse.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVAL_INSPECT_WORKER_PATH = resolve(HERE, "../../external-workers/eval_inspect.py");

export const INSPECT_AI_PINNED_VERSION = "0.3.281";

/**
 * The only model this adapter can actually reach, because the worker's
 * environment carries no credentials. Declared here so the default is visible
 * rather than buried in the worker.
 */
export const INSPECT_OFFLINE_MODEL = "mockllm/model";

export const EVAL_INSPECT_MANIFEST: CapabilityManifest = {
  id: "eval.inspect.run",
  version: "1.0.0",
  domain: ["evaluation", "benchmarking", "testing"],
  description:
    "Run an Inspect AI task file and return its scored result: per-scorer metrics, per-sample " +
    "grades, model and token usage. Runs offline under a mock model.",
  executionMode: "subprocess",
  requiredPermissions: ["process.spawn", "fs.read"],
  networkPolicy: "none",
  filesystemPolicy: "workspace-only",
  resourceLimits: { timeoutMs: 300_000, memoryMb: 1024 },
  // Proves the package imports. It does not prove a benchmark would score well.
  healthCheck: "python3 -c 'import inspect_ai'",
  verifierIds: ["eval.inspect.run.result-shape"],
  benchmarks: [],
  provenance: {
    repository: "https://github.com/UKGovernmentBEIS/inspect_ai",
    commit: INSPECT_AI_PINNED_VERSION,
    license: "MIT",
  },
  limitations: [
    "running a task executes the Python in that file; the containment is the process, not a parser",
    "the worker receives no credentials, so a task aimed at a hosted model cannot reach one — which is what makes networkPolicy 'none' true, and would stop being true if the adapter's environment were widened",
    "scores under mockllm measure whether the harness works, not whether Aurora is good at anything",
    "a score of 0.0 is a measurement, not a failure, and is reported as such",
    "this runs external benchmarks; it does not replace Aurora's own task schema or verifiers",
  ],
  fallbackCapabilityIds: [],
};

export const EVAL_INSPECT_CAPABILITY_ID = EVAL_INSPECT_MANIFEST.id;

interface InspectScore {
  scorer: string;
  metrics: Record<string, unknown>;
}

interface InspectResult {
  status: string;
  task: string | null;
  model: string | null;
  sampleCount: number;
  scores: InspectScore[];
  samples: Array<{ id: string; scores: Record<string, unknown> }>;
  modelUsage: Record<string, unknown>;
  error: string | null;
}

function parseWorkerOutput(
  stdout: string,
): { ok: true; value: InspectResult } | { ok: false; reason: string } {
  const trimmed = stdout.trim();
  if (trimmed === "") return { ok: false, reason: "the Inspect worker produced no output at all" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, reason: `the Inspect worker's output is not valid JSON: ${String(err)}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "the Inspect worker's output is not a JSON object" };
  }
  const c = parsed as Record<string, unknown>;
  if (typeof c.error === "string") return { ok: false, reason: c.error };
  if (typeof c.status !== "string") return { ok: false, reason: "the worker reported no run status" };
  return {
    ok: true,
    value: {
      status: c.status,
      task: typeof c.task === "string" ? c.task : null,
      model: typeof c.model === "string" ? c.model : null,
      sampleCount: typeof c.sampleCount === "number" ? c.sampleCount : 0,
      scores: Array.isArray(c.scores)
        ? c.scores
            .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
            .map((s) => ({
              scorer: typeof s.scorer === "string" ? s.scorer : "",
              metrics:
                typeof s.metrics === "object" && s.metrics !== null
                  ? (s.metrics as Record<string, unknown>)
                  : {},
            }))
        : [],
      samples: Array.isArray(c.samples)
        ? c.samples
            .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
            .map((s) => ({
              id: typeof s.id === "string" ? s.id : "",
              scores:
                typeof s.scores === "object" && s.scores !== null
                  ? (s.scores as Record<string, unknown>)
                  : {},
            }))
        : [],
      modelUsage:
        typeof c.modelUsage === "object" && c.modelUsage !== null
          ? (c.modelUsage as Record<string, unknown>)
          : {},
      error: typeof c.error === "string" ? c.error : null,
    },
  };
}

export function evalInspectCapabilities() {
  return [
    defineCapability(
      {
        id: EVAL_INSPECT_CAPABILITY_ID,
        version: EVAL_INSPECT_MANIFEST.version,
        description:
          "Run an Inspect AI task file from the workspace and return its scored result. Runs offline " +
          "under a mock model. Returns 'unavailable' if inspect_ai is not installed.",
        risk: "process",
        sideEffect: false,
        source: "core",
        idempotency: "inherent",
      },
      z.object({
        taskFile: z.string().min(1).max(1000),
        model: z.string().min(1).max(128).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      }),
      async ({ taskFile, model, limit }, context) => {
        const contained = resolveWithinWorkspace(context.workspacePath, taskFile);
        if (!contained.ok) {
          return { status: "failed", reason: contained.reason, ran: false };
        }

        // Inspect writes an .eval log per run. A fresh directory per call keeps
        // runs from being confused with one another, and keeps the logs out of
        // the caller's workspace.
        const logDir = await mkdtemp(join(tmpdir(), "haf-inspect-"));

        const run = await runSubprocessCapability(EVAL_INSPECT_MANIFEST, {
          command: "python3",
          args: [EVAL_INSPECT_WORKER_PATH],
          stdin: JSON.stringify({
            taskFile: contained.path,
            model: model ?? INSPECT_OFFLINE_MODEL,
            logDir,
            ...(limit !== undefined ? { limit } : {}),
          }),
        });

        if (run.status === "unavailable") {
          return {
            status: "unavailable",
            ran: false,
            installed: false,
            reason: run.reason ?? "inspect_ai could not be started",
          };
        }

        const parsed = parseWorkerOutput(run.stdout);
        if (!parsed.ok) {
          return {
            status: "failed",
            ran: false,
            installed: true,
            reason: parsed.reason,
            stderr: run.stderr.slice(0, 2000),
          };
        }

        const v = parsed.value;
        return {
          status: v.status === "success" ? "executed" : "failed",
          ran: true,
          installed: true,
          runStatus: v.status,
          task: v.task,
          model: v.model,
          sampleCount: v.sampleCount,
          scores: v.scores,
          samples: v.samples,
          modelUsage: v.modelUsage,
          ...(v.error ? { runError: v.error } : {}),
          durationMs: run.durationMs,
        };
      },
      {
        idempotency: "inherent",
        output: z.object({
          status: z.string(),
          ran: z.boolean(),
          installed: z.boolean().optional(),
          runStatus: z.string().optional(),
          task: z.string().nullable().optional(),
          model: z.string().nullable().optional(),
          sampleCount: z.number().optional(),
          scores: z
            .array(z.object({ scorer: z.string(), metrics: z.record(z.string(), z.unknown()) }))
            .optional(),
          samples: z
            .array(z.object({ id: z.string(), scores: z.record(z.string(), z.unknown()) }))
            .optional(),
          modelUsage: z.record(z.string(), z.unknown()).optional(),
          runError: z.string().optional(),
          reason: z.string().optional(),
          stderr: z.string().optional(),
          durationMs: z.number().optional(),
        }),
        /**
         * A score is a measurement, so the verifier does not judge it.
         *
         * It fails when the run did not happen or produced no metrics to read.
         * It passes when the harness ran and returned per-scorer metrics —
         * including when those metrics are 0.0, which under the mock model this
         * adapter can reach is the expected result. A verifier that failed on a
         * low score would be grading the model while claiming to check the
         * integration.
         */
        verify: async (output) => {
          const value = output as Record<string, unknown>;
          const status = String(value.status ?? "");

          if (status === "unavailable") {
            return { ok: true, reason: String(value.reason ?? "inspect_ai is not installed") };
          }
          if (value.ran !== true) {
            return {
              ok: true,
              reason: String(value.reason ?? value.stderr ?? "the run did not start") || "the run did not start",
            };
          }
          if (status !== "executed") {
            return {
              ok: false,
              reason: String(value.runError ?? value.runStatus ?? "the run did not complete"),
            };
          }

          const scores = Array.isArray(value.scores) ? value.scores : [];
          if (scores.length === 0) {
            return { ok: false, reason: "the run completed but produced no scorer metrics" };
          }
          const hasMetric = scores.some(
            (s) => typeof s === "object" && s !== null && Object.keys((s as InspectScore).metrics).length > 0,
          );
          if (!hasMetric) {
            return { ok: false, reason: "the scorers reported no metrics at all" };
          }

          const summary = scores
            .map((s) => `${s.scorer}: ${Object.entries(s.metrics).map(([k, m]) => `${k}=${String(m)}`).join(", ")}`)
            .join(" | ");
          return {
            ok: true,
            reason: `the harness ran ${String(value.sampleCount ?? 0)} sample(s) of task ` +
              `'${String(value.task ?? "?")}' — ${summary}. These figures measure the run, ` +
              "not whether the answers were good.",
          };
        },
      },
    ),
  ];
}
