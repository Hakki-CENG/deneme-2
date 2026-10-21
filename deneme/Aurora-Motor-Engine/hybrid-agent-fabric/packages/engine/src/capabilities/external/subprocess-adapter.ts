/**
 * Subprocess capability adapter — how an external tool actually gets run.
 *
 * This is the mechanism the integration standard needs and the repo did not
 * have: a way to execute something that lives outside the repo, under a
 * manifest, with the manifest's limits applied rather than merely declared.
 *
 * Design decisions, and why each one is the way it is:
 *
 * **No shell.** The child is spawned with an argument vector, never a command
 * string. Interpolating capability input into a shell command is how a
 * capability that receives `; rm -rf /` ends up running it. Arguments are
 * passed as data.
 *
 * **Timeout comes from the manifest, not from the caller.** A caller that could
 * pass its own timeout could also pass none. `resourceLimits.timeoutMs` is the
 * contract; the adapter enforces it and kills the process group when it
 * expires, because a killed parent that leaves children running has not
 * released anything.
 *
 * **Output is bounded.** A tool that writes until it fills the disk or the heap
 * is a denial of service against Aurora, so stdout is capped and the excess is
 * reported as truncation rather than silently dropped.
 *
 * **Exit code 0 is not success.** The adapter reports `executed`, never
 * `succeeded`. Deciding whether the task was accomplished belongs to a
 * verifier, and `statusForRun` downgrades to `unverified` when the manifest
 * declares none. This is the rule from step 2, applied here rather than left
 * in a document.
 */

import { spawn } from "node:child_process";

import { statusForRun, type CapabilityManifest } from "../manifest.js";
import type { ExecutionStatus } from "../../execution/execution-status.js";

export interface SubprocessRunInput {
  /** Absolute path to the executable, or a bare name resolvable on PATH. */
  readonly command: string;
  /** Arguments, passed as data. Never joined into a shell string. */
  readonly args: readonly string[];
  /** Stdin payload, if the tool reads one. */
  readonly stdin?: string | undefined;
  /** Working directory. Defaults to the process cwd. */
  readonly cwd?: string | undefined;
}

export interface SubprocessRunResult {
  readonly status: ExecutionStatus;
  /** True when a `succeeded` claim was downgraded, and why. */
  readonly downgraded: boolean;
  readonly reason?: string | undefined;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Whether stdout was cut off by the size cap. */
  readonly stdoutTruncated: boolean;
  readonly durationMs: number;
}

/** Cap stdout so a chatty tool cannot exhaust the heap. */
const MAX_STDOUT_BYTES = 8 * 1024 * 1024;

export interface SubprocessAdapterOptions {
  /** Override the manifest timeout, only to make it shorter. Never longer. */
  readonly maxTimeoutMs?: number | undefined;
}

/**
 * Run an external tool under its manifest.
 *
 * The manifest is not decoration here: its `timeoutMs` decides how long the
 * child may live, and its `verifierIds` decide whether the run is allowed to
 * be called a success.
 */
export async function runSubprocessCapability(
  manifest: CapabilityManifest,
  input: SubprocessRunInput,
  options: SubprocessAdapterOptions = {},
): Promise<SubprocessRunResult> {
  const declared = manifest.resourceLimits.timeoutMs;
  const cap = options.maxTimeoutMs;
  // A caller may tighten the budget but never loosen it.
  const timeoutMs = cap === undefined ? declared : Math.min(declared, cap);

  const started = Date.now();

  return new Promise<SubprocessRunResult>((resolve) => {
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd,
      shell: false,
      // A detached child gets its own process group, so killing -pid takes the
      // grandchildren too. Without this a timed-out tool can outlive its parent.
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        // A capability does not inherit Aurora's environment. Secrets in env
        // are the most common accidental leak across a process boundary, and
        // the manifest declares what the tool needs rather than inheriting it.
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        LANG: "C.UTF-8",
      },
    });

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let settled = false;

    const finish = (result: SubprocessRunResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const killTree = (): void => {
      if (child.pid === undefined) return;
      try {
        // Negative pid signals the whole group created by `detached: true`.
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    };

    const timer = setTimeout(() => {
      killTree();
      const claimed = statusForRun(manifest, "timed_out");
      finish({
        status: claimed.status,
        downgraded: claimed.downgraded,
        ...(claimed.reason ? { reason: claimed.reason } : {}),
        exitCode: null,
        signal: "SIGKILL",
        stdout,
        stderr,
        stdoutTruncated,
        durationMs: Date.now() - started,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutTruncated) return;
      if (stdout.length + chunk.length > MAX_STDOUT_BYTES) {
        stdout += chunk.subarray(0, Math.max(0, MAX_STDOUT_BYTES - stdout.length)).toString("utf8");
        stdoutTruncated = true;
        return;
      }
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDOUT_BYTES) stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      // The executable could not be started at all: not installed, not on PATH,
      // not executable. That is `unavailable`, not `failed` — the work did not
      // run, and calling it a failure would blame the tool for being absent.
      const claimed = statusForRun(manifest, "unavailable");
      finish({
        status: claimed.status,
        downgraded: claimed.downgraded,
        reason: `could not start '${input.command}': ${err.message}`,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        stdoutTruncated,
        durationMs: Date.now() - started,
      });
    });

    child.on("close", (exitCode, signal) => {
      // The tool ran. Whether its output is correct is a separate question that
      // only a verifier can answer, so the most this layer may claim is
      // `executed` on a clean exit and `failed` on a non-zero one.
      const base: ExecutionStatus =
        signal !== null ? "failed" : exitCode === 0 ? "executed" : "failed";
      const claimed = statusForRun(manifest, base);
      finish({
        status: claimed.status,
        downgraded: claimed.downgraded,
        ...(claimed.reason ? { reason: claimed.reason } : {}),
        exitCode,
        signal,
        stdout,
        stderr,
        stdoutTruncated,
        durationMs: Date.now() - started,
      });
    });

    if (input.stdin !== undefined) {
      child.stdin.on("error", () => {
        /* a tool that exits before reading stdin is not an adapter failure */
      });
      child.stdin.end(input.stdin);
    } else {
      child.stdin.end();
    }
  });
}
