/**
 * Tenant isolation: the guard's resolution must be authoritative, not advisory.
 *
 * What was measured before this change:
 *   - `resolveTenantId` resolves a path-scoped resource's tenant from the
 *     stored record for exactly 5 route families.
 *   - Every other route took the tenant from the caller: `x-haf-tenant`, then
 *     `body.tenantId`, then `query.tenantId`. Measured: **74** such reads across
 *     `main.ts` + `routes/*.ts`.
 *   - `registerAuthGuards` returned only `identity` and `webSession`. The
 *     resolved tenant was **not** exposed, and **0** handlers used it.
 *
 * So the role check and the data access were decoupled: the guard could
 * authorize against the tenant a record really belongs to while the handler
 * acted on whichever tenant the caller named. Declaring a conflicting tenant
 * was accepted silently.
 *
 * Two things are pinned here:
 *   1. A caller-declared tenant that disagrees with the record's tenant is
 *      rejected (HAF-1010) instead of being silently ignored.
 *   2. The resolved tenant is exposed as `authState.tenant(request)`, so
 *      handlers can migrate off `body.tenantId`. The ratchet at the bottom
 *      stops the count of caller-supplied reads from ever growing.
 */
import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import type { HybridAgentEngine } from "@haf/engine";
import { registerAuthGuards, type AuthRequestState } from "../src/auth/auth-guards.js";
import { IdentityService, type Identity } from "../src/auth/identity-service.js";
import { ErrorCodes, registerErrorHandler } from "../src/middleware/error-handler.js";

const COOKIE = "haf_session";
const HERE = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(HERE, "..");

/** Only the tenant-resolution lookups are stubbed; the guards under test are real. */
function engineFor(resourceTenant: string): HybridAgentEngine {
  return {
    session: async () => ({ tenantId: resourceTenant }),
    automations: { get: async () => ({ tenantId: resourceTenant }) },
    learning: { get: async () => ({ tenantId: resourceTenant }) },
    refinements: { get: async () => ({ tenantId: resourceTenant }) },
    agentProfiles: { get: async () => ({ tenantId: resourceTenant }) },
    // Families added after the tenant-blind audit. Each returns the record's
    // tenant so the guard can authorize against it; `undefined` stands for "no
    // such record", which must become a 404 rather than a silent pass-through.
    agentEconomy: { tradeById: async () => ({ id: "t1", tenantId: resourceTenant }) },
    learningRollouts: { get: async () => ({ id: "r1", tenantId: resourceTenant }) },
    connectors: { getConnector: async () => ({ id: "c1", tenantId: resourceTenant }) },
    computerUse: { getTask: async () => ({ id: "k1", tenantId: resourceTenant }) },
    codePipeline: { getPipelineRun: async () => ({ id: "p1", tenantId: resourceTenant }) },
    // Aurora services expose only tenant-scoped list methods, so each grew a
    // read-only `tenantOf(id)` for the guard to ask "whose record is this?".
    plannerV2: { tenantOf: async () => resourceTenant },
    experimentEngine: { tenantOf: async () => resourceTenant },
    multiHypothesis: { tenantOf: async () => resourceTenant },
    swarmOrchestration: { tenantOf: async () => resourceTenant },
    counterfactualSimulator: { tenantOf: async () => resourceTenant },
    sharedLearning: { tenantOf: async () => resourceTenant },
    goalStack: { tenantOf: async () => resourceTenant },
    // Operator-reachable mutations on tenant-owned records.
    approvals: { tenantOf: async () => resourceTenant },
    memory: { tenantOf: async () => resourceTenant },
    scheduler: { tenantOf: async () => resourceTenant },
    researchEngine: { tenantOf: async () => resourceTenant },
    // Read paths: the record carries the tenant even though the lookup is by id.
    userQuestions: { tenantOf: async () => resourceTenant },
    agentSDK: { tenantOf: async () => resourceTenant },
    cognitiveState: { snapshotForTask: () => ({ tenantId: resourceTenant }) },
  } as unknown as HybridAgentEngine;
}

const adminLocal: Identity = {
  subject: "ad",
  authType: "oidc",
  systemAdmin: false,
  tenants: { local: "admin" },
};

