/**
 * Lean 4 theorem checking (V2 integration plan, wave 3 item 17: "Math formal tools:
 * SymPy, Lean/mathlib, Z3").
 *
 * Where this sits relative to the other two. SymPy manipulates expressions. Z3
 * decides whether constraints are satisfiable. Lean checks a proof: if `lean` exits
 * cleanly over a file, every proposition in it was accepted by the kernel's type
 * checker, which is the strongest guarantee any capability in this repository can
 * make. So a clean check is reported as verified, and the reason says what was
 * checked rather than merely that nothing failed.
 *
 * TWO WAYS THIS COULD LIE, AND HOW EACH IS HANDLED.
 *
 * A file that type-checks but proves nothing. An empty file passes. So does one
 * containing only `#eval 2 + 2`. Reporting either as a verified proof would be the
 * vacuous-criterion failure this repository already found in its evaluation suite,
 * wearing a different costume. So the source is inspected for a proposition
 * (`theorem`, `lemma`, `example`, or a `def` whose type is a `Prop`) and a clean
 * check over a file with none is reported as verified:false with the reason that
 * nothing was proved. That is a lexical check, not a semantic one — it can be
 * fooled by a proposition inside a comment — so it is described as what it is and
 * never as a guarantee.
 *
 * A toolchain that is not there. `lean` is not a pip package and this capability
 * installs nothing. When the binary is absent the result is status `unavailable`
 * naming the one command that fixes it, which is the same contract the other
 * external-backend capabilities use: a missing backend is a reported condition, not
 * a malfunction and not a silent skip.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineCapability } from "./schema.js";

export const LEAN_CHECK_CAPABILITY_ID = "math.lean.check";
export const LEAN_INSTALL_HINT = "node scripts/install-backends.mjs --lean";

/**
 * Finds the `lean` binary.
 *
 * elan installs into `$HOME/.elan/bin`, which is appended to the shell profile but
 * is not necessarily on PATH for a process that was already running — so checking
 * only PATH would report the toolchain missing on a machine where the previous
 * command installed it successfully.
 */
export function findLeanBinary(): string | null {
  const probe = spawnSyncStatus("lean", ["--version"]);
  if (probe) return "lean";
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home) {
    const shim = join(home, ".elan", "bin", process.platform === "win32" ? "lean.exe" : "lean");
    if (existsSync(shim)) return shim;
  }
  return null;
}

