/**
 * P1.2: the selected model route must reach the model calls that actually happen.
 *
 * `GoalUnderstandingService.understand` and `PlanningEngine.plan` have both
 * accepted `modelRoute` for a long time, and everything below them threads it
 * through. The two call sites in `engine.ts` simply never passed it, so the
 * router picked a route and goal understanding plus decomposition ran on
 * whatever default the provider happened to use.
 *
 * This test drives the real engine (`execute`) and records what the two calls
 * received. Stubbing the loop's `understandGoal` dependency would not prove
 * anything here: the defect is in the engine's wiring of that dependency, so
 * only a call through the engine can observe it.
 *
 * Scope, measured rather than assumed: passing `modelRoute` alone was NOT
 * enough. `understandGoal` runs at unified-execution-loop.ts:684 and `plan` at
 * :909, but `selectModel` — the dep that assigns `context.modelRoute` — is only
 * called at :1120, after both. So on the adaptive-routing path the route does
 * not exist yet when these calls happen. The engine therefore also has to hand
 * the caller's route to the loop up front, which is what
 * unified-execution-loop.ts:654 was built to apply. The router still refines
 * the choice later in the run; this makes the earlier calls honour it too.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HybridAgentEngine } from "../src/engine.js";

const engines: HybridAgentEngine[] = [];
afterEach(async () => await Promise.all(engines.splice(0).map((engine) => engine.shutdown())));

async function makeEngine() {
  const engine = new HybridAgentEngine({
    homePath: await mkdtemp(join(tmpdir(), "haf-p12-route-")),
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
  });
  engines.push(engine);
  return engine;
}

describe("the selected route reaches goal understanding and planning", () => {
  it("passes the context's current modelRoute to understand() and plan()", async () => {
    const engine = await makeEngine();

    const seenByUnderstand: Array<{ modelRoute: string | undefined; sessionId: string | undefined }> = [];
    const seenByPlan: Array<{ modelRoute: string | undefined; sessionId: string | undefined }> = [];

    const originalUnderstand = engine.goalUnderstanding.understand.bind(engine.goalUnderstanding);
    const originalPlan = engine.planningEngine.plan.bind(engine.planningEngine);

    engine.goalUnderstanding.understand = async (request) => {
      seenByUnderstand.push({ modelRoute: request.modelRoute, sessionId: request.sessionId });
      return originalUnderstand(request);
    };
    engine.planningEngine.plan = async (request) => {
      seenByPlan.push({ modelRoute: request.modelRoute, sessionId: request.sessionId });
      return originalPlan(request);
    };

    await engine.execute({
      tenantId: "local",
      goal: "Create hello.txt containing Hi so the verifier can check it.",
      maxAttempts: 1,
      modelRoute: "mock:mock-model",
    });

    // The point of the test: the calls happened, and they were not called with
    // an empty request. If the engine never reaches them the arrays stay empty
    // and the assertions below fail rather than passing vacuously.
    expect(seenByUnderstand.length, "understand() was never called").toBeGreaterThan(0);
    expect(seenByPlan.length, "plan() was never called").toBeGreaterThan(0);

    for (const call of [...seenByUnderstand, ...seenByPlan]) {
      expect(
        call.modelRoute,
        "the call reached the model without a route, so it ran on the provider default",
      ).toBeDefined();
      expect(call.modelRoute).toMatch(/^[a-z0-9][a-z0-9-]*:.+$/i);
    }
  });
});
