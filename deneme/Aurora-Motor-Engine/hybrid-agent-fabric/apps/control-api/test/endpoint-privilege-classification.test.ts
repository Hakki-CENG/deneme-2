/**
 * Endpoint privilege classification, and the ratchet that keeps it honest.
 *
 * Two layers, matching how `t-hygiene` works:
 *   1. The specific routes the audit flagged are driven through the real guards
 *      and must land on the role they are documented to need.
 *   2. Every mutating route in the router is classified by a script over the
 *      source. A new route that carries neither a tenant in its handler, nor a
 *      path-scoped resource id, nor an entry in one of the classification lists
 *      fails here instead of quietly defaulting to `operator`.
 *
 * Why this exists: the default role for a mutation outside `ADMIN_MUTATION_PATH`
 * was `operator`. A measured audit found 500 mutating routes, of which 33
 * carried no tenant and no path-scoped resource — so any operator on any tenant
 * could change installation-wide state. `PUT /v1/federated/air-gap` and
 * `PUT /v1/sdk/config` were the clearest, and both sit in families whose
 * *other* routes are tenant-scoped, which is why the prefix lists missed them.
 */
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import type { HybridAgentEngine } from "@haf/engine";
import {
  ADMIN_MUTATION_PATH,
  ANALYTICAL_AT_OPERATOR_PATH,
  GLOBAL_STATE_PATH,
  SYSTEM_ADMIN_PATH,
  TENANT_STATE_MUTATION_PATH,
  registerAuthGuards,
} from "../src/auth/auth-guards.js";
import { IdentityService, type Identity } from "../src/auth/identity-service.js";
import { ErrorCodes, registerErrorHandler } from "../src/middleware/error-handler.js";

const COOKIE = "haf_session";
const HERE = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(HERE, "..");

/** Only the tenant-resolution lookups are stubbed; the guards under test are real. */
const engineStub = {
  session: async () => ({ tenantId: "local" }),
  automations: { get: async () => ({ tenantId: "local" }) },
  learning: { get: async () => ({ tenantId: "local" }) },
  refinements: { get: async () => ({ tenantId: "local" }) },
  agentProfiles: { get: async () => ({ tenantId: "local" }) },
} as unknown as HybridAgentEngine;

const operator: Identity = { subject: "op", authType: "oidc", systemAdmin: false, tenants: { local: "operator" } };
const admin: Identity = { subject: "ad", authType: "oidc", systemAdmin: false, tenants: { local: "admin" } };
const systemAdmin: Identity = { subject: "sa", authType: "oidc", systemAdmin: true, tenants: { local: "admin" } };

async function serviceWith(identity: Identity) {
  const sessionFile = join(await mkdtemp(join(tmpdir(), "haf-priv-")), "sessions.enc");
  const identityService = new IdentityService({ sessionFile, sessionSecret: "test-secret", authDisabled: false, defaultTenant: "local" });
  const session = await identityService.createSession(identity);
  return { identityService, session };
}

/**
 * An app carrying the routes under test. Each one returns 200 when it is
 * reached, so a 200 means "the guard let this through" and nothing else.
 */
async function privilegedApp(identityService: IdentityService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await registerErrorHandler(app);
  registerAuthGuards(app, { identityService, cookieName: COOKIE, engine: engineStub, oidcConfigured: false });
  const ok = async () => ({ ok: true });
  // Global-state mutations the audit flagged.
  app.put("/v1/federated/air-gap", ok);
  app.get("/v1/federated/air-gap", ok);
  app.post("/v1/federated/models", ok); // tenant-scoped sibling: must NOT need system-admin
  app.put("/v1/sdk/config", ok);
  app.get("/v1/sdk/config", ok);
  app.patch("/v1/meta-controller/config", ok);
  app.post("/v1/models/orchestrate", ok);
  app.post("/v1/model-capabilities", ok);
  app.post("/v1/model-capabilities/select", ok);
  app.post("/v1/neural-core/activate", ok);
  app.post("/v1/skills/transfer", ok);
  app.post("/v1/skills/candidates", ok);
  app.post("/v1/long-horizon-memory/consolidate", ok);
  // Installation-wide records that carry no tenantId at all: ModelPrice,
  // TrustedPublisher and ArtifactPin. Their tenant-scoped sibling
  // (POST /v1/trust/policy, which writes TrustPolicy) must stay at admin.
  app.delete("/v1/model-prices/:route", ok);
  app.get("/v1/model-prices", ok);
  app.delete("/v1/trust/publishers/:id", ok);
  app.delete("/v1/trust/pins/:kind/:artifactId", ok);
  app.get("/v1/trust/publishers", ok);
  app.post("/v1/trust/policy", ok);
  // Tenant-state mutations.
  app.post("/v1/causal-graph/node", ok);
  app.post("/v1/self-debugging/fix", ok);
  // Analytical routes intentionally left at operator.
  app.post("/v1/explain/task", ok);
  app.post("/v1/computer-use/visual-grounding", ok);
  // Public webhooks must stay reachable without a role.
  app.post("/v1/cron/fire", ok);
  app.post("/v1/platforms/twilio/webhook", ok);
  return app;
}

