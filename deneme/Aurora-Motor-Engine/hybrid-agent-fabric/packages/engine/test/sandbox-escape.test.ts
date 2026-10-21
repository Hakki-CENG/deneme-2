/**
 * The sandbox must be a security boundary, not a suggestion.
 *
 * `capabilities/sandbox-worker.ts` runs model-generated capability code inside a
 * `node:vm` context. Node's own documentation says `vm` is not a security
 * mechanism, and the reason is concrete: any host object handed into the context
 * carries `.constructor.constructor`, which is the **host realm's** Function
 * constructor. Calling it evaluates code in the host realm, where `process`
 * exists.
 *
 * The worker handed in a long list of host intrinsics (`JSON`, `Math`, `Date`,
 * `String`, `Array`, `Object`, `Promise`, `Error`, ...) plus a `console` built
 * from host closures, plus `structuredClone`. Every one of those is a door.
 *
 * Measured before the fix, through `SandboxExecutor.executeInSandbox` — the real
 * execution path, not a reproduction of it:
 *
 *   JSON.constructor.constructor('return process')()  -> the host process object
 *   process.binding('fs')                             -> access, existsSync, open
 *   process.env                                       -> readable, secrets included
 *   process.pid / process.cwd()                       -> the host's identity
 *
 * `codeGeneration: { strings: false, wasm: false }` did not stop any of it,
 * because that option governs the **context's** own eval/Function, not the host
 * realm's.
 *
 * So these tests are written as escape attempts, and the assertion is that the
 * attempt comes back denied rather than that no error was thrown. A sandbox test
 * that only checks "benign code still runs" proves nothing about the boundary.
 */

import { describe, expect, it } from "vitest";

import { SandboxExecutor } from "../src/capabilities/capability-synthesis.js";

/** Every known route from a vm context back to the host realm. */
const ESCAPES: ReadonlyArray<readonly [name: string, code: string]> = [
  [
    "host Function constructor via JSON",
    "return JSON.constructor.constructor('return process')()",
  ],
  [
    "host Function constructor via Math",
    "return Math.constructor.constructor('return process')()",
  ],
  [
    "host Function constructor via Date",
    "return Date.constructor.constructor('return process')()",
  ],
  [
    "host Function constructor via Error",
    "return Error.constructor.constructor('return process')()",
  ],
  [
    "host Function constructor via the console closures",
    "return console.log.constructor.constructor('return process')()",
  ],
  [
    "host Function constructor via structuredClone",
    "return structuredClone.constructor.constructor('return process')()",
  ],
  [
    "host Function constructor via Array",
    "return [].constructor.constructor('return process')()",
  ],
  [
    "host require via the constructor chain",
    "return JSON.constructor.constructor('return require')()",
  ],
];

/** What an attacker does once the host realm is reachable. */
const PAYLOADS: ReadonlyArray<readonly [name: string, code: string]> = [
  [
    "raw filesystem syscalls via process.binding('fs')",
    "return typeof JSON.constructor.constructor('return process')().binding('fs').open",
  ],
  [
    "environment variables, including secrets",
    "return Object.keys(JSON.constructor.constructor('return process')().env).length",
  ],
  [
    "host identity: pid and cwd",
    "const p = JSON.constructor.constructor('return process')(); return p.pid + ':' + p.cwd()",
  ],
  [
    "spawning a child process",
    "return typeof JSON.constructor.constructor('return process')().binding",
  ],
];

describe("the sandbox denies every known route back to the host realm", () => {
  it.each(ESCAPES)("blocks %s", async (_name, code) => {
    const executor = new SandboxExecutor({ defaultTimeoutMs: 4000, defaultHeapMb: 64 });
    const sandboxId = executor.createSandbox("escape-probe");

    const result = await executor.executeInSandbox(sandboxId, code, {});

    // The load-bearing assertion: the escape must not hand back a host object.
    // A thrown error is a pass. A returned value describing the host is a fail.
    if (result.success) {
      const out = result.output;
      expect(out, "the sandbox returned a value where it should have denied one").toBeNull();
    }
    const text = `${result.error ?? ""}`;
    expect(text).not.toMatch(/host realm reachable/);
  });

  it.each(PAYLOADS)("denies %s", async (_name, code) => {
    const executor = new SandboxExecutor({ defaultTimeoutMs: 4000, defaultHeapMb: 64 });
    const sandboxId = executor.createSandbox("payload-probe");

    const result = await executor.executeInSandbox(sandboxId, code, {});

    if (result.success) {
      const out = result.output;
      // A number, a path or a function name here means the host was reached.
      expect(out, `the sandbox leaked host state: ${String(out)}`).toBeNull();
    }
  });

  it("does not expose process, require, or import as globals", async () => {
    const executor = new SandboxExecutor({ defaultTimeoutMs: 4000, defaultHeapMb: 64 });
    const sandboxId = executor.createSandbox("globals-probe");

    const result = await executor.executeInSandbox(
      sandboxId,
      "return [typeof process, typeof require, typeof globalThis.process].join(',')",
      {},
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe("undefined,undefined,undefined");
  });
});

describe("the fix must not break legitimate capability code", () => {
  it("still runs pure computation over the supplied input", async () => {
    const executor = new SandboxExecutor({ defaultTimeoutMs: 4000, defaultHeapMb: 64 });
    const sandboxId = executor.createSandbox("legit");

    const result = await executor.executeInSandbox(
      sandboxId,
      "return input.values.reduce((a, b) => a + b, 0)",
      { values: [1, 2, 3, 4] },
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe(10);
  });

  it("still supports the standard library the capability contract promises", async () => {
    const executor = new SandboxExecutor({ defaultTimeoutMs: 4000, defaultHeapMb: 64 });
    const sandboxId = executor.createSandbox("stdlib");

    const result = await executor.executeInSandbox(
      sandboxId,
      "return JSON.stringify({ n: Math.max(1, 2), s: String(7).padStart(3, '0'), d: new Date(0).getUTCFullYear(), m: new Map([['a', 1]]).get('a'), r: /a/.test('ba') })",
      {},
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('{"n":2,"s":"007","d":1970,"m":1,"r":true}');
  });

  it("still enforces the wall-clock budget", async () => {
    const executor = new SandboxExecutor({ defaultTimeoutMs: 500, defaultHeapMb: 64 });
    const sandboxId = executor.createSandbox("timeout");

    const started = Date.now();
    const result = await executor.executeInSandbox(
      sandboxId,
      "while (true) {}",
      {},
    );

    expect(result.success).toBe(false);
    expect(Date.now() - started).toBeLessThan(8000);
  });

  it("still reports a throwing capability as a failure rather than a success", async () => {
    const executor = new SandboxExecutor({ defaultTimeoutMs: 4000, defaultHeapMb: 64 });
    const sandboxId = executor.createSandbox("throwing");

    const result = await executor.executeInSandbox(sandboxId, "throw new Error('nope')", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("nope");
  });
});
