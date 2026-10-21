/**
 * Ratchet: tenant-blind `/:id` routes must not multiply.
 *
 * A measured audit of the router found 309 routes with a path parameter, spread
 * over 69 resource families. `resolveTenantId` in `auth-guards.ts` resolves the
 * tenant from the stored record for the prefixes listed in `GUARD_RESOLVED`
 * below. Every other family the
 * guard falls back to the tenant the *caller declared*, and if the handler then
 * looks the record up by id with no tenant filter, the role check has authorized
 * the request against a tenant the resource does not belong to.
 *
 * That is not hypothetical: `POST /v1/economy/trade/:id/accept` called
 * `acceptTrade(id)`, which found the trade by id and both wallets by `agentId`
 * alone, and moved the balances. Any authenticated caller could accept another
 * tenant's trade. It is fixed and covered by
 * `agent-economy-tenant-isolation.test.ts`; this test exists so the next one is
 * found by a red build instead of by an incident.
 *
 * The remainder are still in this state. Most are probably fine — session-scoped
 * helpers, installation-wide config that A2 already classifies as system-admin,
 * or engine lookups that filter by tenant internally — but "probably" is not a
 * control. The number is pinned here so it can only go down, and every removal
 * has to be a deliberate edit.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ADMIN_MUTATION_PATH,
  GLOBAL_STATE_PATH,
  SYSTEM_ADMIN_PATH,
  isPublicWebhook,
} from "../src/auth/auth-guards.js";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const ROUTE_FILES = [
  "main.ts",
  "routes/aurora-services.ts",
  "routes/cognitive.ts",
  "routes/meta-controller.ts",
  "routes/observability.ts",
];

/** Families whose tenant the guard resolves from the record. */
const GUARD_RESOLVED = [
  "/v1/sessions/",
  "/v1/automations/",
  "/v1/learning/candidates/",
  "/v1/learning/refinements/",
  "/v1/agent-profiles/",
  "/v1/economy/trade/",
  "/v1/learning/releases/",
  "/v1/connectors/",
  "/v1/computer-use/tasks/",
  "/v1/pipeline/",
  "/v1/planner-v2/",
  "/v1/experiments/",
  "/v1/multi-hypothesis/",
  "/v1/swarm/",
  "/v1/simulations/",
  "/v1/shared-learning/",
  "/v1/goal-stack/",
  "/v1/approvals/",
  "/v1/memories/",
  "/v1/schedules/",
  "/v1/research/",
  "/v1/questions/",
  "/v1/sdk/extensions/",
  "/v1/cognitive-state/tasks/",
];

const ROUTE = /app\.(get|post|put|patch|delete)\(\s*"([^"]+)"\s*,/g;

