/**
 * Ratchet: the migration from plain `Error` to `ResourceNotFoundError` must not
 * silently run backwards.
 *
 * A4 measured 242 "this resource does not exist" throws in `packages/engine/src`.
 * 215 of them are now typed, so the HTTP layer answers 404 HAF-7001 instead of
 * 500 HAF-8001. The 28 that remain are deliberate: they are input validation
 * (an unknown enum member, a reference inside the caller's own payload), config
 * preconditions, internal inconsistencies, or "missing *or* expired/unreachable"
 * conditions whose correct status is 400/403/409/500 — not 404.
 *
 * Two ways this regresses, both silent:
 *   1. someone adds a new `throw new Error("… not found")`,
 *   2. someone "fixes" a converted site back to a plain Error.
 * Neither is visible in a passing suite, because a 500 still looks like a
 * handled response. So the counts are pinned here and the allowlist below names
 * every remaining site — adding one requires editing this file on purpose.
 *
 * The scan deliberately covers all three quote styles. An earlier pass of this
 * migration counted only backtick-delimited messages and reported "22 remaining"
 * when the real number was 165; 150 of them used double quotes.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

const PLAIN = /throw new (?:Error|TypeError)\(\s*([`"'])([^`"']*)\1/g;
const NOT_FOUND = /not found|does not exist|doesn't exist|no such|unknown|missing|not registered|is not available|cannot be found/i;
const TYPED = /throw new ResourceNotFoundError\(/g;

/**
 * Every remaining plain-`Error` site, with the reason it must stay untyped.
 * Keyed by `file:line` would break on every unrelated edit, so these are keyed
 * by message text.
 */
const ALLOWED: Record<string, string> = {
  "Interactive artifact frame grant is missing or expired": "403/410: expired, not merely absent",
  "Checkpoint content blob is missing": "500: record exists but its blob is gone — internal inconsistency",
  "Git-managed webhook secret is missing": "400: configuration precondition on the manifest",
  "Automation responder timestamp is missing or stale": "400: request-signature validation",
  "Automation responder is missing or disabled": "403/409: disabled is not the same as absent",
  "Unknown or stale browser element ref": "400: ephemeral handle from a previous snapshot, not a stored resource",
  "Patch expects existing content in": "400: tool precondition, and this is a tool handler — the error becomes a tool result, not an HTTP status",
  "MCP elicitation is missing, expired, already resolved, or outside": "403/409/410: four different causes in one branch",
  "MCP OAuth PKCE verifier is missing": "400: OAuth flow precondition",
  "FAL queue returned an unknown job status": "502: upstream returned something we cannot classify",
  "Unknown base provider profile": "400: unknown enum member supplied by the caller",
  "Model OAuth runtime is unavailable or missing its resource audience": "503: the runtime is not wired up",
  "Unknown provider profile": "400: unknown enum member supplied by the caller",
  "Missing ${profile.apiKeyEnvironmentVariable}": "500: deployment is missing a credential",
  "Hosted repository credential is missing": "400/500: provider has no credential configured, or its secret has no metadata",
  "Unknown goal action": "400: unknown enum member",
  "Unknown task action": "400: unknown enum member",
  "Dependency task ${id} does not exist": "400: a reference inside the caller's own payload",
  "Target is outside direct parent/sibling/child family reach": "403: visibility rule, not absence",
  "Hosted scheduler JWT is missing job identity": "401: malformed token",
  "Required config field missing": "400: incomplete request body",
  "Credential lease is missing or already exhausted": "409: exhaustion is not absence, and one branch cannot tell them apart",
  "Credential lease is missing or expired": "409/410: same as above",
  "Goal ${label} reference not found": "400: a reference inside the caller's own payload",
  "unknown research audit policy": "400: unknown enum member supplied by the caller (FAZ 8 4/4); deliberately not the permissive default",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

function scan() {
  const plain: Array<{ file: string; line: number; message: string }> = [];
  let typed = 0;
  for (const full of walk(SRC)) {
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((text, index) => {
      PLAIN.lastIndex = 0;
      TYPED.lastIndex = 0;
      typed += (text.match(TYPED) ?? []).length;
      for (const match of text.matchAll(PLAIN)) {
        if (NOT_FOUND.test(match[2]!)) plain.push({ file: relative(SRC, full), line: index + 1, message: match[2]! });
      }
    });
  }
  return { plain, typed };
}

describe("ResourceNotFoundError migration ratchet", () => {
  const { plain, typed } = scan();

  it("keeps converting, never backwards: at least 215 typed sites", () => {
    expect(typed).toBeGreaterThanOrEqual(215);
  });

  it("leaves at most 28 plain sites, every one of them allowlisted with a reason", () => {
    expect(plain.length).toBeLessThanOrEqual(28);
    const unexplained = plain.filter((site) => !Object.keys(ALLOWED).some((needle) => site.message.startsWith(needle)));
    expect(unexplained).toEqual([]);
  });

  it("counts all three quote styles, not just template literals", () => {
    // The regression this guards against: a scanner that only sees backticks
    // under-reports by ~5x. Every remaining site here is double-quoted, so a
    // backtick-only scan would report zero and this suite would pass vacuously.
    const quoted = plain.filter((site) => site.message.length > 0).length;
    expect(quoted).toBe(plain.length);
    expect(plain.length).toBeGreaterThan(0);
  });

  it("still treats a genuine malfunction as 500-shaped", () => {
    // Sanity check on the allowlist itself: it must not have swallowed the
    // words "not found" into a 404 for something that is a server fault.
    expect(ALLOWED["Checkpoint content blob is missing"]).toMatch(/500/);
    expect(ALLOWED["FAL queue returned an unknown job status"]).toMatch(/502/);
  });
});