async function call(identity: Identity, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string) {
  const { identityService, session } = await serviceWith(identity);
  const app = await privilegedApp(identityService);
  const response = await app.inject({
    method,
    url,
    cookies: { [COOKIE]: session.id },
    headers: { "x-haf-csrf": session.csrfToken },
  });
  await app.close();
  return response;
}

describe("endpoint privilege classification", () => {
  it("requires a system admin to change installation-wide air-gap configuration", async () => {
    const asOperator = await call(operator, "PUT", "/v1/federated/air-gap");
    expect(asOperator.statusCode).toBe(ErrorCodes.AUTH_SYSTEM_ADMIN_REQUIRED.status);
    expect(asOperator.json().error.code).toBe("HAF-1007");

    const asSystemAdmin = await call(systemAdmin, "PUT", "/v1/federated/air-gap");
    expect(asSystemAdmin.statusCode).toBe(200);
  });

  it("requires a system admin to change SDK configuration", async () => {
    const asAdmin = await call(admin, "PUT", "/v1/sdk/config");
    expect(asAdmin.statusCode).toBe(ErrorCodes.AUTH_SYSTEM_ADMIN_REQUIRED.status);
    const asSystemAdmin = await call(systemAdmin, "PUT", "/v1/sdk/config");
    expect(asSystemAdmin.statusCode).toBe(200);
  });

  it("covers the other installation-wide mutations the audit found", async () => {
    for (const [method, url] of [
      ["PATCH", "/v1/meta-controller/config"],
      ["POST", "/v1/models/orchestrate"],
      ["POST", "/v1/model-capabilities"],
      ["POST", "/v1/neural-core/activate"],
      ["POST", "/v1/skills/transfer"],
      ["POST", "/v1/skills/candidates"],
      ["POST", "/v1/long-horizon-memory/consolidate"],
    ] as const) {
      const asOperator = await call(operator, method, url);
      expect(asOperator.statusCode, `${method} ${url}`).toBe(ErrorCodes.AUTH_SYSTEM_ADMIN_REQUIRED.status);
      const asSystemAdmin = await call(systemAdmin, method, url);
      expect(asSystemAdmin.statusCode, `${method} ${url} as system-admin`).toBe(200);
    }
  });

  it("does not over-restrict reads of the same global state", async () => {
    // A viewer reading air-gap configuration is fine; only writing needs a system admin.
    expect((await call(operator, "GET", "/v1/federated/air-gap")).statusCode).toBe(200);
    expect((await call(operator, "GET", "/v1/sdk/config")).statusCode).toBe(200);
  });

  it("requires a system admin to delete installation-wide records that have no tenant", async () => {
    // ModelPrice, TrustedPublisher and ArtifactPin carry no tenantId, so these
    // are not "admin of some tenant" operations: any tenant's admin could
    // delete a global price row, unpin an artifact, or remove a trusted
    // publisher whose keys other tenants rely on.
    for (const url of [
      "/v1/model-prices/openai%3Agpt-4o",
      "/v1/trust/publishers/pub-1",
      "/v1/trust/pins/skill/skill-1",
    ]) {
      const asAdmin = await call(admin, "DELETE", url);
      expect(asAdmin.statusCode, `${url} as tenant admin`).toBe(ErrorCodes.AUTH_SYSTEM_ADMIN_REQUIRED.status);
      expect(asAdmin.json().error.code).toBe("HAF-1007");
      const asSystemAdmin = await call(systemAdmin, "DELETE", url);
      expect(asSystemAdmin.statusCode, `${url} as system-admin`).toBe(200);
    }
  });

  it("does not over-restrict reads of installation-wide records, or their tenant-scoped sibling", async () => {
    expect((await call(operator, "GET", "/v1/model-prices")).statusCode).toBe(200);
    expect((await call(operator, "GET", "/v1/trust/publishers")).statusCode).toBe(200);
    // TrustPolicy *does* carry a tenantId, so writing it is tenant work: admin,
    // not system-admin. Moving all of /v1/trust up would have broken this.
    const asOperator = await call(operator, "POST", "/v1/trust/policy");
    expect(asOperator.statusCode).toBe(ErrorCodes.AUTH_INSUFFICIENT_ROLE.status);
    expect(asOperator.json().error.details.requiredRole).toBe("admin");
    expect((await call(admin, "POST", "/v1/trust/policy")).statusCode).toBe(200);
  });

  it("does not drag tenant-scoped siblings of a global route up to system-admin", async () => {
    // POST /v1/federated/models carries a tenantId, so it is tenant work.
    expect((await call(operator, "POST", "/v1/federated/models")).statusCode).toBe(200);
  });

  it("requires admin, not system-admin, for tenant-affecting state mutations", async () => {
    for (const url of ["/v1/causal-graph/node", "/v1/self-debugging/fix"]) {
      const asOperator = await call(operator, "POST", url);
      expect(asOperator.statusCode, url).toBe(ErrorCodes.AUTH_INSUFFICIENT_ROLE.status);
      expect(asOperator.json().error.details.requiredRole).toBe("admin");
      const asAdmin = await call(admin, "POST", url);
      expect(asAdmin.statusCode, `${url} as admin`).toBe(200);
    }
  });

  it("leaves analytical routes at operator, and says so explicitly", async () => {
    for (const url of ["/v1/explain/task", "/v1/computer-use/visual-grounding"]) {
      expect(ANALYTICAL_AT_OPERATOR_PATH.test(url), url).toBe(true);
      expect((await call(operator, "POST", url)).statusCode).toBe(200);
    }
    // And they are not silently in one of the elevated lists.
    for (const url of ["/v1/explain/task", "/v1/computer-use/visual-grounding", "/v1/causal/impact"]) {
      expect(GLOBAL_STATE_PATH.test(url), `${url} should not be system-admin`).toBe(false);
      expect(TENANT_STATE_MUTATION_PATH.test(url), `${url} should not be admin`).toBe(false);
    }
  });

  it("keeps public webhooks reachable without any role", async () => {
    // Reached by external systems that authenticate by signature, not by role.
    const sessionFile = join(await mkdtemp(join(tmpdir(), "haf-priv-")), "sessions.enc");
    const identityService = new IdentityService({ sessionFile, sessionSecret: "s", authDisabled: false, defaultTenant: "local" });
    const app = await privilegedApp(identityService);
    for (const url of ["/v1/cron/fire", "/v1/platforms/twilio/webhook"]) {
      const response = await app.inject({ method: "POST", url });
      expect(response.statusCode, url).toBe(200);
    }
    await app.close();
  });
});

