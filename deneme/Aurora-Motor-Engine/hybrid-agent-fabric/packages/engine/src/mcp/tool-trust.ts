/**
 * FAZ 17 1/3 — a tool discovered from an external server is an unverified claim
 * with an interface until something checks it.
 *
 * Measured first. The MCP layer is substantial: stateless-mcp-client.ts (559 lines)
 * with `discover`, `listTools`, `callTool`, `callToolInteractive`, `awaitTask`,
 * `listen`; a registry; an OAuth provider; an elicitation service — 17 files
 * mention MCP. `callTool` has real input hygiene: bounded requestState, bounded
 * inputResponses, shape checks on what the server sends back.
 *
 * What neither the client nor the registry has is any notion of trust. The words
 * verify, allowlist, trust and approve appear in **zero** places across both. So
 * `listTools` returns whatever the server advertises and `callTool` will call any
 * of it. The bounds protect against a malformed response; they do not answer
 * whether this tool should be callable at all.
 *
 * That is FAZ 17's missing piece, and it is the piece the other four depend on:
 * tool discovery already works, tool generation would only multiply the number of
 * unverified tools, and a plugin system widens the surface. Verification is what
 * makes any of them safe to have.
 *
 * Five rules:
 *
 *   1. A discovered tool is `unverified`. Discovery is not verification — a
 *      server describing a tool is a claim by the server, not a measurement.
 *   2. Verification is bound to a digest of what was advertised, not to the name.
 *      Approving `search` and then having the server redefine `search` must not
 *      inherit the approval; that substitution is the whole attack.
 *   3. A descriptor that changed since verification is `changed`, which is treated
 *      as unverified. A silent schema swap after approval is invisible otherwise.
 *   4. Calling an unverified tool is refused, not warned about. A warning in a log
 *      is not a control.
 *   5. Denial is explicit, recorded with a reason, and is not the same state as
 *      never-having-been-looked-at.
 */

import { createHash } from "node:crypto";
import type { McpToolDescriptor } from "./stateless-mcp-client.js";

export type ToolTrustVerdict = "verified" | "unverified" | "changed" | "denied";

export interface ToolTrustRecord {
  readonly server: string;
  readonly name: string;
  /** Digest of the descriptor that was verified. Empty when never verified. */
  readonly descriptorDigest: string;
  readonly verdict: ToolTrustVerdict;
  readonly reason: string;
  readonly verifiedAt?: string;
  readonly verifiedBy?: string;
}

/**
 * Digests a tool descriptor.
 *
 * Over the name, description and input schema together, because all three are part
 * of what was approved. A tool whose description changes what it says it does has
 * changed, even if its schema is identical — the description is how a caller
 * decides to use it.
 */
export function toolDescriptorDigest(server: string, descriptor: McpToolDescriptor): string {
  const canonical = JSON.stringify({
    server,
    name: descriptor.name,
    description: descriptor.description ?? null,
    inputSchema: descriptor.inputSchema ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface ToolTrustDecision {
  readonly allowed: boolean;
  readonly verdict: ToolTrustVerdict;
  readonly reason: string;
}

/**
 * Decides whether a tool may be called, given what has been verified.
 *
 * Pure and side-effect free so the decision can be tested without a server, and so
 * the caller — which owns the record store — decides what to persist.
 */
export function decideToolTrust(
  server: string,
  descriptor: McpToolDescriptor,
  record: ToolTrustRecord | undefined,
): ToolTrustDecision {
  const digest = toolDescriptorDigest(server, descriptor);

  if (record === undefined) {
    return {
      allowed: false,
      verdict: "unverified",
      reason: `"${descriptor.name}" from ${server} has never been verified; discovery is a claim by the server, not a measurement`,
    };
  }

  if (record.verdict === "denied") {
    return {
      allowed: false,
      verdict: "denied",
      reason: `"${descriptor.name}" from ${server} was denied: ${record.reason}`,
    };
  }

  if (record.descriptorDigest !== digest) {
    return {
      allowed: false,
      verdict: "changed",
      reason:
        `"${descriptor.name}" from ${server} no longer matches what was verified — ` +
        `the server has changed the name, description or input schema since approval, so the approval does not carry over`,
    };
  }

  if (record.verdict !== "verified") {
    return {
      allowed: false,
      verdict: "unverified",
      reason: `"${descriptor.name}" from ${server} is recorded as ${record.verdict}, not verified`,
    };
  }

  return { allowed: true, verdict: "verified", reason: `"${descriptor.name}" from ${server} matches the verified descriptor` };
}

/**
 * Produces the record a verifier should store after approving a tool.
 *
 * Requires a verifier identity and a reason, because an approval nobody can
 * attribute and nobody explained is not auditable — and the point of binding the
 * approval to a digest is that someone can later ask who made it and why.
 */
export function verifyTool(
  server: string,
  descriptor: McpToolDescriptor,
  input: { verifiedBy: string; reason: string; at?: string },
): ToolTrustRecord {
  const verifiedBy = input.verifiedBy.trim();
  if (verifiedBy.length === 0) {
    throw new Error("A tool verification must name who verified it.");
  }
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new Error("A tool verification must say why the tool was accepted.");
  }
  return {
    server,
    name: descriptor.name,
    descriptorDigest: toolDescriptorDigest(server, descriptor),
    verdict: "verified",
    reason,
    verifiedAt: input.at ?? new Date().toISOString(),
    verifiedBy,
  };
}

/**
 * Records a denial.
 *
 * Kept distinct from "never verified" because the two mean different things: an
 * unverified tool may become verified later, a denied one should not quietly come
 * back because a server re-advertised it under the same name.
 */
export function denyTool(server: string, descriptor: McpToolDescriptor, input: { reason: string }): ToolTrustRecord {
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new Error("A tool denial must say why the tool was refused.");
  }
  return {
    server,
    name: descriptor.name,
    descriptorDigest: toolDescriptorDigest(server, descriptor),
    verdict: "denied",
    reason,
  };
}
