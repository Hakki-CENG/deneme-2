/**
 * FAZ 17 wiring — an unverified tool no longer reaches the server.
 *
 * `decideToolTrust` existed but nothing called it, so a discovered tool was
 * callable: the rule "calling unverified is refused, not warned" was true of the
 * decision function and false of the client. These tests drive the real client
 * against a real HTTP server and assert on what the server saw, because "the call
 * was refused" is only proven if `tools/call` never arrived.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { MCP_STATELESS_REVISION, StatelessMcpClient, ToolNotTrustedError } from "../src/mcp/stateless-mcp-client.js";
import { toolDescriptorDigest, type ToolTrustRecord } from "../src/mcp/tool-trust.js";

interface Recorded {
  method: string;
  body: { method: string; id?: string; params?: Record<string, unknown> };
}

const DESCRIPTOR = {
  name: "search",
  description: "Search the index",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
};

async function server(tools: unknown[] = [DESCRIPTOR]): Promise<{ url: string; server: Server; seen: Recorded[] }> {
  const seen: Recorded[] = [];
  const http = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      seen.push({ method: body.method, body });
      const result =
        body.method === "tools/list"
          ? { tools }
          : body.method === "tools/call"
            ? { content: [{ type: "text", text: "ok" }] }
            : { protocolVersion: MCP_STATELESS_REVISION, serverInfo: { name: "demo", version: "1.0.0" }, capabilities: { tools: {} } };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}/mcp`, server: http, seen };
}

let open: Server[] = [];
afterEach(async () => {
  for (const server of open) await new Promise<void>((resolve) => server.close(() => resolve()));
  open = [];
});

function verifiedRecord(descriptor: typeof DESCRIPTOR, serverName = "demo"): ToolTrustRecord {
  return {
    server: serverName,
    name: descriptor.name,
    descriptorDigest: toolDescriptorDigest(serverName, descriptor),
    verdict: "verified",
    reason: "approved in test",
  };
}

describe("a gated client refuses an unverified tool before it reaches the server", () => {
  it("throws and never sends tools/call", async () => {
    const { url, server: http, seen } = await server();
    open.push(http);

    const client = new StatelessMcpClient({
      endpoint: url,
      allowPlainHttp: true,
      trustGate: { server: "demo", recordFor: () => undefined },
    });
    expect(client.isTrustGated).toBe(true);

    await expect(client.callTool({ name: "search", arguments: { query: "x" } })).rejects.toBeInstanceOf(
      ToolNotTrustedError,
    );
    // The point of the whole phase: the refusal happens here, not in the server.
    expect(seen.some((request) => request.method === "tools/call")).toBe(false);
  });

  it("names the verdict so a caller can tell unverified from changed", async () => {
    const { url, server: http } = await server();
    open.push(http);
    const client = new StatelessMcpClient({
      endpoint: url,
      allowPlainHttp: true,
      trustGate: { server: "demo", recordFor: () => undefined },
    });

    await client.callTool({ name: "search" }).catch((error: ToolNotTrustedError) => {
      expect(error.verdict).toBe("unverified");
      expect(error.message).toContain("discovery is a claim by the server");
    });
  });

  it("refuses a descriptor that changed since it was verified", async () => {
    const { url, server: http, seen } = await server([
      { ...DESCRIPTOR, description: "Search the index, and also read your files" },
    ]);
    open.push(http);

    const client = new StatelessMcpClient({
      endpoint: url,
      allowPlainHttp: true,
      // Verified against the ORIGINAL description; the server now advertises
      // something else.
      trustGate: { server: "demo", recordFor: () => verifiedRecord(DESCRIPTOR) },
    });

    await client.callTool({ name: "search" }).catch((error: ToolNotTrustedError) => {
      expect(error.verdict).toBe("changed");
    });
    expect(seen.some((request) => request.method === "tools/call")).toBe(false);
  });

  it("refuses a tool the server no longer lists", async () => {
    const { url, server: http, seen } = await server([]);
    open.push(http);

    const client = new StatelessMcpClient({
      endpoint: url,
      allowPlainHttp: true,
      trustGate: { server: "demo", recordFor: () => verifiedRecord(DESCRIPTOR) },
    });

    await client.callTool({ name: "search" }).catch((error: ToolNotTrustedError) => {
      expect(error.verdict).toBe("unverified");
      expect(error.message).toContain("not in the tool list");
    });
    expect(seen.some((request) => request.method === "tools/call")).toBe(false);
  });
});

describe("a gated client lets a verified tool through", () => {
  it("sends tools/call once the descriptor matches what was approved", async () => {
    const { url, server: http, seen } = await server();
    open.push(http);

    const client = new StatelessMcpClient({
      endpoint: url,
      allowPlainHttp: true,
      trustGate: { server: "demo", recordFor: () => verifiedRecord(DESCRIPTOR) },
    });

    await client.callTool({ name: "search", arguments: { query: "x" } });
    expect(seen.some((request) => request.method === "tools/call")).toBe(true);
  });

  it("covers callToolInteractive too, which delegates to callTool", async () => {
    const { url, server: http, seen } = await server();
    open.push(http);

    const client = new StatelessMcpClient({
      endpoint: url,
      allowPlainHttp: true,
      trustGate: { server: "demo", recordFor: () => undefined },
    });

    await expect(client.callToolInteractive({ name: "search" })).rejects.toBeInstanceOf(ToolNotTrustedError);
    expect(seen.some((request) => request.method === "tools/call")).toBe(false);
  });
});

describe("an ungated client is unchanged, and says it is ungated", () => {
  it("still calls the tool and reports that it is not gated", async () => {
    const { url, server: http, seen } = await server();
    open.push(http);

    const client = new StatelessMcpClient({ endpoint: url, allowPlainHttp: true });
    expect(client.isTrustGated).toBe(false);

    await client.callTool({ name: "search", arguments: { query: "x" } });
    expect(seen.some((request) => request.method === "tools/call")).toBe(true);
  });
});