// ─── The ratchet ─────────────────────────────────────────────────────────────

interface RouteRecord {
  method: string;
  path: string;
  file: string;
  hasTenant: boolean;
  hasPathParam: boolean;
}

/** Parse every registered route out of the router sources. */
function collectRoutes(): RouteRecord[] {
  const sources = [
    join(API_ROOT, "src", "main.ts"),
    join(API_ROOT, "src", "routes", "aurora-services.ts"),
    join(API_ROOT, "src", "routes", "cognitive.ts"),
    join(API_ROOT, "src", "routes", "meta-controller.ts"),
    join(API_ROOT, "src", "routes", "observability.ts"),
  ];
  const records: RouteRecord[] = [];
  for (const source of sources) {
    let text: string;
    try {
      text = readFileSync(source, "utf8");
    } catch {
      continue; // A route file may be removed; absence is not a finding.
    }
    const marker = /app\.(get|post|put|patch|delete)\("(\/v1\/[^"]+)"/g;
    const found: Array<{ method: string; path: string; at: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = marker.exec(text)) !== null) {
      found.push({ method: match[1]!.toUpperCase(), path: match[2]!, at: match.index });
    }
    for (let i = 0; i < found.length; i += 1) {
      const current = found[i]!;
      const end = i + 1 < found.length ? found[i + 1]!.at : Math.min(current.at + 2000, text.length);
      const body = text.slice(current.at, end);
      records.push({
        method: current.method,
        path: current.path,
        file: source.split("/").slice(-1)[0]!,
        hasTenant: /tenantId|auroraTenant|auroraInput/.test(body),
        hasPathParam: current.path.includes(":"),
      });
    }
  }
  return records;
}

