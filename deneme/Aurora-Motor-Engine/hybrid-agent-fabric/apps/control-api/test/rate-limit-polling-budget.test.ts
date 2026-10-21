/**
 * A client that polls on a timer must not spend the budget a person needs.
 *
 * An audit measured an approval-polling client consuming most of the single
 * global 100 req/min budget, so the interactive calls it was polling *for* were
 * the ones that got 429. `RateLimitPresets` defined six budgets and nothing
 * assigned any of them: `registerRateLimiting` installed one global hook.
 *
 * The polled endpoints get their own bucket with their own ceiling. They are
 * deliberately not exempted — removing the control is not the same as moving it.
 */
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { InMemoryRateLimitStore, RateLimitPresets, registerRateLimiting } from "../src/middleware/rate-limiter.js";

async function buildApp(store: InMemoryRateLimitStore) {
  const app = Fastify({ logger: false });
  await registerRateLimiting(app, { store });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/v1/approvals", async () => ({ approvals: [] }));
  app.get("/v1/sessions/:sessionId/instructions", async () => ({ instructions: "" }));
  app.post("/v1/approvals/:approvalId/resolve", async () => ({ resolved: true }));
  return app;
}

describe("polled endpoints have their own budget", () => {
  it("leaves the general budget intact after a client polls past it", async () => {
    const store = new InMemoryRateLimitStore();
    const app = await buildApp(store);
    try {
      // More polls than the general budget allows in a window.
      const polls = RateLimitPresets.general.max + 20;
      for (let index = 0; index < polls; index += 1) {
        await app.inject({ method: "GET", url: "/v1/approvals" });
      }

      // The interactive call must still be served. Before the separation this was
      // the request that got 429, because the polling had already spent the
      // budget it was polling on behalf of.
      const interactive = await app.inject({
        method: "POST",
        url: "/v1/approvals/appr-1/resolve",
      });
      expect(interactive.statusCode).toBe(200);

      const read = await app.inject({ method: "GET", url: "/v1/sessions/sess-1/instructions" });
      expect(read.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("still bounds the polled endpoints rather than exempting them", async () => {
    const store = new InMemoryRateLimitStore();
    const app = await buildApp(store);
    try {
      let limited = 0;
      for (let index = 0; index < RateLimitPresets.polling.max + 10; index += 1) {
        const response = await app.inject({ method: "GET", url: "/health" });
        if (response.statusCode === 429) limited += 1;
      }
      // Unlimited polling would be a worse control than the one being replaced.
      expect(limited).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it("keeps the two buckets from sharing a counter", async () => {
    const store = new InMemoryRateLimitStore();
    const app = await buildApp(store);
    try {
      // Fill the general budget with interactive calls, then confirm a poll still
      // succeeds. If both hooks resolved to the same client-IP key they would
      // share one bucket and this would be 429.
      for (let index = 0; index < RateLimitPresets.general.max; index += 1) {
        await app.inject({ method: "POST", url: "/v1/approvals/appr-1/resolve" });
      }
      const blocked = await app.inject({ method: "POST", url: "/v1/approvals/appr-1/resolve" });
      expect(blocked.statusCode).toBe(429);

      const poll = await app.inject({ method: "GET", url: "/health" });
      expect(poll.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
