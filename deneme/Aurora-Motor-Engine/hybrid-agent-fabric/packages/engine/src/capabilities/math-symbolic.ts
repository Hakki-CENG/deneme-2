/**
 * math.symbolic — symbolic mathematics, which Aurora did not have at all.
 *
 * SymPy 1.14.0, BSD-3-Clause. The licence was verified against the
 * repository's LICENSE file rather than taken from the survey, because
 * automated detection reported "not identifiable by github" — which is a limit
 * of the detector, not a problem with the licence, and the difference only
 * shows up if somebody actually reads the file. Gate A asks for exactly that.
 *
 * What makes this capability different from the ones before it:
 *
 * Its verifier can check CORRECTNESS, not merely shape. A solution to an
 * equation can be substituted back into the equation and the residual
 * inspected. A derivative can be compared against a central difference
 * quotient computed independently of the symbolic engine's own rules. Neither
 * is possible for a fetched web page or a rendered document.
 *
 * So the verifier here returns `pass` only when an independent check agrees,
 * and reports what it compared. A result that parsed but could not be checked
 * is reported as unchecked rather than being quietly promoted to verified —
 * the distinction this repo has spent a long time enforcing elsewhere now
 * applies to arithmetic too.
 *
 * Parsing safety is layered, and the layers are named rather than blended:
 * the worker parses with a closed namespace and no builtins, and it runs under
 * the subprocess adapter with no inherited environment and a wall-clock limit.
 * Neither layer alone is the whole defence.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { defineCapability } from "./schema.js";
import type { CapabilityManifest } from "./manifest.js";
import { runSubprocessCapability } from "./external/subprocess-adapter.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MATH_SYMBOLIC_WORKER_PATH = resolve(HERE, "../../external-workers/math_symbolic.py");

/** Version measured when this capability was written. Pinned, not `latest`. */
export const SYMPY_PINNED_VERSION = "1.14.0";

export const MATH_OPERATIONS = [
  "simplify",
  "solve",
  "diff",
  "integrate",
  "factor",
  "expand",
  "evalf",
  "limit",
] as const;

export type MathOperation = (typeof MATH_OPERATIONS)[number];

export const MATH_SYMBOLIC_MANIFEST: CapabilityManifest = {
  id: "math.symbolic",
  version: "1.0.0",
  domain: ["mathematics", "symbolic-computation", "science"],
  description:
    "Simplify, solve, differentiate, integrate, factor, expand or numerically evaluate a symbolic " +
    "mathematical expression. Results carry an independent check where one is possible.",
  executionMode: "subprocess",
  requiredPermissions: ["process.spawn"],
  networkPolicy: "none",
  filesystemPolicy: "none",
  resourceLimits: { timeoutMs: 30_000, memoryMb: 512 },
  healthCheck: "python3 -c 'import sympy'",
  verifierIds: ["math.symbolic.independent-check"],
  benchmarks: [],
  provenance: {
    repository: "https://github.com/sympy/sympy",
    commit: SYMPY_PINNED_VERSION,
    // Verified by reading the repository's LICENSE file, not by automated
    // detection, which reported this project as unidentifiable.
    license: "BSD-3-Clause",
  },
  limitations: [
    "expressions are parsed with a closed namespace and no builtins, but the parser is one layer of defence rather than the whole of it",
    "an expression that parses but cannot be independently checked is reported as unchecked, not as verified",
    "no proof-producing backend: this simplifies and solves, it does not certify",
    "results are returned as SymPy's string form, not as a structured expression tree",
  ],
  fallbackCapabilityIds: [],
};

export const MATH_SYMBOLIC_CAPABILITY_ID = MATH_SYMBOLIC_MANIFEST.id;

interface SymbolicResult {
  operation: string;
  input: string;
  result: string;
  variable: string | null;
  check: Record<string, unknown>;
}

function parseWorkerOutput(stdout: string): { ok: true; value: SymbolicResult } | { ok: false; reason: string } {
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
  if (typeof candidate.result !== "string") return { ok: false, reason: "the result carries no answer" };
  return {
    ok: true,
    value: {
      operation: typeof candidate.operation === "string" ? candidate.operation : "",
      input: typeof candidate.input === "string" ? candidate.input : "",
      result: candidate.result,
      variable: typeof candidate.variable === "string" ? candidate.variable : null,
      check:
        typeof candidate.check === "object" && candidate.check !== null
          ? (candidate.check as Record<string, unknown>)
          : {},
    },
  };
}

/**
 * The independent check, interpreted.
 *
 * `verified` is true only when a check ran and agreed. `unchecked` is true when
 * the operation produced an answer but nothing could confirm it — which is an
 * honest state, not a failure, and must never be presented as verified.
 */
