/**
 * Production auth startup policy.
 *
 * The bug this pins: `IdentityService.anonymousIdentity()` grants
 * `systemAdmin: true`, and `authDisabled` is computed as
 * `!apiToken && !oidcConfigured` — so *forgetting* to configure auth was
 * indistinguishable from *choosing* to disable it. A production deploy missing
 * `HAF_API_TOKEN` started cleanly and gave every unauthenticated caller
 * systemAdmin.
 *
 * These tests drive the real policy module. `main.ts` cannot be imported (it
 * binds a port at import time), which is why the policy lives in its own file.
 */
import { describe, expect, it } from "vitest";
import {
  AnonymousExposureError,
  DEVELOPMENT_SESSION_SECRET,
  ProductionAuthPolicyError,
  assertAnonymousExposurePolicy,
  assertProductionAuthPolicy,
  collectAnonymousExposureProblems,
  collectProductionAuthProblems,
  isLoopbackHost,
  type ProductionAuthPolicyInput,
} from "../src/auth/startup-policy.js";

/** A configuration that is safe to serve: API token + its own session secret. */
function safeProduction(overrides: Partial<ProductionAuthPolicyInput> = {}): ProductionAuthPolicyInput {
  return {
    nodeEnv: "production",
    authDisabled: false,
    explicitDisableRequested: false,
    apiTokenConfigured: true,
    oidcConfigured: false,
    sessionSecretExplicit: true,
    sessionSecret: "a-private-session-secret-that-is-not-the-api-token",
    host: "127.0.0.1",
    anonymousNonLoopbackExplicit: false,
    ...overrides,
  };
}

