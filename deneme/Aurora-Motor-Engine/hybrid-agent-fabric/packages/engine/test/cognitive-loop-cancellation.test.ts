/**
 * §12 exit checklist: "Retry loops terminate; cancellation and resume work."
 *
 * Measured before changing anything: the loops *do* terminate — `model-router` is
 * bounded by its candidate list, `session-lease` by `attempt < 2`, `mcp-manager` by
 * `maxRetries: 3`, and `UnifiedCognitiveLoop.handleFailure` by `maxRetries` with the
 * counter reset at the top of `execute`, so it does not leak between runs either. So
 * the "terminate" half already held.
 *
 * The cancellation half did not. The retry loop had no signal and no check anywhere —
 * the only occurrence of "cancel" in the file was a mode-name mapping — and it slept
 * between attempts on a timer nothing could interrupt. So a task the caller had given
 * up on kept re-running the controller and kept sleeping. Because the loop is bounded
 * this never looked like a hang; it looked like a run that took longer than it should
 * and then failed.
 *
 * These cases assert the behaviour that was missing: cancelling during a retry stops
 * the loop promptly rather than after the remaining sleeps, and the reason is recorded
 * against the run rather than being swallowed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedCognitiveLoop } from "../src/aurora/unified-cognitive-loop.js";

/** A meta controller that always fails, so recovery keeps retrying. */
function failingController() {
  return {
    run: vi.fn(async () => {
      throw new Error("the run failed on purpose");
    }),
  };
}

/**
 * Subsystem executors. A proxy that answers every property with an empty array-backed
 * stub, because the loop reads several of them and naming them by hand would keep
 * breaking these cases for reasons that have nothing to do with cancellation.
 */
const executors = new Proxy({} as Record<string, unknown>, {
  get: () => ({ run: async () => undefined, length: 0 }),
}) as never;

/**
 * The loop takes four collaborators. Only the meta controller matters here — the rest
 * are stubbed because the constructor requires them, and the point of these cases is
 * the retry loop, not the collaborators.
 */
function buildLoop() {
  const controller = failingController();
  // A permissive stub rather than a hand-written one. Naming the methods the loop
  // happens to call turns each new call site into a test failure that says nothing
  // about cancellation, which is the only thing these cases are about.
  const permissive = (): unknown =>
    new Proxy({} as Record<string, unknown>, {
      get: () => () => undefined,
    });
  const cognitiveState = permissive();
  // The loop pushes whatever `eventBus.emit` returns into `eventsEmitted`, so a stub
  // that returns undefined fills that array with undefineds and the case that checks
  // the cancellation reason has nothing to read. This one echoes a real event.
  const eventBus = {
    emit: (type: string, source: string, payload: Record<string, unknown>) => ({ type, source, payload }),
  };
  const loop = new UnifiedCognitiveLoop(
    controller as never,
    cognitiveState as never,
    eventBus as never,
  );
  return { loop, controller };
}

describe("the cognitive loop's retry cancellation", () => {
  let loop: UnifiedCognitiveLoop;
  let controller: ReturnType<typeof failingController>;

  beforeEach(() => {
    ({ loop, controller } = buildLoop());
  });

  it("stops retrying when the run is cancelled, instead of sleeping out the retries", async () => {
    const controller2 = new AbortController();
    const startedAt = Date.now();
    const run = loop.execute("tenant", "do the thing", executors, controller2.signal);
    // Cancel once recovery is under way. Without an interruptible sleep this loop
    // would still have to sit out its backoff timers.
    setTimeout(() => controller2.abort(new Error("the caller gave up")), 20);
    const result = await run as unknown as Record<string, unknown>;

    const elapsed = Date.now() - startedAt;
    expect(controller.run).toHaveBeenCalled();
    // With maxRetries 3 the backoff alone would be about 1 + 2 + 3 seconds. A
    // cancelled run has to come back well inside that — and it does, in tens of
    // milliseconds, which is the actual evidence that the sleep was interrupted.
    expect(elapsed).toBeLessThan(2500);
    // `execute` wraps the run result, so the flag lives one level down. Reading it
    // off the outer object returned undefined and made a working cancellation look
    // broken; the outer shape is `{ runResult, cognitiveStateHistory, ... }`.
    const runResult = result.runResult as Record<string, unknown>;
    expect(runResult.recoveryCancelled).toBe(true);
    expect(runResult.outcome).toBe("failure");
  });

  it("records why it stopped, against this run, rather than swallowing it", async () => {
    const aborter = new AbortController();
    const run = loop.execute("tenant", "do the thing", executors, aborter.signal);
    aborter.abort(new Error("the caller gave up"));
    const result = await run as unknown as Record<string, unknown>;

    expect((result.runResult as Record<string, unknown>).recoveryCancelled).toBe(true);
    const events = (loop as unknown as { eventsEmitted: Array<Record<string, unknown>> }).eventsEmitted;
    const cancelled = events.find((event) => event?.type === "task.recovery.cancelled");
    expect(cancelled).toBeDefined();
    expect(JSON.stringify(cancelled)).toContain("the caller gave up");
  });

  // The full backoff is 1 + 2 + 3 seconds, so this case legitimately outlasts
  // vitest's default 5s. That is the behaviour being asserted, not a hang.
  it("does not cancel a run that was never cancelled", { timeout: 20000 }, async () => {
    const result = await loop.execute("tenant", "do the thing", executors) as unknown as Record<string, unknown>;
    expect((result.runResult as Record<string, unknown>).recoveryCancelled).toBeUndefined();
    // And it still terminated on its own — the "terminate" half of the checklist item.
    expect(controller.run).toHaveBeenCalledTimes(4); // 1 original + 3 retries
  });
});
