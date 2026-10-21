/**
 * A keyless web-search backend.
 *
 * `web.search` had two providers and both needed an API key, so on a machine with
 * none the capability had no backend at all. SearXNG is a meta-search engine an
 * operator can run, and its HTTP API needs no key.
 *
 * What is and is not verified here, stated up front: public SearXNG instances were
 * tried and do not serve JSON — one answered HTML with HTTP 200, one returned 403,
 * one would not connect — so there is no live instance to test against. These cases
 * drive the provider over a real local HTTP server that speaks the documented
 * response shape. That verifies the adapter: the request it builds, the rows it
 * maps, and how it answers a misconfigured instance. It does not verify any
 * particular public deployment.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SearxngSearchProvider } from "../src/web/web-search.js";

let server: Server;
let baseUrl = "";
/** What the last request looked like, so the query building can be asserted. */
let lastRequest: { url?: string; accept?: string | undefined; userAgent?: string | undefined } = {};
/** Set per case to choose what the fake instance answers. */
let mode: "json" | "html" | "notfound" | "garbage" = "json";

beforeAll(async () => {
  server = createServer((request, reply) => {
    lastRequest = {
      url: request.url,
      accept: request.headers.accept,
      userAgent: request.headers["user-agent"],
    };
    if (mode === "html") {
      reply.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      reply.end("<!doctype html><html><body>results</body></html>");
      return;
    }
    if (mode === "notfound") {
      reply.writeHead(404, { "content-type": "text/plain" });
      reply.end("nope");
      return;
    }
    if (mode === "garbage") {
      reply.writeHead(200, { "content-type": "application/json" });
      reply.end("{not json");
      return;
    }
    reply.writeHead(200, { "content-type": "application/json" });
    reply.end(
      JSON.stringify({
        results: [
          { url: "https://example.org/a", title: "First result", content: "About the first.", publishedDate: "2026-01-02" },
          { url: "https://example.org/b", title: "Second result", content: "About the second." },
          // Rows without a usable title or url must not become results.
          { url: "", title: "No url", content: "x" },
          { url: "https://example.org/c", title: "", content: "y" },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("the SearXNG provider", () => {
  it("maps the documented response shape", async () => {
    mode = "json";
    const provider = new SearxngSearchProvider({ baseUrl });
    const results = await provider.search({ query: "aurora borealis", count: 10 });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "First result",
      url: "https://example.org/a",
      snippet: "About the first.",
      publishedAt: "2026-01-02",
    });
    // No publishedDate means the field is absent, not empty.
    expect(results[1] && "publishedAt" in results[1]).toBe(false);
  });

  it("asks for JSON and passes the query through", async () => {
    mode = "json";
    const provider = new SearxngSearchProvider({ baseUrl, userAgent: "aurora-test/1.0" });
    await provider.search({ query: "aurora borealis", count: 5, freshness: "week" });

    const url = new URL(lastRequest.url ?? "", baseUrl);
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("q")).toBe("aurora borealis");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("time_range")).toBe("week");
    expect(lastRequest.accept).toContain("application/json");
    expect(lastRequest.userAgent).toBe("aurora-test/1.0");
  });

  it("honours the requested count", async () => {
    mode = "json";
    const provider = new SearxngSearchProvider({ baseUrl });
    expect(await provider.search({ query: "q", count: 1 })).toHaveLength(1);
  });

  it("reports a JSON-disabled instance as a configuration problem, not as no results", async () => {
    // The failure mode that was measured on public instances: HTTP 200 with an
    // HTML page. Returning an empty list here would tell an operator their query
    // found nothing when in fact nothing was ever searched.
    mode = "html";
    const provider = new SearxngSearchProvider({ baseUrl });
    const error = await provider.search({ query: "q", count: 5 }).then(
      () => undefined,
      (thrown: unknown) => thrown as Error,
    );
    expect(error?.message).toContain("HTML instead of JSON");
    expect(error?.message).toContain("search.formats");
  });

  it("surfaces an HTTP failure rather than swallowing it", async () => {
    mode = "notfound";
    const provider = new SearxngSearchProvider({ baseUrl });
    await expect(provider.search({ query: "q", count: 5 })).rejects.toThrow(/HTTP 404/);
  });

  it("says when a body claiming to be JSON is not", async () => {
    mode = "garbage";
    const provider = new SearxngSearchProvider({ baseUrl });
    await expect(provider.search({ query: "q", count: 5 })).rejects.toThrow(/not valid JSON/);
  });

  it("refuses an unconfigured base URL with a message about configuration", async () => {
    // A whitespace-only value used to reach `fetch` and come back as "Failed to
    // parse URL" — an error about URL syntax where the real problem is that
    // nothing was configured.
    await expect(
      new SearxngSearchProvider({ baseUrl: "  " }).search({ query: "q", count: 5 }),
    ).rejects.toThrow(/needs a baseUrl/);
    await expect(
      new SearxngSearchProvider({ baseUrl: "search.internal" }).search({ query: "q", count: 5 }),
    ).rejects.toThrow(/absolute http/);
  });
});
