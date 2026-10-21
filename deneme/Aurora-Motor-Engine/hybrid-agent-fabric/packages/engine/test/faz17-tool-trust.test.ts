/**
 * FAZ 17 1/3 — approval is bound to what was advertised.
 *
 * The load-bearing cases are the `changed` ones: a server that gets a tool
 * approved and then quietly redefines it must not inherit the approval. Everything
 * else in this file is there to prove that rule does not also refuse the honest
 * cases.
 */

import { describe, expect, it } from "vitest";

import {
  decideToolTrust,
  denyTool,
  toolDescriptorDigest,
  verifyTool,
} from "../src/mcp/tool-trust.js";
import type { McpToolDescriptor } from "../src/mcp/stateless-mcp-client.js";

const SERVER = "ledger-server";

const search: McpToolDescriptor = {
  name: "search",
  description: "Search the read-only ledger index.",
  inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
};

const approved = verifyTool(SERVER, search, {
  verifiedBy: "reviewer",
  reason: "read-only index access, no writes, bounded query length",
  at: "2026-01-01T00:00:00.000Z",
});

describe("rule 1 — discovery is not verification", () => {
  it("refuses a tool that has never been verified", () => {
    const decision = decideToolTrust(SERVER, search, undefined);
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("unverified");
    expect(decision.reason).toContain("a claim by the server, not a measurement");
  });
});

describe("a verified tool that has not changed is allowed", () => {
  it("allows the call", () => {
    const decision = decideToolTrust(SERVER, search, approved);
    expect(decision.allowed).toBe(true);
    expect(decision.verdict).toBe("verified");
  });

  it("allows an identical descriptor rebuilt elsewhere", () => {
    // Same content, different object: the digest is over the content.
    const rebuilt: McpToolDescriptor = {
      name: "search",
      description: "Search the read-only ledger index.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    };
    expect(decideToolTrust(SERVER, rebuilt, approved).allowed).toBe(true);
  });
});

describe("rules 2 and 3 — a silent redefinition invalidates the approval", () => {
  it("refuses when the description changes", () => {
    const redefined: McpToolDescriptor = {
      ...search,
      description: "Search the ledger index and delete stale entries.",
    };
    const decision = decideToolTrust(SERVER, redefined, approved);
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("changed");
    expect(decision.reason).toContain("the approval does not carry over");
  });

  it("refuses when the input schema changes", () => {
    const widened: McpToolDescriptor = {
      ...search,
      inputSchema: { type: "object", properties: { query: { type: "string" }, rawSql: { type: "string" } } },
    };
    const decision = decideToolTrust(SERVER, widened, approved);
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("changed");
  });

  it("refuses when a previously absent description is added", () => {
    const bare: McpToolDescriptor = { name: "search" };
    const bareApproval = verifyTool(SERVER, bare, { verifiedBy: "reviewer", reason: "minimal tool" });
    const nowDocumented: McpToolDescriptor = { ...bare, description: "Now also writes." };
    expect(decideToolTrust(SERVER, nowDocumented, bareApproval).verdict).toBe("changed");
  });

  it("scopes the digest to the server, so one server's approval is not another's", () => {
    expect(toolDescriptorDigest(SERVER, search)).not.toBe(toolDescriptorDigest("other-server", search));
    const decision = decideToolTrust("other-server", search, approved);
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("changed");
  });
});

describe("rule 5 — a denial is not the same as never having looked", () => {
  it("keeps a denied tool denied and says why", () => {
    const denied = denyTool(SERVER, search, { reason: "the server asked for write access it does not need" });
    const decision = decideToolTrust(SERVER, search, denied);
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("denied");
    expect(decision.reason).toContain("write access it does not need");
  });

  it("refuses to record a denial with no reason", () => {
    expect(() => denyTool(SERVER, search, { reason: "   " })).toThrow(/must say why/);
  });
});

describe("an approval has to be attributable", () => {
  it("refuses a verification with no verifier", () => {
    expect(() => verifyTool(SERVER, search, { verifiedBy: "  ", reason: "looks fine" })).toThrow(/must name who/);
  });

  it("refuses a verification with no reason", () => {
    expect(() => verifyTool(SERVER, search, { verifiedBy: "reviewer", reason: "" })).toThrow(/must say why/);
  });

  it("records who verified it and when", () => {
    expect(approved.verifiedBy).toBe("reviewer");
    expect(approved.verifiedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(approved.descriptorDigest).toHaveLength(64);
  });
});

describe("a record that is neither verified nor denied does not pass", () => {
  it("refuses a record marked unverified", () => {
    const decision = decideToolTrust(SERVER, search, {
      ...approved,
      verdict: "unverified",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("unverified");
  });
});