async function appFor(resourceTenant: string, identity: Identity) {
  const sessionFile = join(await mkdtemp(join(tmpdir(), "haf-tenant-")), "sessions.enc");
  const identityService = new IdentityService({
    sessionFile,
    sessionSecret: "test-secret",
    authDisabled: false,
    defaultTenant: "local",
  });
  const session = await identityService.createSession(identity);

  const app = Fastify({ logger: false });
  await app.register(cookie);
  await registerErrorHandler(app);
  const state: AuthRequestState = registerAuthGuards(app, {
    identityService,
    cookieName: COOKIE,
    engine: engineFor(resourceTenant),
    oidcConfigured: false,
  });

  // The handler reports which tenant the guard authorized, so the test can see
  // whether the resolution reached the handler at all.
  app.get("/v1/sessions/:id", async (request) => ({
    ok: true,
    tenantFromGuard: state.tenant(request),
  }));
  app.post("/v1/sessions/:id/message", async (request) => ({
    ok: true,
    tenantFromGuard: state.tenant(request),
  }));
  // One route per newly covered family. The bodies are irrelevant: the guard
  // must reject a conflicting declaration before any handler runs.
  for (const path of NEW_FAMILIES.map((f) => f.route)) {
    app.post(path, async (request) => ({ ok: true, tenantFromGuard: state.tenant(request) }));
    app.get(path, async (request) => ({ ok: true, tenantFromGuard: state.tenant(request) }));
  }
  return { app, session, csrf: session.csrfToken };
}

/**
 * Families whose tenant the guard resolves from the stored record, added after
 * an audit found 71 `/:id` routes that were tenant-blind. Every one of these
 * stores `tenantId` on the record and previously reached an id-only engine
 * accessor, so the role check ran against the caller's declared tenant while
 * the handler acted on a record that could belong to anyone.
 */
const NEW_FAMILIES = [
  { name: "agent trade acceptance (moves balances)", route: "/v1/economy/trade/t1/accept" },
  { name: "learning release signing", route: "/v1/learning/releases/r1/sign" },
  { name: "learning release rollback", route: "/v1/learning/releases/r1/rollback" },
  { name: "connector email send", route: "/v1/connectors/c1/email/send" },
  { name: "connector sync", route: "/v1/connectors/c1/sync" },
  { name: "computer-use task execution", route: "/v1/computer-use/tasks/k1/execute" },
  { name: "code pipeline rollback", route: "/v1/pipeline/p1/rollback" },
  { name: "plan activation", route: "/v1/planner-v2/x1/activate" },
  { name: "experiment start", route: "/v1/experiments/x1/start" },
  { name: "hypothesis testing", route: "/v1/multi-hypothesis/x1/start-testing" },
  { name: "swarm member add", route: "/v1/swarm/x1/member" },
  { name: "simulation scenario add", route: "/v1/simulations/x1/scenarios" },
  { name: "shared lesson adoption", route: "/v1/shared-learning/x1/adopt" },
  { name: "goal progress update", route: "/v1/goal-stack/x1/progress" },
  { name: "approval resolution", route: "/v1/approvals/x1/resolve" },
  { name: "memory promotion", route: "/v1/memories/x1/promote" },
  { name: "schedule status change", route: "/v1/schedules/x1/status" },
  { name: "research report generation", route: "/v1/research/x1/report" },
  { name: "question answering", route: "/v1/questions/x1/answer" },
  { name: "SDK extension read", route: "/v1/sdk/extensions/x1" },
  { name: "cognitive task snapshot read", route: "/v1/cognitive-state/tasks/x1" },
];

describe("the research family's non-id siblings are untouched", () => {
  // The guard regex is anchored to `/report` on purpose. A bare
  // `/v1/research/([^/?]+)` prefix would read `reports` and `verify-source` as
  // ids, look them up, find nothing, and 404 both routes.
  const GUARD = /^\/v1\/research\/([^/?]+)\/report/;
  it("matches only the report route", () => {
    expect(GUARD.test("/v1/research/r1/report")).toBe(true);
    expect(GUARD.test("/v1/research/reports")).toBe(false);
    expect(GUARD.test("/v1/research/verify-source")).toBe(false);
    expect(GUARD.test("/v1/research/results")).toBe(false);
    expect(GUARD.test("/v1/research/stats")).toBe(false);
  });
});