describe("production auth startup policy", () => {
  it("accepts a correctly configured production server", () => {
    expect(() => assertProductionAuthPolicy(safeProduction())).not.toThrow();
    expect(collectProductionAuthProblems(safeProduction())).toEqual([]);
  });

  it("accepts production with OIDC instead of an API token", () => {
    const input = safeProduction({ apiTokenConfigured: false, oidcConfigured: true });
    expect(() => assertProductionAuthPolicy(input)).not.toThrow();
  });

  it("refuses to start in production when no credentials are configured at all", () => {
    // This is the fail-open that shipped: no token, no OIDC, so authDisabled
    // becomes true and anonymous callers are granted systemAdmin.
    const input = safeProduction({
      authDisabled: true,
      apiTokenConfigured: false,
      oidcConfigured: false,
      sessionSecretExplicit: false,
      sessionSecret: DEVELOPMENT_SESSION_SECRET,
    });
    expect(() => assertProductionAuthPolicy(input)).toThrow(ProductionAuthPolicyError);
    const message = (() => {
      try {
        assertProductionAuthPolicy(input);
      } catch (error) {
        return (error as Error).message;
      }
      return "";
    })();
    expect(message).toContain("HAF_API_TOKEN");
    expect(message).toContain("systemAdmin");
  });

  it("refuses an explicit HAF_AUTH_DISABLED=true in production, and says why", () => {
    const input = safeProduction({
      authDisabled: true,
      explicitDisableRequested: true,
      apiTokenConfigured: false,
      sessionSecretExplicit: false,
      sessionSecret: DEVELOPMENT_SESSION_SECRET,
    });
    const problems = collectProductionAuthProblems(input);
    expect(problems.some((problem) => problem.includes("HAF_AUTH_DISABLED=true"))).toBe(true);
    expect(() => assertProductionAuthPolicy(input)).toThrow(ProductionAuthPolicyError);
  });

  it("refuses the public development session-secret placeholder in production", () => {
    const input = safeProduction({
      sessionSecretExplicit: false,
      sessionSecret: DEVELOPMENT_SESSION_SECRET,
    });
    const problems = collectProductionAuthProblems(input);
    expect(problems.some((problem) => problem.includes(DEVELOPMENT_SESSION_SECRET))).toBe(true);
    expect(() => assertProductionAuthPolicy(input)).toThrow(ProductionAuthPolicyError);
  });

  it("refuses to seal sessions with the API token in production", () => {
    // main.ts falls back to `HAF_SESSION_SECRET ?? apiToken`, which makes the
    // bearer token double as a cookie key: leaking it forges sessions too.
    const input = safeProduction({
      sessionSecretExplicit: false,
      sessionSecret: "the-api-token-reused-as-a-cookie-key",
    });
    const problems = collectProductionAuthProblems(input);
    expect(problems.some((problem) => problem.includes("HAF_SESSION_SECRET is unset"))).toBe(true);
    expect(() => assertProductionAuthPolicy(input)).toThrow(ProductionAuthPolicyError);
  });

  it("refuses an empty session secret in production", () => {
    const input = safeProduction({ sessionSecret: "" });
    expect(() => assertProductionAuthPolicy(input)).toThrow(/empty string/);
  });

  it("reports every problem at once rather than one restart at a time", () => {
    const input = safeProduction({
      authDisabled: true,
      apiTokenConfigured: false,
      sessionSecretExplicit: false,
      sessionSecret: DEVELOPMENT_SESSION_SECRET,
    });
    const problems = collectProductionAuthProblems(input);
    // Both the disabled-auth problem and the placeholder-secret problem.
    expect(problems.length).toBeGreaterThanOrEqual(2);
    const error = new ProductionAuthPolicyError(problems);
    expect(error.problems).toHaveLength(problems.length);
    expect(error.name).toBe("ProductionAuthPolicyError");
  });

  it("is a no-op outside production, where anonymous mode is the intended behaviour", () => {
    for (const nodeEnv of [undefined, "development", "test", "staging"]) {
      const input: ProductionAuthPolicyInput = {
        nodeEnv,
        authDisabled: true,
        explicitDisableRequested: false,
        apiTokenConfigured: false,
        oidcConfigured: false,
        sessionSecretExplicit: false,
        sessionSecret: DEVELOPMENT_SESSION_SECRET,
        host: "127.0.0.1",
        anonymousNonLoopbackExplicit: false,
      };
      expect(() => assertProductionAuthPolicy(input), `nodeEnv=${nodeEnv}`).not.toThrow();
    }
  });

  it("still collects problems outside production, so the check can be previewed", () => {
    const problems = collectProductionAuthProblems({
      nodeEnv: "development",
      authDisabled: true,
      explicitDisableRequested: false,
      apiTokenConfigured: false,
      oidcConfigured: false,
      sessionSecretExplicit: false,
      sessionSecret: DEVELOPMENT_SESSION_SECRET,
    });
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe("anonymous mode must not be reachable from the network", () => {
  /** Development mode, no credentials: anonymous callers hold systemAdmin. */
  function anonymousDevelopment(overrides: Partial<ProductionAuthPolicyInput> = {}) {
    return {
      nodeEnv: "development",
      authDisabled: true,
      explicitDisableRequested: false,
      apiTokenConfigured: false,
      oidcConfigured: false,
      sessionSecretExplicit: false,
      sessionSecret: DEVELOPMENT_SESSION_SECRET,
      host: "127.0.0.1",
      anonymousNonLoopbackExplicit: false,
      ...overrides,
    } satisfies ProductionAuthPolicyInput;
  }

  it("classifies loopback and network hosts", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("::")).toBe(false);
    expect(isLoopbackHost("192.168.1.100")).toBe(false);
  });

  it("refuses anonymous mode on 0.0.0.0, even in development", () => {
    // The measured defect: NODE_ENV=development, no token, HAF_HOST unset so the
    // server bound 0.0.0.0 — and GET /v1/sessions answered 200 from another
    // machine on the LAN, as an anonymous systemAdmin. The production policy is
    // a no-op here by design, so this check is the only thing standing between
    // that configuration and the network.
    const input = anonymousDevelopment({ host: "0.0.0.0" });
    expect(() => assertProductionAuthPolicy(input)).not.toThrow();
    expect(() => assertAnonymousExposurePolicy(input)).toThrow(AnonymousExposureError);

    const problems = collectAnonymousExposureProblems(input);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("0.0.0.0");
    expect(problems[0]).toContain("systemAdmin");
    expect(problems[0]).toContain("HAF_HOST=127.0.0.1");
  });

  it("refuses anonymous mode on a concrete interface address too", () => {
    expect(() =>
      assertAnonymousExposurePolicy(anonymousDevelopment({ host: "192.168.1.100" })),
    ).toThrow(AnonymousExposureError);
  });

  it("allows anonymous mode on loopback, which is what development needs", () => {
    expect(() => assertAnonymousExposurePolicy(anonymousDevelopment())).not.toThrow();
    expect(collectAnonymousExposureProblems(anonymousDevelopment())).toEqual([]);
  });

  it("says nothing when credentials are configured, whatever the host", () => {
    // Authenticated callers on 0.0.0.0 are the normal deployment.
    const problems = collectAnonymousExposureProblems(
      safeProduction({ authDisabled: false, host: "0.0.0.0" }),
    );
    expect(problems).toEqual([]);
  });

  it("allows an explicit opt-in, and requires the caller to have said so", () => {
    const optedIn = anonymousDevelopment({
      host: "0.0.0.0",
      anonymousNonLoopbackExplicit: true,
    });
    expect(() => assertAnonymousExposurePolicy(optedIn)).not.toThrow();
    expect(() =>
      assertAnonymousExposurePolicy(anonymousDevelopment({ host: "0.0.0.0" })),
    ).toThrow();
  });

  it("carries its problems on the error", () => {
    const error = new AnonymousExposureError(["one", "two"]);
    expect(error.name).toBe("AnonymousExposureError");
    expect(error.problems).toEqual(["one", "two"]);
    expect(error.message).toContain("one");
  });
});