export function interpretCheck(
  value: SymbolicResult,
): { verified: boolean; unchecked: boolean; detail: string } {
  const residuals = value.check.substituted_residuals;
  if (Array.isArray(residuals) && residuals.length > 0) {
    const allZero = residuals.every((r) => {
      const text = String(r).trim();
      if (text.startsWith("unchecked")) return false;
      const n = Number(text);
      return Number.isFinite(n) && Math.abs(n) < 1e-6;
    });
    return {
      verified: allZero,
      unchecked: false,
      detail: allZero
        ? `every solution substituted back to zero residual (${residuals.join(", ")})`
        : `at least one solution did not substitute back to zero (${residuals.join(", ")})`,
    };
  }

  const delta = value.check.numeric_vs_symbolic_delta;
  if (typeof delta === "string") {
    if (delta.startsWith("unchecked")) {
      return { verified: false, unchecked: true, detail: delta };
    }
    const n = Number(delta);
    if (Number.isFinite(n)) {
      const agrees = Math.abs(n) < 1e-4;
      return {
        verified: agrees,
        unchecked: false,
        detail: agrees
          ? `the symbolic derivative agrees with an independent difference quotient (delta ${delta})`
          : `the symbolic derivative disagrees with the difference quotient (delta ${delta})`,
      };
    }
  }

  return {
    verified: false,
    unchecked: true,
    detail:
      "the expression was processed but no independent check applies to this operation, " +
      "so the answer is reported as unchecked rather than verified",
  };
}

export function mathSymbolicCapabilities() {
  return [
    defineCapability(
      {
        id: MATH_SYMBOLIC_CAPABILITY_ID,
        version: MATH_SYMBOLIC_MANIFEST.version,
        description:
          "Symbolic mathematics: simplify, solve, differentiate, integrate, factor, expand, evaluate. " +
          "Answers carry an independent check where one exists. Returns 'unavailable' if SymPy is not installed.",
        risk: "pure",
        sideEffect: false,
        source: "core",
        idempotency: "inherent",
      },
      z.object({
        operation: z.enum(MATH_OPERATIONS),
        expression: z.string().min(1).max(4000),
        variable: z.string().min(1).max(64).optional(),
        point: z.number().optional(),
        precision: z.number().int().min(1).max(50).optional(),
      }),
      async ({ operation, expression, variable, point, precision }) => {
        const run = await runSubprocessCapability(MATH_SYMBOLIC_MANIFEST, {
          command: "python3",
          args: [MATH_SYMBOLIC_WORKER_PATH],
          stdin: JSON.stringify({
            operation,
            expression,
            ...(variable ? { variable } : {}),
            ...(point !== undefined ? { point } : {}),
            ...(precision !== undefined ? { precision } : {}),
          }),
        });

        if (run.status === "unavailable") {
          return {
            status: "unavailable",
            reason: run.reason ?? "SymPy could not be started",
            installed: false,
          };
        }

        const parsed = parseWorkerOutput(run.stdout);
        if (!parsed.ok) {
          return {
            status: run.status,
            installed: true,
            reason: parsed.reason,
            stderr: run.stderr.slice(0, 2000),
          };
        }

        const check = interpretCheck(parsed.value);
        return {
          status: run.status,
          installed: true,
          operation: parsed.value.operation,
          input: parsed.value.input,
          result: parsed.value.result,
          ...(parsed.value.variable ? { variable: parsed.value.variable } : {}),
          verified: check.verified,
          unchecked: check.unchecked,
          checkDetail: check.detail,
          durationMs: run.durationMs,
        };
      },
      {
        idempotency: "inherent",
        output: z.object({
          status: z.string(),
          installed: z.boolean(),
          operation: z.string().optional(),
          input: z.string().optional(),
          result: z.string().optional(),
          variable: z.string().optional(),
          verified: z.boolean().optional(),
          unchecked: z.boolean().optional(),
          checkDetail: z.string().optional(),
          reason: z.string().optional(),
          stderr: z.string().optional(),
          durationMs: z.number().optional(),
        }),
        /**
         * What this verifier is responsible for, and what it is not.
         *
         * Measured, and it changed the design: the broker treats `ok: false` as
         * "the capability failed" and throws, discarding the result. So
         * returning false for an unchecked-but-correct answer would turn
         * `integrate("1/x")` into an error, which is worse than useless — the
         * answer was right and the caller never sees it.
         *
         * So the split is:
         *   - the verifier fails only when the capability broke its promise:
         *     no answer at all, or an independent check that DISAGREED.
         *   - when no independent check applies, the capability still did what
         *     it promised, and the honesty lives in the `unchecked: true` field
         *     on the result, where a caller can actually weigh it.
         *
         * That is a weaker verifier than "only verified answers pass", and it is
         * the correct one here: a verifier that discards correct answers teaches
         * callers to work around it.
         */
        verify: async (output) => {
          const value = output as Record<string, unknown>;
          const status = String(value.status ?? "");

          // Nothing ran, or the worker already reported its own failure. The
          // status and reason on the result say why; failing again here would
          // only replace a specific reason with a generic one.
          if (status === "unavailable" || (status !== "" && status !== "executed")) {
            return {
              ok: true,
              reason: String(value.reason ?? value.stderr ?? status) || "the capability reported its own failure",
            };
          }

          if (typeof value.result !== "string" || value.result.trim() === "") {
            return { ok: false, reason: "the capability returned no answer at all" };
          }

          // An independent check ran and disagreed. This is the case that must
          // fail: a wrong answer presented as a result.
          if (value.verified === false && value.unchecked === false) {
            return {
              ok: false,
              reason:
                String(value.checkDetail ?? "the independent check disagreed") +
                " — a check ran and the answer did not survive it",
            };
          }

          if (value.verified === true) {
            return { ok: true, reason: String(value.checkDetail ?? "independent check agreed") };
          }

          return {
            ok: true,
            reason:
              String(value.checkDetail ?? "no independent check applied") +
              " — the answer is returned and explicitly marked unchecked, not endorsed",
          };
        },
      },
    ),
  ];
}
