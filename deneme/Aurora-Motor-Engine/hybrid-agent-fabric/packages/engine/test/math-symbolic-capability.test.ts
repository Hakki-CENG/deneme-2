/**
 * Symbolic mathematics, exercised against a real SymPy.
 *
 * The cases that matter here are not "does it compute" but "does it know which
 * of its answers it has checked". `solve` and `diff` come back with an
 * independent confirmation and are marked verified. `integrate` and `factor`
 * come back as answers with no independent check available, and are marked
 * unchecked — which the verifier reports as not established rather than
 * quietly endorsing.
 *
 * A test that only asserted the answers were right would pass against a
 * capability that claims everything it returns is verified.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";
import {
  MATH_SYMBOLIC_CAPABILITY_ID,
  MATH_SYMBOLIC_MANIFEST,
  interpretCheck,
} from "../src/capabilities/math-symbolic.js";
import { assessManifest } from "../src/capabilities/manifest.js";

let root: string | undefined;

function sympyAvailable(): { ok: boolean; detail: string } {
  try {
    const out = execFileSync("python3", ["-c", "import sympy; print(sympy.__version__)"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    return { ok: true, detail: out.trim() };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 120) };
  }
}

const SYMPY = sympyAvailable();

// Follows the repository's convention for tests that need a real external
// backend (postgres-rls-integration, real-encoder-recall, version): skip,
// visibly, rather than fail. These were written to throw instead, on the
// reasoning that a skipped integration test is not evidence — which is true
// but made `npm test` fail on any machine without the backend installed.
// The pure-logic describes in this file are deliberately left outside the
// skip so the file always asserts something.

async function bootEngine(): Promise<HybridAgentEngine> {
  root = await mkdtemp(join(tmpdir(), "haf-math-"));
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

function context() {
  return {
    tenantId: "tenant-test",
    sessionId: "00000000-0000-0000-0000-000000000001",
    familyId: "00000000-0000-0000-0000-000000000002",
    turnId: "00000000-0000-0000-0000-000000000003",
    toolCallId: "00000000-0000-0000-0000-000000000004",
    source: "user",
    workspacePath: root ?? tmpdir(),
  } as never;
}

async function compute(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const engine = await bootEngine();
  return (await engine.capabilities.execute(
    MATH_SYMBOLIC_CAPABILITY_ID,
    input,
    context(),
  )) as Record<string, unknown>;
}

describe("the manifest passes its own gate", () => {
  it("is complete, and records the licence that was verified by reading the file", () => {
    expect(assessManifest(MATH_SYMBOLIC_MANIFEST).complete).toBe(true);
    expect(MATH_SYMBOLIC_MANIFEST.provenance.license).toBe("BSD-3-Clause");
    expect(MATH_SYMBOLIC_MANIFEST.provenance.commit).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("states that parsing is one layer of defence rather than the whole of it", () => {
    expect(
      MATH_SYMBOLIC_MANIFEST.limitations.some((l) => l.includes("one layer of defence")),
    ).toBe(true);
  });
});

describe.skipIf(!SYMPY.ok)("a booted engine exposes it, and the answers it can check are verified", () => {
  it("is registered with its manifest", async () => {
    const engine = await bootEngine();

    expect(engine.capabilities.list().some((c) => c.id === MATH_SYMBOLIC_CAPABILITY_ID)).toBe(true);
    expect(engine.capabilities.manifestFor(MATH_SYMBOLIC_CAPABILITY_ID)?.provenance.license).toBe(
      "BSD-3-Clause",
    );
  }, 120_000);

  it("solves an equation and verifies the answer by substituting it back", async () => {
    const out = await compute({ operation: "solve", expression: "x**2 - 5*x + 6", variable: "x" });

    expect(out.installed).toBe(true);
    expect(out.result).toBe("[2, 3]");
    expect(out.verified).toBe(true);
    expect(out.unchecked).toBe(false);
    expect(String(out.checkDetail)).toContain("zero residual");
  }, 180_000);

  it("differentiates and verifies against an independent difference quotient", async () => {
    const out = await compute({ operation: "diff", expression: "sin(x)*x**2", variable: "x" });

    expect(out.result).toBe("x**2*cos(x) + 2*x*sin(x)");
    expect(out.verified).toBe(true);
    expect(String(out.checkDetail)).toContain("difference quotient");
  }, 180_000);

  it("integrates correctly, and says plainly that nothing checked it", async () => {
    const out = await compute({ operation: "integrate", expression: "1/x", variable: "x" });

    expect(out.result).toBe("log(x)");
    // The answer is right and the capability admits it did not establish that.
    expect(out.verified).toBe(false);
    expect(out.unchecked).toBe(true);
    expect(String(out.checkDetail)).toContain("no independent check applies");
  }, 180_000);

  it("factors correctly, and is likewise unchecked rather than silently verified", async () => {
    const out = await compute({ operation: "factor", expression: "x**3 - 1" });

    expect(out.result).toBe("(x - 1)*(x**2 + x + 1)");
    expect(out.verified).toBe(false);
    expect(out.unchecked).toBe(true);
  }, 180_000);
});

describe.skipIf(!SYMPY.ok)("the parser does not run the caller's code", () => {
  it.each([
    '__import__("os").system("id")',
    'open("/etc/passwd").read()',
    "eval('1+1')",
    "[c for c in ().__class__.__bases__]",
  ])("refuses %s", async (expression) => {
    const out = await compute({ operation: "simplify", expression });

    // Either the worker refused to parse it, or the capability reported a
    // failure. What must not happen is a computed result.
    expect(out.result).toBeUndefined();
    const text = `${String(out.reason ?? "")}${String(out.stderr ?? "")}${String(out.status ?? "")}`;
    expect(text).toMatch(/parse|NameError|failed|not defined/i);
  }, 180_000);

  it("refuses an unknown operation rather than guessing", async () => {
    const out = await compute({ operation: "simplify", expression: "x+1" });
    expect(out.installed).toBe(true);

    const bad = await compute({ operation: "prove", expression: "x+1" }).catch(
      (err: unknown) => ({ status: "threw", reason: String(err) }),
    );
    expect(`${String(bad.status)}${String(bad.reason ?? "")}`).toMatch(/threw|Invalid|operation/i);
  }, 180_000);
});

describe("the interpreter that reads the check has a real failure mode", () => {
  const base = { operation: "solve", input: "x", result: "[1]", variable: "x" };

  it("treats a non-zero residual as not verified", () => {
    const verdict = interpretCheck({ ...base, check: { substituted_residuals: ["0", "3"] } });
    expect(verdict.verified).toBe(false);
    expect(verdict.unchecked).toBe(false);
    expect(verdict.detail).toContain("did not substitute back to zero");
  });

  it("treats a residual it could not compute as unchecked, not as verified", () => {
    const verdict = interpretCheck({
      ...base,
      check: { substituted_residuals: ["unchecked: something broke"] },
    });
    expect(verdict.verified).toBe(false);
    expect(verdict.detail).toContain("did not substitute back to zero");
  });

  it("treats a large derivative delta as disagreement", () => {
    const verdict = interpretCheck({
      ...base,
      check: { numeric_vs_symbolic_delta: "4.5" },
    });
    expect(verdict.verified).toBe(false);
    expect(verdict.detail).toContain("disagrees");
  });

  it("treats an absent check as unchecked rather than as a pass", () => {
    const verdict = interpretCheck({ ...base, check: {} });
    expect(verdict.verified).toBe(false);
    expect(verdict.unchecked).toBe(true);
  });
});
