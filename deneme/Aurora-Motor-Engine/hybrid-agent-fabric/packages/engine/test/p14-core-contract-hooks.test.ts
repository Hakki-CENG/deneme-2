/**
 * P1.4: Memory, Planning, Verification, Routing, Execution and Recovery are the
 * production contract, not optional extras.
 *
 * The loop keeps them optional as a *type* — a unit test has every right to
 * build a loop with one dependency — but a production run must supply them, and
 * an ablation study that removes one has to say so out loud.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HybridAgentEngine } from "../src/engine.js";
import {
  ABLATION_FLAGS,
  CORE_CONTRACT_HOOKS,
  ablateExecutionDependencies,
  type ExecutionDependencies,
} from "../src/execution/unified-execution-loop.js";

const engines: HybridAgentEngine[] = [];
afterEach(async () => await Promise.all(engines.splice(0).map((engine) => engine.shutdown())));

function fullDeps(): ExecutionDependencies {
  return {
    runAgent: async () => ({ completed: true, summary: "done" }),
    recall: async () => [],
    plan: async () => [],
    verifiersFor: async () => [],
    selectModel: async () => ({ selectedModel: "mock:mock-model", reason: "test", registeredProviders: 1 }),
  } as unknown as ExecutionDependencies;
}

describe("ablation cannot silently strip the contract", () => {
  it("names the core hooks it covers", () => {
    expect([...CORE_CONTRACT_HOOKS]).toEqual(["recall", "plan", "verifiersFor", "selectModel"]);
  });

  it("refuses a core ablation unless the caller opts in", () => {
    for (const flag of ["memory", "planning", "verification", "adaptive-routing"]) {
      expect(() => ablateExecutionDependencies(fullDeps(), [flag]), flag).toThrow(/core contract hook/);
    }
  });

  it("allows it when an experiment asks explicitly", () => {
    const deps = ablateExecutionDependencies(fullDeps(), ["memory", "planning"], { allowCoreAblation: true });
    expect((deps as Record<string, unknown>).recall).toBeUndefined();
    expect((deps as Record<string, unknown>).plan).toBeUndefined();
    // Untouched hooks survive.
    expect((deps as Record<string, unknown>).verifiersFor).toBeDefined();
  });

  it("still permits non-core ablations with no opt-in", () => {
    // World model, cognitive core and self-improvement are extensions by P1.4's
    // own list, so ablating them is not a contract breach.
    const deps = ablateExecutionDependencies(fullDeps(), ["world-model", "cognitive-core", "self-improvement"]);
    expect((deps as Record<string, unknown>).recall).toBeDefined();
  });

  it("documents which flags touch the contract", () => {
    const touching = Object.entries(ABLATION_FLAGS)
      .filter(([, keys]) => keys.some((k) => (CORE_CONTRACT_HOOKS as readonly string[]).includes(k)))
      .map(([flag]) => flag)
      .sort();
    expect(touching).toEqual(["adaptive-routing", "memory", "planning", "verification"]);
  });

  it("rejects an unknown flag as before", () => {
    expect(() => ablateExecutionDependencies(fullDeps(), ["teleport"])).toThrow(/Unknown ablation flag/);
  });
});

describe("the production wiring supplies the contract", () => {
  it("runs understand, recall, plan, execute, observe and verify on a real engine task", async () => {
    const engine = new HybridAgentEngine({
      homePath: await mkdtemp(join(tmpdir(), "haf-p14-")),
      kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
      sandboxBackend: "local",
      model: { provider: "mock" },
    });
    engines.push(engine);

    const report = await engine.execute({
      tenantId: "local",
      goal: "Create hello.txt containing Hi so a verifier can check it.",
      maxAttempts: 1,
    });

    // These six must be present on a plain production run with no dependencies
    // supplied by the caller — that is what "default contract" means.
    for (const stage of ["understand", "recall", "plan", "execute", "observe", "verify"]) {
      expect(report.contract.performed, `production run missing ${stage}`).toContain(stage);
    }
  });

  it("runs the routing hook, and says so when no runnable model exists", async () => {
    const engine = new HybridAgentEngine({
      homePath: await mkdtemp(join(tmpdir(), "haf-p14-route-")),
      kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
      sandboxBackend: "local",
      model: { provider: "mock" },
    });
    engines.push(engine);

    const report = await engine.execute({
      tenantId: "local",
      goal: "Create hello.txt containing Hi so a verifier can check it.",
      maxAttempts: 1,
    });

    // `route` is deliberately NOT in the list above. In this environment no
    // provider is registered with a model, so the router has nothing to select
    // and `context.modelRoute` stays unset — which is honest, not a failure of
    // the hook. What must hold is that the hook RAN and the report says why no
    // route was applied, rather than silently implying one was.
    const routing = report.observations.find((o) => /selected for task type/i.test(o.summary));
    expect(routing, "the routing hook never ran").toBeDefined();
    if (!report.contract.performed.includes("route")) {
      expect(routing!.summary).toMatch(/no runnable model/i);
    }
  });

  it("refuses to ablate verification without the opt-in flag", async () => {
    const engine = new HybridAgentEngine({
      homePath: await mkdtemp(join(tmpdir(), "haf-p14-abl-")),
      kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
      sandboxBackend: "local",
      model: { provider: "mock" },
      ablations: ["verification"],
    });
    engines.push(engine);

    await expect(
      engine.execute({ tenantId: "local", goal: "Do something.", maxAttempts: 1 }),
    ).rejects.toThrow(/core contract hook/);
  });
});
