/**
 * FAZ 9 2/3 — recomputation as a governed capability.
 *
 * Drives the capability's own execute path against a fake sandbox, so the rules
 * are tested where a task would hit them rather than only in the verifier.
 *
 * The test that carries the phase: the stated value cannot confirm itself. A
 * command that runs correctly against a claim that is simply wrong must report a
 * mismatch, because the command is what decides.
 */

import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";

import { parseNumericOutput, scienceCapabilities } from "../src/capabilities/science.js";
import type { Sandbox, SandboxExecResult, SandboxFactory } from "../src/sandbox/sandbox.js";
import type { CapabilityContext } from "../src/types.js";

function execResult(fields: Partial<SandboxExecResult> = {}): SandboxExecResult {
  return { exitCode: 0, stdout: "", timedOut: false, truncated: false, durationMs: 1, ...fields };
}

/** A sandbox that answers by command string. */
function fakeSandbox(byCommand: Record<string, SandboxExecResult>): {
  factory: SandboxFactory;
  destroyed: number;
  ran: string[];
} {
  const state = { destroyed: 0, ran: [] as string[] };
  const sandbox: Sandbox = {
    kind: "fake",
    workspacePath: "/workspace",
    exec: async (request) => {
      state.ran.push(request.command);
      const found = byCommand[request.command];
      if (found === undefined) return execResult({ exitCode: 127, stdout: `no such command: ${request.command}` });
      return found;
    },
    destroy: async () => {
      state.destroyed += 1;
    },
  } as unknown as Sandbox;
  // Returning `state` itself rather than spreading it: a spread copies the
  // counters at call time, so a later read would see the stale zero.
  return { factory: async () => sandbox, state };
}

function context(): CapabilityContext {
  return {
    tenantId: "tenant",
    sessionId: randomUUID(),
    familyId: randomUUID(),
    turnId: randomUUID(),
    toolCallId: randomUUID(),
    source: "api",
    workspacePath: "/workspace",
    idempotencyKey: "test",
  } as CapabilityContext;
}

interface RecomputeResult {
  verdict: string;
  summary: string;
  counts: { verified: number; mismatched: number; didNotRun: number; noCheck: number; notReproducible: number };
  results: Array<{ claimId: string; outcome: string; claimed: number; computed: number[]; evidence: string }>;
}

async function run(byCommand: Record<string, SandboxExecResult>, claims: unknown[], extra: Record<string, unknown> = {}) {
  const { factory, state } = fakeSandbox(byCommand);
  const capability = scienceCapabilities(factory);
  const output = (await capability.execute(
    capability.validate({ claims, ...extra }),
    context(),
  )) as unknown as RecomputeResult & Record<string, unknown>;
  return { output, destroyed: () => state.destroyed, ran: () => state.ran };
}

describe("parseNumericOutput", () => {
  it("reads the last non-empty line, so a command may log and still answer", () => {
    expect(parseNumericOutput("loading…\ncomputing…\n4\n").value).toBe(4);
  });

  it("returns no value for output that is not a number", () => {
    const parsed = parseNumericOutput("the answer is four\n");
    expect(parsed.value).toBeUndefined();
    expect(parsed.raw).toBe("the answer is four");
  });

  it("returns no value for empty output", () => {
    expect(parseNumericOutput("   \n\n").value).toBeUndefined();
  });
});

describe("the capability declares what it does", () => {
  it("is a process-risk capability with a side effect", () => {
    const capability = scienceCapabilities(async () => ({}) as unknown as Sandbox);
    expect(capability.descriptor.id).toBe("science.recompute");
    expect(capability.descriptor.risk).toBe("process");
    expect(capability.descriptor.sideEffect).toBe(true);
  });
});

describe("the capability is registered by the engine", () => {
  it("is reachable through the real capability inventory", async () => {
    // Proves the engine.ts registration, not just that the module exists. A
    // capability nothing registers is not a closed step.
    const homePath = await mkdtemp(join(tmpdir(), "haf-science-engine-"));
    const engine = new HybridAgentEngine({
      homePath,
      kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
      sandboxBackend: "local",
      model: { provider: "mock" },
    });
    const found = engine.capabilities.list().find((item) => item.id === "science.recompute");
    expect(found).toBeDefined();
    expect(found?.risk).toBe("process");
    expect(found?.sideEffect).toBe(true);
  });
});

