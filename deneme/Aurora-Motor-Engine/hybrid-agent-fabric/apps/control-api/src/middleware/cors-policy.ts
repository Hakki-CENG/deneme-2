/**
 * Which origins may call the Control API from a browser.
 *
 * An audit reported "no CORS" after finding that `OPTIONS` came back without any
 * `access-control-allow-*` header. The observation was correct and the conclusion
 * was not: cross-origin access is **off unless an operator turns it on**, and the
 * absence of headers is that decision being enforced rather than a missing
 * feature. The Control Center is served by this same process, so the interface
 * that needs to call the API is same-origin with it and never sends a preflight.
 *
 * It is written down and tested because a secure default that looks like an
 * oversight gets "fixed" by someone who has not read this, and the fix is to
 * open the API to every site a user might visit while authenticated.
 */
import type { FastifyCorsOptions } from "@fastify/cors";

/**
 * Build the CORS options from the environment.
 *
 * `HAF_CORS_ORIGIN` is a comma-separated allowlist. Absent or empty means no
 * origin is allowed, which produces `origin: false` — the plugin then adds no
 * headers at all, which is what a browser needs to see in order to block the
 * request.
 */
export function corsOptions(env: NodeJS.ProcessEnv = process.env): FastifyCorsOptions {
  const configured = env.HAF_CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  return {
    // `false`, not `"*"`. A wildcard would be the convenient answer and the wrong
    // one: with `credentials: true` a browser rejects `"*"` anyway, and the
    // intent here is that an operator names the origins, not that every origin is
    // quietly permitted.
    origin: configured.length > 0 ? configured : false,
    credentials: true,
  };
}