describe("tenant isolation", () => {
  it("accepts a declared tenant that agrees with the record", async () => {
    const { app, session } = await appFor("local", adminLocal);
    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/s1",
      cookies: { [COOKIE]: session.id },
      headers: { "x-haf-tenant": "local" },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("rejects a declared tenant that disagrees with the record, instead of silently using one of them", async () => {
    const { app, session } = await appFor("local", adminLocal);
    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/s1",
      cookies: { [COOKIE]: session.id },
      headers: { "x-haf-tenant": "other-tenant" },
    });
    // This is the case that used to pass: the guard authorized against the
    // record's tenant while a handler could act on the declared one.
    expect(response.statusCode).toBe(ErrorCodes.AUTH_TENANT_MISMATCH.status);
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("HAF-1010");
    await app.close();
  });

  it("rejects a conflicting tenant declared in the body or query too, not just the header", async () => {
    const { app, session, csrf } = await appFor("local", adminLocal);
    const viaQuery = await app.inject({
      method: "GET",
      url: "/v1/sessions/s1?tenantId=other-tenant",
      cookies: { [COOKIE]: session.id },
    });
    expect(viaQuery.statusCode).toBe(403);

    const viaBody = await app.inject({
      method: "POST",
      url: "/v1/sessions/s1/message",
      cookies: { [COOKIE]: session.id },
      headers: { "x-haf-csrf": csrf, "content-type": "application/json" },
      payload: { tenantId: "other-tenant" },
    });
    expect(viaBody.statusCode).toBe(403);
    await app.close();
  });

  it("does not treat the configured default as a conflict when the caller declared nothing", async () => {
    // Declaring no tenant is the normal case; failing it would break every
    // existing client that never sent x-haf-tenant.
    const { app, session } = await appFor("local", adminLocal);
    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/s1",
      cookies: { [COOKIE]: session.id },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().tenantFromGuard).toBe("local");
    await app.close();
  });

  it("exposes the resolved tenant to the handler, so handlers can stop reading body.tenantId", async () => {
    const { app, session } = await appFor("local", adminLocal);
    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/s1",
      cookies: { [COOKIE]: session.id },
      headers: { "x-haf-tenant": "local" },
    });
    expect(response.json().tenantFromGuard).toBe("local");
    await app.close();
  });
});

describe("tenant ratchet", () => {
  // Measured baseline at the time this test was written. Handlers still read
  // the tenant from the caller in these many places. The migration moves this
  // number down; this assertion exists so it cannot quietly move back up.
  const BASELINE_CALLER_SUPPLIED = 74;

  function routeFiles(): string[] {
    const routesDir = join(API_ROOT, "src", "routes");
    return [
      join(API_ROOT, "src", "main.ts"),
      ...readdirSync(routesDir)
        .filter((name) => name.endsWith(".ts"))
        .map((name) => join(routesDir, name)),
    ];
  }

  it("the count of caller-supplied tenant reads never grows", () => {
    const pattern = /(?:body|input|payload|query)\??\.(?:tenantId)\b|x-haf-tenant/g;
    let total = 0;
    for (const file of routeFiles()) {
      total += (readFileSync(file, "utf8").match(pattern) ?? []).length;
    }
    expect(total).toBeGreaterThan(0); // the pattern must still match something
    expect(total).toBeLessThanOrEqual(BASELINE_CALLER_SUPPLIED);
  });

  it("every path-scoped resource family resolveTenantId covers is still covered", () => {
    // The resolution is the only thing standing between a caller and another
    // tenant's record on these families; a dropped regex would be silent.
    const source = readFileSync(join(API_ROOT, "src", "auth", "auth-guards.ts"), "utf8");
    const resolveFn = source.slice(source.indexOf("async function resolveTenantId"));
    for (const family of [
      "/v1/sessions/",
      "/v1/automations/",
      "/v1/learning/candidates/",
      "/v1/learning/refinements/",
      "/v1/agent-profiles/",
    ]) {
      expect(resolveFn.includes(family.replaceAll("/", "\\/"))).toBe(true);
    }
  });

  describe("families added after the tenant-blind audit", () => {
    for (const family of NEW_FAMILIES) {
      it(`rejects a conflicting tenant for ${family.name}`, async () => {
        const { app, session } = await appFor("local", adminLocal);
        const response = await app.inject({
          method: "POST",
          url: `${family.route}?tenantId=other-tenant`,
          cookies: { [COOKIE]: session.id },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json().error.code).toBe("HAF-1010");
        await app.close();
      });

      it(`authorizes ${family.name} against the record's own tenant`, async () => {
        const { app, session, csrf } = await appFor("local", adminLocal);
        const response = await app.inject({
          method: "POST",
          url: family.route,
          payload: "{}",
          cookies: { [COOKIE]: session.id },
          // Mutations need the CSRF token; without it this would be a 403 for
          // the wrong reason and the test would prove nothing about tenancy.
          headers: { "x-haf-tenant": "local", "x-haf-csrf": csrf, "content-type": "application/json" },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().tenantFromGuard).toBe("local");
        await app.close();
      });
    }
  });
});
