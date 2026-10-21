/**
 * Request guards: who is calling, and are they allowed to.
 *
 * Extracted from `main.ts` so the behaviour is reachable from a test. Inline in
 * a 3,500-line entrypoint that listens on a port at import time, these hooks
 * could only be exercised by starting the whole server — which is why five
 * registered auth codes went unproduced and unnoticed.
 *
 * The codes produced here, and the condition behind each:
 *
 * | Code | Condition |
 * |---|---|
 * | `AUTH_SESSION_NOT_FOUND` | no bearer token, no usable session cookie, anonymous mode off |
 * | `AUTH_SESSION_EXPIRED` | a cookie that names a session which has lapsed |
 * | `AUTH_SYSTEM_ADMIN_REQUIRED` | a system-scoped route called by a non-system-admin |
 * | `AUTH_INSUFFICIENT_ROLE` | the caller's role in the resolved tenant is below the route's requirement |
 * | `AUTH_CSRF_INVALID` | an unsafe method from a cookie session without a matching CSRF header |
 *
 * All five are thrown as `AppError` rather than answered with an inline
 * `reply.send`. An inline answer bypasses the central error handler, so the body
 * is whatever the hook happened to write and the documented code is never sent.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { HybridAgentEngine } from "@haf/engine";
// Value import: this is thrown, not just referenced as a type.
import { ResourceNotFoundError } from "@haf/engine";
import { AppError } from "../middleware/error-handler.js";
import { roleAllows, type Identity, type IdentityService, type Role, type WebSession } from "./identity-service.js";

export interface AuthGuardOptions {
  identityService: IdentityService;
  cookieName: string;
  engine: HybridAgentEngine;
  oidcConfigured: boolean;
}

export interface AuthRequestState {
  identity(request: FastifyRequest): Identity | undefined;
  webSession(request: FastifyRequest): WebSession | undefined;
  /**
   * The tenant the guard authorized this request against.
   *
   * Handlers should read the tenant from here rather than from `body.tenantId`,
   * `x-haf-tenant` or the query string. Until they do, the guard can authorize
   * against the tenant a resource actually belongs to while the handler acts on
   * whatever tenant the caller named — which is what made the resolution above
   * advisory rather than authoritative.
   */
  tenant(request: FastifyRequest): string | undefined;
}

/** Routes an unauthenticated caller may reach. */
export function isPublicWebhook(url: string): boolean {
  return (
    /^\/v1\/automations\/[^/]+\/webhook(?:\?|$)/.test(url) ||
    /^\/v1\/automation-responders\/[^/]+\/(?:heartbeat|events)(?:\?|$)/.test(url) ||
    /^\/v1\/cron\/fire(?:\?|$)/.test(url) ||
    /^\/v1\/platforms\/(?:telegram|slack|discord|whatsapp|signal|matrix|mattermost|line|google-chat|teams|feishu|github-app|twilio)\/webhook(?:\?|$)/.test(url)
  );
}

export function isPublicRoute(url: string): boolean {
  return url === "/" || url.startsWith("/canvas") || url.startsWith("/health") || url.startsWith("/auth/") || isPublicWebhook(url);
}

/** Path prefixes that manage the whole installation rather than one tenant. */
export const SYSTEM_ADMIN_PATH = /^\/v1\/(?:backends|mcp|plugins|detached-workers|skills\/hub|model-configurations|model-auth|providers\/[^/]+\/credentials|secret-sources|aurora\/fleet)/;

/** Admin-scoped mutations: anything under these prefixes that is not a safe method. */
export const ADMIN_MUTATION_PATH = /^\/v1\/(?:secrets|learning|agent-profiles|repositories|repository-providers|github-apps|model-oauth-sources|automation-git-sources|automation-responders|society|cognitive|memory-graph|world|multiworld|initiative|user-model|evolution|environment|constitution|harness|microagents|risk|acos|decisions|plans|experience|autopilot|checkpoints|aurora|delegations|delegation-policy|harvest-review|harvest-policy|decision-feedback|estimation|hooks|session-modes|session-archives|model-prices|effort-defaults|trust|questions|auto-approvals|session-budgets|verification|channel-routing-rules)/;