/** True if the command exists and exits 0. Deliberately never throws. */
function spawnSyncStatus(command: string, args: string[]): boolean {
  try {
    return spawnSync(command, args, { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

/** Words that introduce a proposition. Lexical, and documented as such. */
const PROPOSITION_PATTERN = /^\s*(?:@\[[^\]]*\]\s*)*(theorem|lemma|example)\b|^\s*def\s+\w+[^\n]*:\s*Prop\b/m;

export function declaresProposition(source: string): boolean {
  return PROPOSITION_PATTERN.test(source);
}

export interface LeanCheckServiceOptions {
  /** Override the binary; defaults to `findLeanBinary()`. */
  leanPath?: string;
  timeoutMs?: number;
  /** Extra arguments passed to `lean`, e.g. a lake environment's search path. */
  extraArgs?: readonly string[];
}

export interface LeanCheckResult {
  status: "executed" | "unavailable" | "failed";
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  version?: string;
  durationMs: number;
}

/** Runs `lean` over one source file in a temporary directory. */
export async function checkLeanSource(
  source: string,
  options: LeanCheckServiceOptions = {},
): Promise<LeanCheckResult> {
  const startedAt = Date.now();
  const leanPath = options.leanPath ?? findLeanBinary();
  if (!leanPath) {
    return {
      status: "unavailable",
      durationMs: Date.now() - startedAt,
      stderr: `the Lean toolchain is not installed. Install it with: ${LEAN_INSTALL_HINT}`,
    };
  }

  const directory = await mkdtemp(join(tmpdir(), "haf-lean-"));
  const file = join(directory, "Check.lean");
  try {
    await writeFile(file, source, "utf8");
    let stdout = "";
    let stderr = "";
    const child = spawn(leanPath, [...(options.extraArgs ?? []), file], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 120_000);
    try {
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      // The `error` event has to be handled. Spawning a path that does not exist
      // emits `error` and never emits `exit`, so waiting on `exit` alone hung
      // forever instead of reporting the missing toolchain — found by a test that
      // timed out rather than by reading the code.
      const exitCode = await new Promise<number | null>((resolveExit) => {
        child.on("error", () => resolveExit(null));
        child.on("exit", (code) => resolveExit(code));
      });
      if (exitCode === null) {
        return {
          status: "unavailable",
          durationMs: Date.now() - startedAt,
          stderr:
            `the Lean toolchain could not be started at ${leanPath}. `
            + `Install it with: ${LEAN_INSTALL_HINT}`,
        };
      }
      return {
        status: "executed",
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return {
      status: "failed",
      durationMs: Date.now() - startedAt,
      stderr: `lean could not be run: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * The `math.lean.check` capability.
 *
 * Verification: a non-zero exit is a failure, because Lean said so. A zero exit is
 * verified only if the source declares a proposition; otherwise nothing was proved
 * and the result says so. `unavailable` is reported as ok — a missing toolchain is
 * a condition, not a failed proof.
 */
export function leanCheckCapability(options: LeanCheckServiceOptions = {}) {
  return defineCapability(
    {
      id: LEAN_CHECK_CAPABILITY_ID,
      version: "1.0.0",
      description:
        "Type-check Lean 4 source with the Lean kernel and report whether every proposition in it was accepted. " +
        "Requires the Lean toolchain; returns 'unavailable' with the install command if it is missing. " +
        "A file that type-checks but declares no proposition is reported as having proved nothing.",
      risk: "pure",
      sideEffect: false,
      source: "core",
      idempotency: "inherent",
    },
    z.object({
      source: z.string().min(1).max(200_000),
      /** Extra arguments for `lean`, e.g. a search path for a lake environment. */
      extraArgs: z.array(z.string().max(500)).max(20).optional(),
    }),
    async (input) => {
      const run = await checkLeanSource(input.source, {
        ...options,
        ...(input.extraArgs ? { extraArgs: input.extraArgs } : {}),
      });

      if (run.status === "unavailable") {
        return {
          status: "unavailable",
          reason: run.stderr,
          verified: false,
          durationMs: run.durationMs,
        };
      }
      if (run.status === "failed") {
        return { status: "failed", reason: run.stderr, verified: false, durationMs: run.durationMs };
      }

      const exitCode = run.exitCode ?? -1;
      const declares = declaresProposition(input.source);
      const clean = exitCode === 0;

      if (!clean) {
        return {
          status: "executed",
          accepted: false,
          declaresProposition: declares,
          exitCode,
          errors: run.stderr || run.stdout || `lean exited with code ${exitCode} and produced no message`,
          verified: false,
          checkDetail: `Lean rejected the source with exit code ${exitCode}.`,
          durationMs: run.durationMs,
        };
      }

      if (!declares) {
        // Type-checking passed, but there was nothing to check. Reporting this as a
        // verified proof would be the vacuous-pass failure in a new costume.
        return {
          status: "executed",
          accepted: true,
          declaresProposition: false,
          exitCode,
          stdout: run.stdout,
          verified: false,
          unchecked: true,
          checkDetail:
            "Lean accepted the file, but it declares no theorem, lemma, example or Prop-valued definition, " +
            "so nothing was proved. The proposition scan is lexical and can be fooled by a proposition " +
            "inside a comment; it is a warning, not a guarantee.",
          durationMs: run.durationMs,
        };
      }

      return {
        status: "executed",
        accepted: true,
        declaresProposition: true,
        exitCode,
        stdout: run.stdout,
        verified: true,
        checkDetail:
          "the Lean kernel type-checked every proposition in the source. This is a machine-checked " +
          "result, not an opinion about it.",
        durationMs: run.durationMs,
      };
    },
    {
      idempotency: "inherent",
      output: z.object({
        status: z.string(),
        accepted: z.boolean().optional(),
        declaresProposition: z.boolean().optional(),
        exitCode: z.number().optional(),
        stdout: z.string().optional(),
        errors: z.string().optional(),
        reason: z.string().optional(),
        verified: z.boolean(),
        unchecked: z.boolean().optional(),
        checkDetail: z.string().optional(),
        durationMs: z.number(),
      }),
      verify: async (output) => {
        const value = output as Record<string, unknown>;
        const status = String(value.status ?? "");
        if (status === "unavailable") {
          return { ok: true, reason: String(value.reason ?? "the Lean toolchain is not installed") };
        }
        if (status !== "executed") {
          return { ok: true, reason: String(value.reason ?? status) || "the capability reported its own failure" };
        }
        if (value.accepted === false) {
          return { ok: false, reason: String(value.checkDetail ?? "Lean rejected the source") };
        }
        if (value.verified === false) {
          return {
            ok: true,
            reason: String(value.checkDetail ?? "the file type-checked but proved nothing"),
          };
        }
        return { ok: true, reason: String(value.checkDetail ?? "Lean accepted every proposition") };
      },
    },
  );
}
