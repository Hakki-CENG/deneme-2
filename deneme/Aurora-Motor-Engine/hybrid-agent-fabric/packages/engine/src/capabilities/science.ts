/**
 * FAZ 9 2/3 — recomputation as a governed capability.
 *
 * 1/3 could recompute a claim but nothing constructed one, so the verifier was
 * reachable and not reached. This is the path a task actually takes: a claim and
 * the command that produces its value again, run in the session sandbox.
 *
 * It goes through `SandboxFactory`, the same path `process.exec` uses, so the
 * sandbox backend, workspace confinement and environment scrubbing are inherited
 * rather than re-implemented — and the risk is declared `process` with
 * `sideEffect: true`, because it runs a command.
 *
 * Three rules, all about what counts as having computed:
 *
 *   1. A command that exits non-zero did not run. Its stdout is not a result
 *      however numeric it looks.
 *   2. Output that is not a number did not run either, and the raw output goes
 *      into the evidence so the failure can be read rather than inferred.
 *   3. The claimed value and the command come from different places on purpose:
 *      the value is what the model said, the command is what decides. Nothing
 *      here lets the stated value confirm itself.
 *
 * Only the last non-empty stdout line is read, so a command may log progress and
 * still print its answer — but a command that prints nothing has not answered.
 */

import { z } from "zod";
import type { SandboxFactory } from "../sandbox/sandbox.js";
import { verifyNumericClaims, type NumericCheck, type NumericClaim } from "../science/computation-verifier.js";
import { defineCapability } from "./schema.js";

const tolerance = z
  .object({
    absolute: z.number().nonnegative().optional(),
    relative: z.number().nonnegative().max(1).optional(),
  })
  .strict();

const claimInput = z
  .object({
    id: z.string().min(1).max(200),
    statement: z.string().min(1).max(2000),
    /** What the model says the value is. Recorded, never trusted. */
    value: z.number(),
    /** How the value is produced again. This is what decides. */
    command: z.string().min(1).max(50_000),
    producedBy: z.string().max(500).optional(),
    tolerance: tolerance.optional(),
  })
  .strict();

/** The last non-empty line of stdout, parsed as a number. */
export function parseNumericOutput(stdout: string): { value?: number; raw: string } {
  const lines = stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const raw = lines[lines.length - 1] ?? "";
  if (raw.length === 0) return { raw: "" };
  const value = Number(raw);
  return Number.isNaN(value) ? { raw } : { value, raw };
}

/**
 * Drops absent tolerance fields.
 *
 * `exactOptionalPropertyTypes` distinguishes "not supplied" from "supplied as
 * undefined", and a tolerance of `undefined` would mean "any difference is
 * acceptable" to a careless reader. Absent means exact.
 */
function normalizedTolerance(
  input: { absolute?: number | undefined; relative?: number | undefined } | undefined,
): { absolute?: number; relative?: number } | undefined {
  if (input === undefined) return undefined;
  const out: { absolute?: number; relative?: number } = {};
  let any = false;
  if (input.absolute !== undefined) {
    out.absolute = input.absolute;
    any = true;
  }
  if (input.relative !== undefined) {
    out.relative = input.relative;
    any = true;
  }
  return any ? out : undefined;
}

export function scienceCapabilities(factory: SandboxFactory) {
  return defineCapability(
    {
      id: "science.recompute",
      version: "1.0.0",
      description:
        "Recompute claimed numeric results in the session sandbox and compare them. The stated value is recorded, never trusted: only the command's output decides. A claim with no command is reported as unchecked rather than accepted, and a command that fails or prints no number is reported as not run.",
      risk: "process",
      sideEffect: true,
      source: "core",
    },
    z.object({
      claims: z.array(claimInput).min(1).max(50),
      /** How many times to recompute each claim. Above 1, the runs must agree. */
      runs: z.number().int().min(1).max(5).optional(),
      cwd: z.string().max(1000).optional(),
      timeoutMs: z.number().int().positive().max(600_000).optional(),
      defaultTolerance: tolerance.optional(),
    }),
    async (input, context) => {
      const sandbox = await factory(context.workspacePath);
      const checks: NumericCheck[] = [];
      const claims: NumericClaim[] = [];

      try {
        for (const claim of input.claims) {
          claims.push({
            id: claim.id,
            statement: claim.statement,
            value: claim.value,
            producedBy: claim.producedBy ?? "not stated",
          });

          checks.push({
            claimId: claim.id,
            ...(normalizedTolerance(claim.tolerance) === undefined
              ? {}
              : { tolerance: normalizedTolerance(claim.tolerance)! }),
            recompute: async () => {
              const result = await sandbox.exec({
                command: claim.command,
                ...(input.cwd ? { cwd: input.cwd } : {}),
                ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
                ...(context.signal ? { signal: context.signal } : {}),
              });

              if (result.exitCode !== 0) {
                // Rule 1: a failing command did not compute anything. `exitCode`
                // is null when the process was signalled rather than exiting.
                throw new Error(
                  result.timedOut
                    ? "the command timed out"
                    : `command exited ${result.exitCode === null ? "without a code" : result.exitCode}: ${result.stdout.slice(0, 300)}`,
                );
              }

              const parsed = parseNumericOutput(String(result.stdout ?? ""));
              if (parsed.value === undefined) {
                // Rule 2: no number in the output is not a number.
                throw new Error(
                  parsed.raw.length === 0
                    ? "the command printed nothing"
                    : `the command's last output line was not a number: ${parsed.raw.slice(0, 200)}`,
                );
              }
              return parsed.value;
            },
          });
        }

        const verification = await verifyNumericClaims(claims, checks, {
          ...(input.runs === undefined ? {} : { runs: input.runs }),
          ...(normalizedTolerance(input.defaultTolerance) === undefined
            ? {}
            : { defaultTolerance: normalizedTolerance(input.defaultTolerance)! }),
        });

        return {
          verdict: verification.verdict,
          summary: verification.summary,
          counts: {
            verified: verification.verified,
            mismatched: verification.mismatched,
            didNotRun: verification.didNotRun,
            noCheck: verification.noCheck,
            notReproducible: verification.inconsistent,
          },
          results: verification.results.map((result) => ({
            claimId: result.claimId,
            outcome: result.outcome,
            claimed: result.claimed,
            computed: result.computed,
            evidence: result.evidence,
          })),
        };
      } finally {
        await sandbox.destroy();
      }
    },
  );
}
