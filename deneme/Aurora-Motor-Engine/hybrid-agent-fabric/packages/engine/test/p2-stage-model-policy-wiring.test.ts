/**
 * P2: the stage policy must actually reach the model calls.
 *
 * A policy module with unit tests proves the resolver works; it does not prove
 * anything is wired to it. P1.2 was exactly that mistake in reverse — the
 * argument was passed but nothing upstream ever set it. So this drives the real
 * engine and records what `understand()` and `plan()` received.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HybridAgentEngine } from "../src/engine.js";

const engines: HybridAgentEngine[] = [];
afterEach(async () => await Promise.all(engines.splice(0).map((engine) => engine.shutdown())));

describe("the stage policy reaches understanding and planning", () => {
  it("routes each stage to the model the policy names", async () => {
    const engine = new HybridAgentEngine({
      homePath: await mkdtemp(join(tmpdir(), "haf-p2-policy-")),
      kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
      sandboxBackend: "local",
      model: { provider: "mock" },
      stageModelPolicy: {
        stages: {
          understanding: { route: "ollama:understanding-model" },
          planning: { route: "aws-bedrock:planning-model" },
        },
      },
    });
    engines.push(engine);

    const seen: Array<{ stage: string; modelRoute: string | undefined }> = [];
    const originalUnderstand = engine.goalUnderstanding.understand.bind(engine.goalUnderstanding);
    const originalPlan = engine.planningEngine.plan.bind(engine.planningEngine);
    engine.goalUnderstanding.understand = async (request) => {
      seen.push({ stage: "understanding", modelRoute: request.modelRoute });
      return originalUnderstand(request);
    };
    engine.planningEngine.plan = async (request) => {
      seen.push({ stage: "planning", modelRoute: request.modelRoute });
      return originalPlan(request);
    };

    await engine.execute({
      tenantId: "local",
      goal: "Create hello.txt containing Hi so a verifier can check it.",
      maxAttempts: 1,
    });

    const understanding = seen.filter((entry) => entry.stage === "understanding");
    const planning = seen.filter((entry) => entry.stage === "planning");
    expect(understanding.length, "understand() was never called").toBeGreaterThan(0);
    expect(planning.length, "plan() was never called").toBeGreaterThan(0);

    for (const entry of understanding) expect(entry.modelRoute).toBe("ollama:understanding-model");
    for (const entry of planning) expect(entry.modelRoute).toBe("aws-bedrock:planning-model");
  });

  it("leaves the task's own route alone when the policy names no stage", async () => {
    const engine = new HybridAgentEngine({
      homePath: await mkdtemp(join(tmpdir(), "haf-p2-nopolicy-")),
      kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
      sandboxBackend: "local",
      model: { provider: "mock" },
    });
    engines.push(engine);

    const seen: Array<string | undefined> = [];
    const originalUnderstand = engine.goalUnderstanding.understand.bind(engine.goalUnderstanding);
    engine.goalUnderstanding.understand = async (request) => {
      seen.push(request.modelRoute);
      return originalUnderstand(request);
    };

    await engine.execute({
      tenantId: "local",
      goal: "Create hello.txt containing Hi.",
      maxAttempts: 1,
      modelRoute: "mock:caller-route",
    });

    expect(seen.length).toBeGreaterThan(0);
    // No policy, so the caller's route survives instead of being overwritten.
    for (const route of seen) expect(route).toBe("mock:caller-route");
  });
});
