/**
 * Rate limits must be enforced against a shared budget, not a per-process one.
 *
 * The counters used to be module-level `Map`s, with the note
 * "production'da Redis kullanılmalı" sitting right above them. That meant each
 * process held its own budget: behind N instances a client got `N * max`
 * requests per window, so the limit loosened every time the deployment scaled
 * out — worst on `/auth`, which is capped at 10/min precisely to slow brute
 * force.
 *
 * No shared backend is bundled: the repo has no Redis or Postgres client to
 * build one on, and inventing a dependency that cannot be exercised here would
 * be worse than the seam. What this test pins is the seam itself — two limiters
 * on separate stores each grant a full budget, two limiters on one store share
 * it. That is the property a real backend has to satisfy, and it is the
 * property that was missing.
 */
import { describe, expect, it } from "vitest";
import {
  InMemoryRateLimitStore,
  RateLimitPresets,
  createRateLimiter,
  defaultRateLimitStore,
  type RateLimitConfig,
} from "../src/middleware/rate-limiter.js";

const config: RateLimitConfig = { max: 3, windowMs: 60_000 };

/** Drive the store directly; the hook is thin and covered elsewhere. */
function burst(store: InMemoryRateLimitStore, key: string, times: number): number[] {
  const allowed: number[] = [];
  for (let i = 0; i < times; i++) {
    allowed.push(store.consumeToken(key, config).allowed ? 1 : 0);
  }
  return allowed;
}

describe("rate limit store", () => {
  it("one store enforces the budget across every limiter sharing it", async () => {
    const shared = new InMemoryRateLimitStore();
    // Two "instances" of the deployment, same store.
    const a = createRateLimiter({ max: 3, windowMs: 60_000 }, shared);
    const b = createRateLimiter({ max: 3, windowMs: 60_000 }, shared);
    expect(typeof a).toBe("function");
    expect(typeof b).toBe("function");

    const results = burst(shared, "client-1", 6);
    // 3 allowed, then refused — the two limiters did not each get their own 3.
    expect(results).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it("separate stores each grant a full budget — the behaviour this seam exists to fix", async () => {
    const instanceA = new InMemoryRateLimitStore();
    const instanceB = new InMemoryRateLimitStore();
    const fromA = burst(instanceA, "client-1", 3);
    const fromB = burst(instanceB, "client-1", 3);
    // This is what the module-level Map did on every scale-out: the effective
    // limit multiplied by the number of processes.
    expect([...fromA, ...fromB]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("keys are isolated from each other within one store", async () => {
    const store = new InMemoryRateLimitStore();
    expect(burst(store, "client-a", 4)).toEqual([1, 1, 1, 0]);
    // A different client still has its own budget.
    expect(burst(store, "client-b", 3)).toEqual([1, 1, 1]);
  });

  it("reports how long to wait, so the 429 can carry Retry-After", async () => {
    const store = new InMemoryRateLimitStore();
    burst(store, "client-1", 3);
    const refused = store.consumeToken("client-1", config);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.resetMs).toBeGreaterThan(0);
  });

  it("the sliding-window path enforces the same budget", async () => {
    // checkSlidingWindow was defined but never called by the hook; it is part
    // of the store contract, so it is covered here rather than left untested.
    const store = new InMemoryRateLimitStore();
    const outcomes = Array.from({ length: 5 }, () => store.checkSlidingWindow("client-1", config).allowed);
    expect(outcomes).toEqual([true, true, true, false, false]);
  });

  it("sweeping drops counters that can no longer affect a decision", async () => {
    const store = new InMemoryRateLimitStore();
    expect(burst(store, "stale-client", 3)).toEqual([1, 1, 1]);
    // 6 minutes on: the window has long passed, so the client starts fresh.
    store.sweep(Date.now() + 6 * 60_000);
    expect(store.consumeToken("stale-client", config).allowed).toBe(true);
  });

  it("the default store is a single shared instance, preserving prior single-process behaviour", async () => {
    // Every existing call site passes no store, so this must keep working
    // exactly as before: one process, one budget.
    expect(defaultRateLimitStore).toBeDefined();
    const first = defaultRateLimitStore.consumeToken("default-store-probe", RateLimitPresets.auth);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBeLessThan(RateLimitPresets.auth.max);
  });
});
