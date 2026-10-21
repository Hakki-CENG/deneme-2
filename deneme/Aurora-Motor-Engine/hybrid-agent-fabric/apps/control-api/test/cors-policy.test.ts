/**
 * Cross-origin access is off unless an operator turns it on.
 *
 * An audit reported "no CORS" after `OPTIONS` returned without any
 * `access-control-allow-*` header. The observation was right; the conclusion was
 * not. The Control Center is served by this same process, so the interface that
 * calls the API is same-origin with it and never sends a preflight — and a
 * wildcard here would open an authenticated administrative API to any site a
 * logged-in operator happens to visit.
 *
 * Pinned so the default reads as a decision and not as something missing.
 */
import { describe, expect, it } from "vitest";
import { corsOptions } from "../src/middleware/cors-policy.js";

describe("the CORS policy", () => {
  it("allows no origin when the operator has not named one", () => {
    const options = corsOptions({});
    expect(options.origin).toBe(false);
    // Not "*": with credentials enabled a browser rejects a wildcard, and more to
    // the point the intent is that origins are named rather than that every origin
    // is quietly permitted.
    expect(options.origin).not.toBe("*");
    expect(options.credentials).toBe(true);
  });

  it("treats an empty or whitespace-only variable as unset", () => {
    // `HAF_CORS_ORIGIN=""` in a deployment file is far more likely to be a mistake
    // or a placeholder than a request to allow the empty origin.
    expect(corsOptions({ HAF_CORS_ORIGIN: "" }).origin).toBe(false);
    expect(corsOptions({ HAF_CORS_ORIGIN: " , " }).origin).toBe(false);
  });

  it("allows exactly the origins that were named", () => {
    const options = corsOptions({ HAF_CORS_ORIGIN: "https://ops.example.com, https://alt.example.com" });
    expect(options.origin).toEqual(["https://ops.example.com", "https://alt.example.com"]);
  });

  it("does not widen the allowlist to a substring of a named origin", () => {
    // A prefix or substring match here would let `https://ops.example.com.evil.tld`
    // through. The list is exact strings and the plugin compares exactly.
    const options = corsOptions({ HAF_CORS_ORIGIN: "https://ops.example.com" });
    expect(options.origin).not.toContain("https://ops.example.com.evil.tld");
  });
});