/**
 * Installation-wide state mutations that neither list above reached.
 *
 * The default role for a mutation outside `ADMIN_MUTATION_PATH` is `operator`.
 * That is right for work scoped to one tenant, but a measured audit of the
 * router found 33 mutating routes that carry no tenant in the handler *and* no
 * path-scoped resource id — so "operator on any tenant" could change state for
 * the whole installation. `PUT /v1/federated/air-gap` and `PUT /v1/sdk/config`
 * were the clearest cases: both are installation-wide configuration, and their
 * sibling routes in the same families *are* tenant-scoped, which is why the
 * prefix-level lists missed them.
 *
 * Public webhooks (`isPublicWebhook`) are deliberately excluded: they are
 * reached by external systems that authenticate by signature, not by role.
 */
export const GLOBAL_STATE_PATH =
  /^\/v1\/(?:federated\/air-gap|sdk\/config|meta-controller|models\/orchestrate|model-capabilities(?:$|\/)|neural-core|long-horizon-memory\/consolidate|skills\/(?:transfer|candidates)|model-prices|trust\/publishers|trust\/pins)/;

/**
 * Tenant-affecting state mutations that were reachable at `operator`.
 *
 * These do change durable state, but for one tenant rather than the
 * installation, so `admin` is the right floor — not `system-admin`.
 */
export const TENANT_STATE_MUTATION_PATH =
  /^\/v1\/(?:causal-graph|critic\/resolve|composition\/component|self-debugging\/fix|multi-hypothesis\/supersede|self-model\/strategy|learned-world\/(?:entity|relation|rule))/;

/**
 * Analytical routes deliberately left at `operator`.
 *
 * Listed so the choice is explicit rather than an omission, and so the
 * classification test can assert it still holds: these compute or explain
 * without writing durable state, so raising them would break ordinary
 * operator workflows for no security gain.
 */
export const ANALYTICAL_AT_OPERATOR_PATH =
  /^\/v1\/(?:explain\/task|research\/verify-source|causal\/impact|learned-world\/query|computer-use\/(?:visual-grounding|fill-form)|model-capabilities\/select)/;

/**
 * Path-scoped resources whose tenant comes from the record, not from the caller.
 *
 * Reading the tenant from the request would let a caller name any tenant they
 * like; resolving it from the stored record is what makes the role check below
 * mean something for `GET /v1/sessions/<someone-elses-id>`.
 */
