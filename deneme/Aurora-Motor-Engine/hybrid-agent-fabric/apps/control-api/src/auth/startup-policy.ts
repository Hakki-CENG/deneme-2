/**
 * Production startup policy for authentication.
 *
 * Extracted from `main.ts` for the same reason `registerAuthGuards` was: an
 * entrypoint that binds a port at import time cannot be exercised by a test, so
 * a policy buried in it is a policy nobody can prove.
 *
 * The problem this closes: `IdentityService.anonymousIdentity()` returns an
 * identity with `systemAdmin: true`. In development that is the point — no
 * credentials, full local access. But `authDisabled` is also computed as
 * `!apiToken && !oidcConfigured`, i.e. *forgetting* to configure auth is
 * indistinguishable from *choosing* to turn it off. A production deploy with a
 * missing `HAF_API_TOKEN` therefore started successfully and handed
 * `systemAdmin` to every unauthenticated caller.
 *
 * Under `NODE_ENV=production` that is now fatal at startup rather than a
 * silent fail-open.
 */

export interface ProductionAuthPolicyInput {
  /** `process.env.NODE_ENV`, passed in so the policy stays testable. */
  nodeEnv: string | undefined;
  /** The computed `authDisabled` flag the server will run with. */
  authDisabled: boolean;
  /** True when `HAF_AUTH_DISABLED === "true"` was set explicitly. */
  explicitDisableRequested: boolean;
  apiTokenConfigured: boolean;
  oidcConfigured: boolean;
  /** True when `HAF_SESSION_SECRET` was set explicitly, not derived. */
  sessionSecretExplicit: boolean;
  /** The session secret the server resolved to, after its fallbacks. */
  sessionSecret: string;
  /** The host the server will bind, resolved from `HAF_HOST` and its default. */
  host: string;
  /** True when `HAF_DEV_ANONYMOUS_NONLOOPBACK === "true"` was set explicitly. */
  anonymousNonLoopbackExplicit: boolean;
}

/** The development placeholder `main.ts` falls back to when auth is disabled. */
export const DEVELOPMENT_SESSION_SECRET = "development-only-session-secret-change-me";

export class ProductionAuthPolicyError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(
      `Refusing to start: authentication is not safely configured for production.\n` +
        problems.map((problem) => `  - ${problem}`).join("\n"),
    );
    this.name = "ProductionAuthPolicyError";
    this.problems = problems;
  }
}

/**
 * Collect every reason this configuration must not serve production traffic.
 *
 * Returned rather than thrown so a caller can report all of the problems at
 * once — failing on the first one just means the operator fixes them one
 * restart at a time.
 */
export function collectProductionAuthProblems(input: ProductionAuthPolicyInput): string[] {
  const problems: string[] = [];

  if (input.authDisabled) {
    problems.push(
      input.explicitDisableRequested
        ? "HAF_AUTH_DISABLED=true is set. Anonymous callers are granted systemAdmin, so this is never valid in production. Unset it and configure HAF_API_TOKEN or OIDC."
        : "No credentials are configured (neither HAF_API_TOKEN nor a complete OIDC triple), so the server would fall back to anonymous mode — and anonymous callers are granted systemAdmin. Set HAF_API_TOKEN, or set HAF_OIDC_ISSUER + HAF_OIDC_CLIENT_ID + HAF_OIDC_REDIRECT_URI.",
    );
  }

  if (input.sessionSecret === DEVELOPMENT_SESSION_SECRET) {
    problems.push(
      `HAF_SESSION_SECRET is unset, so sessions would be sealed with the public development placeholder "${DEVELOPMENT_SESSION_SECRET}". Any holder of this source can forge a session cookie. Set HAF_SESSION_SECRET to a private value.`,
    );
  } else if (!input.sessionSecretExplicit && input.apiTokenConfigured) {
    problems.push(
      "HAF_SESSION_SECRET is unset, so sessions would be sealed with HAF_API_TOKEN. That makes the bearer token double as a cookie key: leaking it in a log forges sessions too. Set HAF_SESSION_SECRET to a separate private value.",
    );
  } else if (input.sessionSecret.length === 0) {
    problems.push("HAF_SESSION_SECRET resolved to an empty string. Set it to a private value.");
  }

  return problems;
}

/**
 * Hosts that only the local machine can reach.
 *
 * Anything else — `0.0.0.0`, `::`, or a concrete interface address — puts the
 * socket on the network.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

/**
 * Refuse to expose anonymous systemAdmin beyond the local machine, in any mode.
 *
 * The production policy above is a no-op outside `NODE_ENV=production`, on the
 * reasoning that local development is meant to run without credentials. That
 * reasoning holds only while the socket stays local. Measured by an independent
 * audit against a live server: with `NODE_ENV=development` and no token, the
 * default `HAF_HOST` of `0.0.0.0` meant the server answered
 * `GET /v1/sessions` from another machine on the LAN with a 200, as an
 * anonymous caller holding `systemAdmin` — session creation, approvals, and
 * whatever the workspace allowed.
 *
 * So this check is deliberately not gated on `nodeEnv`. Development keeps
 * working exactly as before when bound to loopback, which is the default; the
 * combination that is refused is anonymous mode on a reachable interface. An
 * operator who really wants it can set `HAF_DEV_ANONYMOUS_NONLOOPBACK=true`,
 * which is a statement that they understood what they enabled.
 */
export function collectAnonymousExposureProblems(input: ProductionAuthPolicyInput): string[] {
  if (!input.authDisabled) return [];
  if (isLoopbackHost(input.host)) return [];
  if (input.anonymousNonLoopbackExplicit) return [];
  return [
    `Authentication is disabled, so every caller is anonymous and holds systemAdmin, but the server would bind ` +
      `"${input.host}", which is reachable from other machines. Set HAF_HOST=127.0.0.1 (the default), or ` +
      `configure HAF_API_TOKEN or OIDC. If exposing an unauthenticated administrator to the network is really ` +
      `intended, set HAF_DEV_ANONYMOUS_NONLOOPBACK=true.`,
  ];
}

export class AnonymousExposureError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(
      `Refusing to start: unauthenticated callers would be reachable from the network.\n` +
        problems.map((problem) => `  - ${problem}`).join("\n"),
    );
    this.name = "AnonymousExposureError";
    this.problems = problems;
  }
}

/** Throws in every mode, including development. */
export function assertAnonymousExposurePolicy(input: ProductionAuthPolicyInput): void {
  const problems = collectAnonymousExposureProblems(input);
  if (problems.length > 0) throw new AnonymousExposureError(problems);
}

/**
 * Throw unless this configuration is safe to serve production traffic.
 *
 * Outside `NODE_ENV=production` this is a no-op: local development is meant to
 * run without credentials, and the anonymous identity is the intended behaviour
 * there.
 */
export function assertProductionAuthPolicy(input: ProductionAuthPolicyInput): void {
  if (input.nodeEnv !== "production") return;
  const problems = collectProductionAuthProblems(input);
  if (problems.length > 0) throw new ProductionAuthPolicyError(problems);
}