function audit() {
  const pathScoped: string[] = [];
  const blind: Array<{ method: string; path: string }> = [];
  for (const file of ROUTE_FILES) {
    const source = readFileSync(join(SRC, file), "utf8");
    for (const match of source.matchAll(ROUTE)) {
      const path = match[2]!;
      if (!path.includes(":")) continue;
      pathScoped.push(path);
      if (GUARD_RESOLVED.some((prefix) => path.startsWith(prefix))) continue;
      const end = source.indexOf("});", match.index! + match[0].length);
      const handler = source.slice(match.index! + match[0].length, end === -1 ? undefined : end);
      // A handler that never names a tenant is only blind if it does not derive
      // one from a record. `executeSessionCapability` resolves the session and
      // passes `session.tenantId` into the capability context, so those routes
      // are tenant-scoped without ever mentioning the word — counting them was
      // a false positive that made the audited number look worse than it was.
      if (/tenant/i.test(handler) || /executeSessionCapability\s*\(/.test(handler)) continue;
      blind.push({ method: match[1]!.toUpperCase(), path });
    }
  }
  return { pathScoped, blind };
}

describe("tenant-blind path-scoped routes", () => {
  const { pathScoped, blind } = audit();

  it("sees the whole router, not just one file", () => {
    // Guard against the scan silently narrowing: an earlier count in this
    // migration reported 276 `/:id` routes because it only read main.ts. The
    // repo-wide figure is 309.
    expect(pathScoped.length).toBeGreaterThanOrEqual(300);
  });

  it("keeps the tenant-blind count at or below the audited 30", () => {
    expect(blind.length).toBeLessThanOrEqual(30);
  });

  it("no longer counts the economy trade route, which was the proven exploit", () => {
    expect(blind.some((r) => r.path === "/v1/economy/trade/:id/accept")).toBe(false);
  });

  /**
   * A blind route is only a hole if the *role* floor does not already cover it.
   * 28 of the remaining 39 are installation-wide state (system-admin) or public
   * webhooks that authenticate by signature rather than by role. What is left
   * is listed by name below, so closing one is a visible edit and adding one is
   * a red build.
   *
   * Measured, not assumed: an earlier draft of this list guessed 5 reads and got
   * 7, because `POST /v1/channels/webhook/:platform` *looks* like a public
   * webhook but is not in `isPublicWebhook`, and `GET /v1/model-capabilities/:id`
   * sits under a prefix that `GLOBAL_STATE_PATH` elevates for mutations only.
   */
  /**
   * Blind reads whose *records carry no tenantId at all* — verified in the
   * engine, not assumed. There is nothing tenant-scoped for them to leak, so
   * leaving them at viewer is a choice about global observability, not a
   * tenant-isolation hole:
   *
   *   /v1/domain-experts/:id      → `DomainExpert`  has no tenantId
   *   /v1/event-bus/trace/:id     → `AuroraEvent`   has no tenantId
   *   /v1/model-capabilities/:id  → `ModelProfile`  has no tenantId
   *
   * If any of those records grows a tenantId, this list must shrink — which is
   * the point of naming them rather than just counting them.
   */
  const GLOBAL_RECORD_READS = [
    "GET /v1/domain-experts/:id",
    "GET /v1/event-bus/trace/:traceId",
    "GET /v1/model-capabilities/:modelId",
  ];

  /** Webhook-shaped, but not in `isPublicWebhook` — see the test below. */
  const WEBHOOK_SHAPED = "POST /v1/channels/webhook/:platform";

  /**
   * Was six, now none. Two were real (`questions/:id/answer` and `/cancel`
   * looked the question up by id alone) and are resolved from the record now.
   * The other four `repository-providers` review routes were never blind at all:
   * they run through `executeSessionCapability`, which resolves the session and
   * passes `session.tenantId` into the capability context — the detector counts
   * that pattern instead of flagging it.
   */
  const OPEN_ADMIN_MUTATIONS: string[] = [];

  const label = (r: { method: string; path: string }) => `${r.method} ${r.path}`;
  const covered = ({ method, path }: { method: string; path: string }) => {
    const safe = method === "GET";
    return (
      SYSTEM_ADMIN_PATH.test(path) ||              // installation-wide
      (!safe && GLOBAL_STATE_PATH.test(path)) ||   // installation-wide mutation
      isPublicWebhook(path) ||                     // signature-authenticated
      (!safe && ADMIN_MUTATION_PATH.test(path))    // admin floor
    );
  };

  it("accounts for every remaining blind route by its privilege floor", () => {
    const unexplained = blind.filter((r) => !covered(r)).map(label).sort();
    expect(unexplained).toEqual([...GLOBAL_RECORD_READS, WEBHOOK_SHAPED].sort());
  });

  it("names the webhook-shaped route that is not actually a public webhook", () => {
    // Inbound channel webhooks are reached by external platforms, which have no
    // session. Every other webhook family is listed in `isPublicWebhook`; this
    // one is not, so today it needs an authenticated operator. That is either a
    // gap or a deliberate choice — either way it must not be discovered by an
    // outage, so it is pinned here.
    expect(isPublicWebhook("/v1/channels/webhook/telegram")).toBe(false);
    expect(isPublicWebhook("/v1/platforms/telegram/webhook")).toBe(true);
  });

  it("lists the admin-floor mutations that are still not tenant-resolved", () => {
    // Written out rather than reusing `covered`: passing a forced "GET" through
    // it silently disables the mutation-only GLOBAL_STATE_PATH branch, which is
    // exactly how the three installation-wide deletes this branch must *not*
    // count (model-prices, trust/pins, trust/publishers) crept back in.
    const adminFloor = blind
      .filter(({ method, path }) =>
        method !== "GET" &&
        ADMIN_MUTATION_PATH.test(path) &&
        !SYSTEM_ADMIN_PATH.test(path) &&
        !GLOBAL_STATE_PATH.test(path) &&
        !isPublicWebhook(path))
      .map(label)
      .sort();
    // `admin` is a real floor, but admin *of any tenant*: these still resolve
    // nothing from the record, so they are open until a family is added to
    // GUARD_RESOLVED above.
    expect(adminFloor).toEqual(OPEN_ADMIN_MUTATIONS.sort());
  });

  it("keeps every guard-resolved family actually present in the router", () => {
    // A prefix that matches nothing would silently shrink the blind list and
    // make the ratchet above pass for the wrong reason.
    for (const prefix of GUARD_RESOLVED) {
      expect(pathScoped.some((path) => path.startsWith(prefix)), prefix).toBe(true);
    }
  });
});