async function resolveTenantId(request: FastifyRequest, engine: HybridAgentEngine, identityTenant: string): Promise<string> {
  const sessionMatch = request.url.match(/^\/v1\/sessions\/([^/?]+)/);
  if (sessionMatch) return (await engine.session(decodeURIComponent(sessionMatch[1]!))).tenantId;
  const automationMatch = request.url.match(/^\/v1\/automations\/([^/?]+)/);
  if (automationMatch) return (await engine.automations.get(decodeURIComponent(automationMatch[1]!))).tenantId;
  const learningMatch = request.url.match(/^\/v1\/learning\/candidates\/([^/?]+)/);
  if (learningMatch) return (await engine.learning.get(decodeURIComponent(learningMatch[1]!))).tenantId;
  const refinementMatch = request.url.match(/^\/v1\/learning\/refinements\/([^/?]+)/);
  if (refinementMatch && refinementMatch[1] !== "plan") return (await engine.refinements.get(decodeURIComponent(refinementMatch[1]!))).tenantId;
  const agentProfileMatch = request.url.match(/^\/v1\/agent-profiles\/([^/?]+)/);
  if (agentProfileMatch) return (await engine.agentProfiles.get(decodeURIComponent(agentProfileMatch[1]!))).tenantId;
  // Accepting a trade moves balances, so the tenant must come from the trade
  // itself. Left to the caller, anyone authenticated could accept another
  // tenant's trade; resolved here, a mismatched declaration is a 403 HAF-1010
  // before the handler runs at all.
  const economyTradeMatch = request.url.match(/^\/v1\/economy\/trade\/([^/?]+)\/accept/);
  if (economyTradeMatch) {
    const tradeId = decodeURIComponent(economyTradeMatch[1]!);
    const trade = await engine.agentEconomy.tradeById(tradeId);
    if (!trade) throw new ResourceNotFoundError("trade", tradeId);
    return trade.tenantId;
  }
  // ─── Families added after the tenant-blind audit ───
  // Each of these stores `tenantId` on the record and exposes an id-only
  // accessor, so before this the handler could be handed a record belonging to
  // any tenant while the role check ran against the tenant the caller declared.
  // Resolving here fixes every route in the family at once — including the
  // release signing and rollback paths, and the connector routes that send
  // email and create calendar events.
  const releaseMatch = request.url.match(/^\/v1\/learning\/releases\/([^/?]+)/);
  if (releaseMatch) return (await engine.learningRollouts.get(decodeURIComponent(releaseMatch[1]!))).tenantId;
  const connectorMatch = request.url.match(/^\/v1\/connectors\/([^/?]+)/);
  if (connectorMatch) {
    const connectorId = decodeURIComponent(connectorMatch[1]!);
    const connector = await engine.connectors.getConnector(connectorId);
    if (!connector) throw new ResourceNotFoundError("connector", connectorId);
    return connector.tenantId;
  }
  const computerUseMatch = request.url.match(/^\/v1\/computer-use\/tasks\/([^/?]+)/);
  if (computerUseMatch) {
    const taskId = decodeURIComponent(computerUseMatch[1]!);
    const task = await engine.computerUse.getTask(taskId);
    if (!task) throw new ResourceNotFoundError("computer-use-task", taskId);
    return task.tenantId;
  }
  const pipelineMatch = request.url.match(/^\/v1\/pipeline\/([^/?]+)/);
  if (pipelineMatch) {
    const runId = decodeURIComponent(pipelineMatch[1]!);
    const run = await engine.codePipeline.getPipelineRun(runId);
    if (!run) throw new ResourceNotFoundError("pipeline-run", runId);
    return run.tenantId;
  }
  // ─── Aurora families: record owns the tenant, caller must not supply it ───
  const plannerV2Match = request.url.match(/^\/v1\/planner-v2\/([^/?]+)/);
  if (plannerV2Match) {
    const id = decodeURIComponent(plannerV2Match[1]!);
    const owner = await engine.plannerV2.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("plan", id);
    return owner;
  }
  const experimentEngineMatch = request.url.match(/^\/v1\/experiments\/([^/?]+)/);
  if (experimentEngineMatch) {
    const id = decodeURIComponent(experimentEngineMatch[1]!);
    const owner = await engine.experimentEngine.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("experiment", id);
    return owner;
  }
  const multiHypothesisMatch = request.url.match(/^\/v1\/multi-hypothesis\/([^/?]+)/);
  if (multiHypothesisMatch) {
    const id = decodeURIComponent(multiHypothesisMatch[1]!);
    const owner = await engine.multiHypothesis.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("hypothesis", id);
    return owner;
  }
  const swarmOrchestrationMatch = request.url.match(/^\/v1\/swarm\/([^/?]+)/);
  if (swarmOrchestrationMatch) {
    const id = decodeURIComponent(swarmOrchestrationMatch[1]!);
    const owner = await engine.swarmOrchestration.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("swarm", id);
    return owner;
  }
  const counterfactualSimulatorMatch = request.url.match(/^\/v1\/simulations\/([^/?]+)/);
  if (counterfactualSimulatorMatch) {
    const id = decodeURIComponent(counterfactualSimulatorMatch[1]!);
    const owner = await engine.counterfactualSimulator.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("simulation", id);
    return owner;
  }
  const sharedLearningMatch = request.url.match(/^\/v1\/shared-learning\/([^/?]+)/);
  if (sharedLearningMatch) {
    const id = decodeURIComponent(sharedLearningMatch[1]!);
    const owner = await engine.sharedLearning.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("lesson", id);
    return owner;
  }
  const goalStackMatch = request.url.match(/^\/v1\/goal-stack\/([^/?]+)/);
  if (goalStackMatch) {
    const id = decodeURIComponent(goalStackMatch[1]!);
    const owner = await engine.goalStack.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("goal", id);
    return owner;
  }
  // ─── Operator-reachable mutations on tenant-owned records ───
  // These four sat at the weakest mutating role (`operator`) *and* took no
  // tenant, so any operator in any tenant could act on another tenant's
  // approval, memory, schedule or research result.
  const approvalMatch = request.url.match(/^\/v1\/approvals\/([^/?]+)/);
  if (approvalMatch) {
    const id = decodeURIComponent(approvalMatch[1]!);
    const owner = await engine.approvals.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("approval", id);
    return owner;
  }
  const memoryMatch = request.url.match(/^\/v1\/memories\/([^/?]+)/);
  if (memoryMatch) {
    const id = decodeURIComponent(memoryMatch[1]!);
    const owner = await engine.memory.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("memory", id);
    return owner;
  }
  const scheduleMatch = request.url.match(/^\/v1\/schedules\/([^/?]+)/);
  if (scheduleMatch) {
    const id = decodeURIComponent(scheduleMatch[1]!);
    const owner = await engine.scheduler.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("scheduled-job", id);
    return owner;
  }
  // Anchored to `/report`: `/v1/research/reports` and `/v1/research/verify-source`
  // are siblings whose first segment is not an id, and a bare prefix match
  // would have read them as one and 404'd both.
  const researchMatch = request.url.match(/^\/v1\/research\/([^/?]+)\/report/);
  if (researchMatch) {
    const id = decodeURIComponent(researchMatch[1]!);
    const owner = await engine.researchEngine.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("research-result", id);
    return owner;
  }
  const questionMatch = request.url.match(/^\/v1\/questions\/([^/?]+)/);
  if (questionMatch) {
    const id = decodeURIComponent(questionMatch[1]!);
    const owner = await engine.userQuestions.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("question", id);
    return owner;
  }
  // Covers both `/v1/sdk/extensions/:id` and `/v1/sdk/extensions/:id/reviews`.
  const extensionMatch = request.url.match(/^\/v1\/sdk\/extensions\/([^/?]+)/);
  if (extensionMatch) {
    const id = decodeURIComponent(extensionMatch[1]!);
    const owner = await engine.agentSDK.tenantOf(id);
    if (owner === undefined) throw new ResourceNotFoundError("extension", id);
    return owner;
  }
  // `snapshotForTask` is synchronous and the slot carries the tenant, so the
  // guard can read it directly. Returning 404 here matches the handler, which
  // already refuses to let an unknown task read as an idle one.
  const cognitiveTaskMatch = request.url.match(/^\/v1\/cognitive-state\/tasks\/([^/?]+)/);
  if (cognitiveTaskMatch) {
    const id = decodeURIComponent(cognitiveTaskMatch[1]!);
    const slot = engine.cognitiveState.snapshotForTask(id);
    if (slot === null) throw new ResourceNotFoundError("task", id);
    return slot.tenantId;
  }
  return identityTenant;
}

