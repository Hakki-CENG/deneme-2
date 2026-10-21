/**
 * The Control Center's inline script must be permitted by the CSP that is sent.
 *
 * An independent audit found the UI unusable, and the cause was a policy
 * conflict rather than a bug in the page. The global security header sets
 * `script-src 'self'`; the page's only script is inline; a browser enforces the
 * intersection of a header policy and a `<meta>` policy, so the `<meta>` in the
 * HTML allowing `'unsafe-inline'` did not help. The script never ran and every
 * panel stayed at "connecting…".
 *
 * The fix permits that one script by SHA-256 hash. These tests pin the property
 * that matters rather than the hash value: whatever the page serves, the policy
 * must allow it. A test asserting a literal hash would pass while the script
 * drifted, which is exactly the silent failure this caused in the first place.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { DASHBOARD_SCRIPT_CSP, dashboardHtml } from "../src/dashboard.js";
import { DEFAULT_CONFIG, withScriptSources } from "../src/middleware/security-headers.js";

function extractInlineScripts(html: string): string[] {
  const bodies: string[] = [];
  const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) bodies.push(match[1] ?? "");
  return bodies;
}

function hashOf(body: string): string {
  return `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
}

describe("the dashboard's inline script is permitted by the policy", () => {
  it("the page has exactly one inline script", () => {
    // If this ever becomes two, the CSP needs both hashes and this suite should
    // fail loudly rather than quietly permit one of them.
    expect(extractInlineScripts(dashboardHtml)).toHaveLength(1);
  });

  it("the exported source expression is the hash of that script", () => {
    const [body] = extractInlineScripts(dashboardHtml);
    expect(DASHBOARD_SCRIPT_CSP).toBe(hashOf(body!));
    // Asserted by decoding rather than by a character-class regex: the shape of
    // a base64 digest is better checked by round-tripping it. (The first version
    // of this line had a typo'd character class that made the whole file fail to
    // parse, which vitest reported as "no tests" rather than as an error.)
    expect(DASHBOARD_SCRIPT_CSP.startsWith("'sha256-")).toBe(true);
    const digest = DASHBOARD_SCRIPT_CSP.slice("'sha256-".length, -1);
    const decoded = Buffer.from(digest, "base64");
    expect(decoded.length).toBe(32);
    expect(decoded.toString("base64")).toBe(digest);
  });

  it("the default policy does not allow inline scripts on its own", () => {
    // The condition that broke the page. Pinned so a future tightening cannot
    // reintroduce it unnoticed in the other direction either.
    const scriptSrc = /script-src\s([^;]*)/.exec(DEFAULT_CONFIG.csp)?.[1] ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("the policy the server actually sends permits the page's script", () => {
    const csp = withScriptSources(DEFAULT_CONFIG.csp, [DASHBOARD_SCRIPT_CSP]);
    const scriptSrc = /script-src\s([^;]*)/.exec(csp)?.[1] ?? "";
    const allowed = scriptSrc.split(/\s+/).filter(Boolean);

    for (const body of extractInlineScripts(dashboardHtml)) {
      expect(allowed, `script not permitted: ${body.slice(0, 40)}…`).toContain(hashOf(body));
    }
    // And it must not have been loosened to get there.
    expect(allowed).not.toContain("'unsafe-inline'");
  });
});

describe("withScriptSources does not damage the rest of the policy", () => {
  it("adds to an existing script-src without dropping its other sources", () => {
    const out = withScriptSources("default-src 'self'; script-src 'self'; img-src 'self'", [
      "'sha256-abc'",
    ]);
    expect(out).toContain("script-src 'self' 'sha256-abc'");
    expect(out).toContain("default-src 'self'");
    expect(out).toContain("img-src 'self'");
  });

  it("does not duplicate a source that is already present", () => {
    const out = withScriptSources("script-src 'self' 'sha256-abc'", ["'sha256-abc'"]);
    expect(out).toBe("script-src 'self' 'sha256-abc'");
  });

  it("appends a script-src when the policy has none", () => {
    const out = withScriptSources("default-src 'none';", ["'sha256-abc'"]);
    expect(out).toBe("default-src 'none'; script-src 'sha256-abc'");
  });

  it("returns the policy unchanged when there is nothing to add", () => {
    const csp = "default-src 'self'; script-src 'self'";
    expect(withScriptSources(csp, [])).toBe(csp);
    expect(withScriptSources(csp, ["", "  "])).toBe(csp);
  });
});
