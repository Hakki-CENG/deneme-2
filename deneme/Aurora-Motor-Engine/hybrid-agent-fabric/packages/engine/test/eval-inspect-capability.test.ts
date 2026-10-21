/**
 * eval.inspect.run — running a real external benchmark harness.
 *
 * The cases that matter here are about what a score means, not about whether
 * the harness runs.
 *
 * Every task in this file runs under `mockllm/model`, because the worker's
 * environment carries no credentials and a hosted model cannot be reached. The
 * mock model does not answer correctly, so both scorers report accuracy 0.0.
 * That is the expected result: a working harness with a fake model. The test
 * that asserts the verifier PASSES on accuracy 0.0 is the load-bearing one — a
 * verifier that failed on a low score would be grading the model while
 * claiming to check the integration.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";
import {
  EVAL_INSPECT_CAPABILITY_ID,
  EVAL_INSPECT_MANIFEST,
  INSPECT_OFFLINE_MODEL,
} from "../src/capabilities/eval-inspect.js";
import { assessManifest } from "../src/capabilities/manifest.js";

const FIXTURE_TASK = resolve(process.cwd(), "test/fixtures/inspect-arithmetic-task.py");

let root: string | undefined;
let engine: HybridAgentEngine | undefined;

function inspectAvailable(): { ok: boolean; detail: string } {
  try {
    const out = execFileSync("python3", ["-c", "import inspect_ai; print(inspect_ai.__version__)"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    return { ok: true, detail: out.trim() };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 140) };
  }
}

const INSPECT = inspectAvailable();

// Follows the repository's convention for tests that need a real external
// backend (postgres-rls-integration, real-encoder-recall, version): skip,
// visibly, rather than fail. These were written to throw instead, on the
// reasoning that a skipped integration test is not evidence — which is true
// but made `npm test` fail on any machine without the backend installed.
// The pure-logic describes in this file are deliberately left outside the
// skip so the file always asserts something.

async function bootEngine(): Promise<HybridAgentEngine> {
  root = await mkdtemp(join(tmpdir(), "haf-inspect-"));
  engine = new HybridAgentEngine({
    homePath: root,
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
  } as never);
  await engine.initialize();
  // `risk: "process"` is scored high severity by the policy engine, so a call
  // goes through approval. With a mock model the default reviewer never
  // resolves and execute() hangs forever — measured, and the reason this is
  // here. Binding an approving reviewer is what a configured deployment does.
  engine.approvals.bindReviewer(async () => ({
    autoApproved: true,
    rationale: "integration test: the harness runs a local task file",
  }));
  return engine;
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
  engine = undefined;
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

async function run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const booted = engine ?? (await bootEngine());
  return (await booted.capabilities.execute(
    EVAL_INSPECT_CAPABILITY_ID,
    input,
    context(),
  )) as Record<string, unknown>;
}

describe("the manifest passes its own gate, and states what it cannot do", () => {
  it("is complete, MIT, and pinned", () => {
    expect(assessManifest(EVAL_INSPECT_MANIFEST).complete).toBe(true);
    expect(EVAL_INSPECT_MANIFEST.provenance.license).toBe("MIT");
    expect(EVAL_INSPECT_MANIFEST.provenance.commit).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("declares process risk, because running a task runs its Python", () => {
    expect(EVAL_INSPECT_MANIFEST.limitations.some((l) => l.includes("executes the Python"))).toBe(true);
  });

  it("explains why networkPolicy 'none' is true, and what would break it", () => {
    const limitation = EVAL_INSPECT_MANIFEST.limitations.find((l) => l.includes("credentials"));
    expect(limitation).toBeDefined();
    expect(limitation).toContain("stop being true");
  });

  it("says a mock-model score measures the harness, not Aurora", () => {
    expect(
      EVAL_INSPECT_MANIFEST.limitations.some((l) => l.includes("not whether Aurora is good")),
    ).toBe(true);
    expect(INSPECT_OFFLINE_MODEL).toBe("mockllm/model");
  });
});

describe.skipIf(!INSPECT.ok)("a real Inspect task runs and returns scored results", () => {
  it("is registered with its manifest", async () => {
    const booted = await bootEngine();

    expect(booted.capabilities.list().some((c) => c.id === EVAL_INSPECT_CAPABILITY_ID)).toBe(true);
    expect(engine!.capabilities.manifestFor(EVAL_INSPECT_CAPABILITY_ID)?.provenance.license).toBe(
      "MIT",
    );
  }, 120_000);

  it("runs the fixture task and returns per-scorer metrics and per-sample grades", async () => {
    await bootEngine();
    await copyFile(FIXTURE_TASK, join(root!, "task.py"));

    const out = await run({ taskFile: "task.py", limit: 2 });

    expect(out.status).toBe("executed");
    expect(out.ran).toBe(true);
    expect(out.task).toBe("arithmetic");
    expect(out.model).toBe(INSPECT_OFFLINE_MODEL);
    expect(out.sampleCount).toBe(2);

    const scores = out.scores as Array<{ scorer: string; metrics: Record<string, unknown> }>;
    const names = scores.map((s) => s.scorer).sort();
    expect(names).toEqual(["includes", "match"]);
    for (const score of scores) {
      expect(typeof score.metrics.accuracy).toBe("number");
    }

    const samples = out.samples as Array<{ id: string; scores: Record<string, unknown> }>;
    expect(samples).toHaveLength(2);
    expect(samples[0]!.scores.match).toBe("I");

    // The run really reached a model — the mock one, but a model.
    const usage = out.modelUsage as Record<string, { totalTokens: number }>;
    expect(usage[INSPECT_OFFLINE_MODEL]!.totalTokens).toBeGreaterThan(0);
  }, 300_000);

  it("reports accuracy 0.0 under the mock model, and does not hide it", async () => {
    await bootEngine();
    await copyFile(FIXTURE_TASK, join(root!, "task.py"));

    const out = await run({ taskFile: "task.py" });
    const scores = out.scores as Array<{ scorer: string; metrics: Record<string, unknown> }>;

    // Measured: the mock model's canned replies do not match the targets, so a
    // working harness scores zero. Asserting this pins the honest behaviour —
    // if a future change quietly made a zero score look like a failure, or
    // quietly inflated it, this test fails.
    for (const score of scores) {
      expect(score.metrics.accuracy).toBe(0);
    }
    expect(out.status).toBe("executed");
  }, 300_000);
});

describe.skipIf(!INSPECT.ok)("the verifier judges the run, never the score", () => {
  it("passes on accuracy 0.0, because that is a measurement and not a failure", async () => {
    await bootEngine();
    await copyFile(FIXTURE_TASK, join(root!, "task.py"));

    // If the verifier had failed on a zero score, execute() would have thrown
    // rather than returning the result.
    const out = await run({ taskFile: "task.py" });

    expect(out.status).toBe("executed");
    expect(out.runError).toBeUndefined();
  }, 300_000);
});

describe.skipIf(!INSPECT.ok)("the task file stays inside the workspace, and bad input is reported", () => {
  it("refuses a task file outside the workspace", async () => {
    await bootEngine();

    const out = await run({ taskFile: "../../etc/passwd" });

    expect(out.ran).toBe(false);
    expect(String(out.reason)).toContain("escapes the workspace");
  }, 120_000);

  it("reports a missing task file as a failure with a reason, not a crash", async () => {
    await bootEngine();

    const out = await run({ taskFile: "does-not-exist.py" });

    expect(out.ran).toBe(false);
    expect(String(out.reason)).toContain("no such task file");
  }, 120_000);

  it("reports a file that defines no task", async () => {
    await bootEngine();
    await writeFile(join(root!, "notask.py"), "x = 1\n");

    const out = await run({ taskFile: "notask.py" });

    expect(out.ran).toBe(false);
    expect(String(out.reason)).toMatch(/No inspect tasks|no task was found/i);
  }, 180_000);

  it("reports a task that raises while running", async () => {
    await bootEngine();
    await writeFile(
      join(root!, "broken.py"),
      [
        "from inspect_ai import Task, task",
        "",
        "@task",
        "def broken():",
        '    raise RuntimeError("the task itself failed")',
        "",
      ].join("\n"),
    );

    const out = await run({ taskFile: "broken.py" });

    expect(out.ran).toBe(false);
    expect(String(out.reason)).toContain("the task itself failed");
  }, 180_000);

  it("lets the policy engine stop a shell-shaped model name before anything spawns", async () => {
    await bootEngine();
    await copyFile(FIXTURE_TASK, join(root!, "task.py"));

    // Written expecting the worker's own model-name check to catch this. It
    // never gets the chance: the PolicyEngine classifies `rm -rf /` as critical
    // and blocks the call outright, so no subprocess is spawned. That is a
    // stronger result than the one the test was written for, and it is the one
    // asserted here.
    await expect(run({ taskFile: "task.py", model: "mock; rm -rf /" })).rejects.toThrow(
      /blocked by policy|critical/i,
    );
  }, 180_000);

  it("the worker's own model-name check rejects malformed names the policy allows", async () => {
    await bootEngine();
    await copyFile(FIXTURE_TASK, join(root!, "task.py"));

    // A space is not shell-shaped, so the policy engine passes it and the
    // worker's regex is what refuses it. Both layers exist; this one is the
    // only test that actually reaches the second.
    const out = await run({ taskFile: "task.py", model: "mock model with spaces" });

    expect(out.ran).toBe(false);
    expect(String(out.reason)).toContain("not a valid Inspect model reference");
  }, 180_000);
});