export function registerAuthGuards(app: FastifyInstance, options: AuthGuardOptions): AuthRequestState {
  const { identityService, cookieName, engine, oidcConfigured } = options;
  const requestIdentity = new WeakMap<object, Identity>();
  const requestWebSession = new WeakMap<object, WebSession>();
  const requestTenant = new WeakMap<object, string>();

  app.addHook("onRequest", async (request) => {
    const authorization = request.headers.authorization;
    const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    let identity = identityService.apiTokenIdentity(bearer);
    let webSession: WebSession | undefined;
    if (!identity) {
      // A cookie that names an expired session is answered differently from no
      // cookie at all: the first means "log in again", the second means "you were
      // never logged in". Collapsing them is what makes a client retry a dead
      // credential forever.
      const lookup = await identityService.lookupSession(request.cookies[cookieName]);
      if (lookup.status === "active") {
        webSession = lookup.session;
        identity = webSession.identity;
      } else if (lookup.status === "expired" && !isPublicRoute(request.url)) {
        throw new AppError("AUTH_SESSION_EXPIRED", { expiredAt: lookup.expiresAt });
      }
    }
    identity ??= identityService.anonymousIdentity();
    if (identity) requestIdentity.set(request, identity);
    if (webSession) requestWebSession.set(request, webSession);
    if (!isPublicRoute(request.url) && !identity) {
      // `AUTH_SESSION_NOT_FOUND` is the code for "we cannot resolve who you
      // are". The distinction between an anonymous-mode server and a missing
      // credential is carried in `details`, not in a second status code.
      throw new AppError("AUTH_SESSION_NOT_FOUND", {
        authType: "anonymous",
        login: oidcConfigured ? "/auth/oidc/start" : "/auth/login/token",
      });
    }
  });

  app.addHook("preHandler", async (request) => {
    // Fastify applies root-level hooks to the not-found handler as well, so this
    // hook also runs for URLs that match no route at all. The tenant lookups
    // below resolve a path-scoped id and throw when it is missing, which turned
    // "there is no such route" into a 500: `GET /v1/sessions/<unknown-id>/anything`
    // answered 500 for every suffix, existing route or not. There is nothing to
    // authorize when no route matched, so step aside and let Fastify answer 404.
    // Measured: routeOptions.url is undefined exactly when routing did not match.
    if (typeof request.routeOptions?.url !== "string") return;
    if (!request.url.startsWith("/v1") || isPublicWebhook(request.url)) return;
    const identity = requestIdentity.get(request);
    if (!identity) throw new AppError("AUTH_SESSION_NOT_FOUND", { authType: "anonymous" });

    const body = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
    const query = request.query && typeof request.query === "object" ? (request.query as Record<string, unknown>) : {};
    const explicitDeclared =
      request.headers["x-haf-tenant"] ?? body.tenantId ?? query.tenantId;
    const declared = String(explicitDeclared ?? process.env.HAF_DEFAULT_TENANT ?? "local");
    const tenantId = await resolveTenantId(request, engine, declared);

    // A resource's tenant comes from the record, not from the caller. If the
    // caller named a *different* tenant for a path-scoped resource, the two
    // readings disagree and one of them is wrong. Authorizing against the
    // record while the handler acted on the declaration was the gap: the role
    // check and the data access were decoupled. Reject instead of guessing.
    // Supplying no tenant at all is not a conflict — that is the normal case
    // and `declared` is then only the configured default.
    if (explicitDeclared !== undefined && String(explicitDeclared) !== tenantId) {
      throw new AppError("AUTH_TENANT_MISMATCH", {
        declared: String(explicitDeclared),
        resourceTenant: tenantId,
      });
    }
    requestTenant.set(request, tenantId);

    const methodIsSafe = request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS";

    // Installation-wide state needs a system admin, whether it was reached
    // through the long-standing prefix list or through one of the routes the
    // audit found carrying neither a tenant nor a path-scoped resource.
    const requiresSystemAdmin =
      SYSTEM_ADMIN_PATH.test(request.url) || (!methodIsSafe && GLOBAL_STATE_PATH.test(request.url));
    if (requiresSystemAdmin && !identity.systemAdmin) {
      throw new AppError("AUTH_SYSTEM_ADMIN_REQUIRED", {
        subject: identity.subject,
        authType: identity.authType,
      });
    }

    const required: Role = methodIsSafe
      ? "viewer"
      : ADMIN_MUTATION_PATH.test(request.url) || TENANT_STATE_MUTATION_PATH.test(request.url)
        ? "admin"
        : "operator";
    const heldRole = identityService.roleFor(identity, tenantId);
    if (!roleAllows(heldRole, required)) {
      throw new AppError("AUTH_INSUFFICIENT_ROLE", {
        tenantId,
        requiredRole: required,
        heldRole: heldRole ?? null,
      });
    }

    const webSession = requestWebSession.get(request);
    if (!methodIsSafe && webSession && request.headers["x-haf-csrf"] !== webSession.csrfToken) {
      throw new AppError("AUTH_CSRF_INVALID", { method: request.method });
    }
  });

  return {
    identity: (request) => requestIdentity.get(request),
    webSession: (request) => requestWebSession.get(request),
    tenant: (request) => requestTenant.get(request),
  };
}