describe("recomputation decides, not the stated value", () => {
  it("verifies a claim the command reproduces", async () => {
    const { output } = await run(
      { "compute-mean": execResult({ stdout: "4\n" }) },
      [{ id: "mean", statement: "the mean is 4", value: 4, command: "compute-mean" }],
    );
    expect(output.verdict).toBe("pass");
    expect(output.results[0]?.outcome).toBe("verified");
    expect(output.counts.verified).toBe(1);
  });

  it("reports a mismatch when the command disagrees with the claim", async () => {
    // The claim is wrong and the command is right. The command wins.
    const { output } = await run(
      { "compute-mean": execResult({ stdout: "4\n" }) },
      [{ id: "mean", statement: "the mean is 9", value: 9, command: "compute-mean" }],
    );
    expect(output.verdict).toBe("fail");
    expect(output.results[0]?.outcome).toBe("mismatch");
    expect(output.results[0]?.evidence).toContain("claimed 9, recomputed 4");
  });
});

describe("what counts as having computed", () => {
  it("treats a non-zero exit as not run", async () => {
    const { output } = await run(
      { "boom": execResult({ exitCode: 1, stdout: "Traceback: no module named pandas" }) },
      [{ id: "x", statement: "x is 1", value: 1, command: "boom" }],
    );
    expect(output.results[0]?.outcome).toBe("did-not-run");
    expect(output.results[0]?.evidence).toContain("command exited 1");
    expect(output.verdict).toBe("uncertain");
  });

  it("reports a timeout distinctly from a failure", async () => {
    const { output } = await run(
      { "slow": execResult({ exitCode: null, timedOut: true }) },
      [{ id: "x", statement: "x is 1", value: 1, command: "slow" }],
    );
    expect(output.results[0]?.evidence).toContain("timed out");
  });

  it("treats non-numeric output as not run, and shows the line", async () => {
    const { output } = await run(
      { "prose": execResult({ stdout: "the answer is four\n" }) },
      [{ id: "x", statement: "x is 4", value: 4, command: "prose" }],
    );
    expect(output.results[0]?.outcome).toBe("did-not-run");
    expect(output.results[0]?.evidence).toContain("the answer is four");
  });

  it("treats no output as not run", async () => {
    const { output } = await run(
      { "silent": execResult({ stdout: "" }) },
      [{ id: "x", statement: "x is 4", value: 4, command: "silent" }],
    );
    expect(output.results[0]?.evidence).toContain("printed nothing");
  });
});

describe("tolerance is the caller's, and stated", () => {
  it("mismatches exactly when no tolerance is given", async () => {
    const { output } = await run(
      { "sum": execResult({ stdout: "0.30000000000000004\n" }) },
      [{ id: "sum", statement: "the sum is 0.3", value: 0.3, command: "sum" }],
    );
    expect(output.results[0]?.outcome).toBe("mismatch");
    expect(output.results[0]?.evidence).toContain("exact comparison");
  });

  it("accepts a per-claim tolerance", async () => {
    const { output } = await run(
      { "sum": execResult({ stdout: "0.30000000000000004\n" }) },
      [{ id: "sum", statement: "the sum is 0.3", value: 0.3, command: "sum", tolerance: { absolute: 1e-9 } }],
    );
    expect(output.results[0]?.outcome).toBe("verified");
  });
});

describe("the sandbox is not leaked", () => {
  it("destroys the sandbox even when a claim fails", async () => {
    const { destroyed } = await run(
      { "boom": execResult({ exitCode: 1, stdout: "failed" }) },
      [{ id: "x", statement: "x is 1", value: 1, command: "boom" }],
    );
    expect(destroyed()).toBe(1);
  });
});

describe("input validation", () => {
  it("rejects an empty claim list", () => {
    const capability = scienceCapabilities(async () => ({}) as unknown as Sandbox);
    expect(() => capability.validate({ claims: [] })).toThrow();
  });

  it("rejects an unknown tolerance field", () => {
    const capability = scienceCapabilities(async () => ({}) as unknown as Sandbox);
    expect(() =>
      capability.validate({ claims: [{ id: "x", statement: "x", value: 1, command: "c", tolerance: { sloppy: 1 } }] }),
    ).toThrow();
  });
});