/** The webhook matcher, re-derived here so the test cannot drift from the guard. */
const PUBLIC_WEBHOOK =
  /^\/v1\/(?:automations\/[^/]+\/webhook|automation-responders\/[^/]+\/(?:heartbeat|events)|cron\/fire|platforms\/(?:telegram|slack|discord|whatsapp|signal|matrix|mattermost|line|google-chat|teams|feishu|github-app|twilio)\/webhook)(?:\?|$)/;

describe("privilege classification ratchet", () => {
  it("every mutating route is scoped by a tenant, a path resource, or an explicit classification", () => {
    const routes = collectRoutes();
    expect(routes.length).toBeGreaterThan(400); // guards against the parser silently matching nothing

    const unclassified = routes.filter((route) => {
      if (route.method === "GET" || route.method === "HEAD") return false;
      if (route.hasTenant) return false; // tenant-scoped: operator/admin is meaningful
      if (route.hasPathParam) return false; // resource-scoped: the id carries the scope
      const sample = route.path; // already concrete, or a pattern the lists match
      if (PUBLIC_WEBHOOK.test(`${sample}?`)) return false; // signature-authenticated
      // The two long-standing lists first: a route already classified there is
      // not a finding, and forgetting them made the ratchet report 9 routes
      // that were in fact already covered.
      if (SYSTEM_ADMIN_PATH.test(sample)) return false;
      if (ADMIN_MUTATION_PATH.test(sample)) return false;
      if (GLOBAL_STATE_PATH.test(sample)) return false;
      if (TENANT_STATE_MUTATION_PATH.test(sample)) return false;
      if (ANALYTICAL_AT_OPERATOR_PATH.test(sample)) return false;
      return true;
    });

    expect(
      unclassified.map((route) => `${route.method} ${route.path} (${route.file})`),
      "Mutating routes with neither a tenant, nor a path-scoped resource, nor an explicit " +
        "role classification. Add them to GLOBAL_STATE_PATH, TENANT_STATE_MUTATION_PATH or " +
        "ANALYTICAL_AT_OPERATOR_PATH in src/auth/auth-guards.ts — or give the handler a tenant.",
    ).toEqual([]);
  });

  it("the classification lists match routes that actually exist", () => {
    const routes = collectRoutes();
    const paths = routes.map((route) => route.path.replace(/:[a-zA-Z]+/g, "x"));
    const probes: Array<[RegExp, string]> = [
      [GLOBAL_STATE_PATH, "/v1/federated/air-gap"],
      [GLOBAL_STATE_PATH, "/v1/sdk/config"],
      [GLOBAL_STATE_PATH, "/v1/models/orchestrate"],
      [TENANT_STATE_MUTATION_PATH, "/v1/causal-graph/node"],
      [TENANT_STATE_MUTATION_PATH, "/v1/self-debugging/fix"],
      [ANALYTICAL_AT_OPERATOR_PATH, "/v1/explain/task"],
      [ANALYTICAL_AT_OPERATOR_PATH, "/v1/research/verify-source"],
    ];
    for (const [list, url] of probes) {
      expect(list.test(url), `${url} should be classified`).toBe(true);
      expect(paths, `${url} no longer exists in the router`).toContain(url);
    }
  });
});
