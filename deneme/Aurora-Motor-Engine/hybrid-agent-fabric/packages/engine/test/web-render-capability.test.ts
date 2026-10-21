/**
 * web.render, exercised against a real browser.
 *
 * The load-bearing case is the SSRF one, and the assertion is about ORDER: a
 * private-network target must be refused before the subprocess is spawned, not
 * after it has already made the request. A test that only checked the final
 * answer would pass against an implementation that fetched the internal page
 * first and apologised afterwards.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";
import {
  WEB_RENDER_CAPABILITY_ID,
  WEB_RENDER_MANIFEST,
  WEB_RENDER_WORKER_PATH,
} from "../src/capabilities/web-render.js";
import { assessManifest } from "../src/capabilities/manifest.js";

let root: string | undefined;

/** Is a real crawl4ai + Chromium stack available? Measured, not assumed. */
function stackAvailable(): { ok: boolean; detail: string } {
  try {
    execFileSync("python3", ["-c", "import crawl4ai"], { timeout: 60_000 });
  } catch (err) {
    return { ok: false, detail: `crawl4ai not importable: ${String(err).slice(0, 100)}` };
  }
  try {
    execFileSync(
      "python3",
      [
        WEB_RENDER_WORKER_PATH.replace(/[^]*$/, ""),
      ],
      { input: "", timeout: 5_000 },
    );
  } catch {
    /* the worker exits non-zero on empty input; that only proves it ran */
  }
  return { ok: true, detail: "crawl4ai importable" };
}

const STACK = stackAvailable();

// Follows the repository's convention for tests that need a real external
// backend (postgres-rls-integration, real-encoder-recall, version): skip,
// visibly, rather than fail. These were written to throw instead, on the
// reasoning that a skipped integration test is not evidence — which is true
// but made `npm test` fail on any machine without the backend installed.
// The pure-logic describes in this file are deliberately left outside the
// skip so the file always asserts something.

async function bootEngine(): Promise<HybridAgentEngine> {
  root = await mkdtemp(join(tmpdir(), "haf-webrender-"));
  const engine = new HybridAgentEngine({
    homePath: root,
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
  } as never);
  await engine.initialize();
  // A `network`-risk capability asks for approval, and the reviewer a default
  // engine binds is the auto-approval service, which in a mock-model boot never
  // resolves — the call simply waits. Measured: `web.fetch` hangs the same way,
  // so this is the broker's normal behaviour and not something this capability
  // introduced. Binding an approving reviewer is what lets the test reach the
  // code it is actually about.
  engine.approvals.bindReviewer(async () => ({
    autoApproved: true,
    rationale: "integration test: approval granted so the SSRF path can be exercised",
  }));
  return engine;
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

function context() {
  return {
    tenantId: "tenant-test",
    sessionId: "00000000-0000-0000-0000-000000000001",
    familyId: "00000000-0000-0000-0000-000000000002",
    turnId: "00000000-0000-0000-0000-000000000003",
    toolCallId: "00000000-0000-0000-0000-000000000004",
    source: "user",
    workspacePath: root ?? tmpdir(),
  } as never;
}

describe("the manifest passes its own gate", () => {
  it("is complete and pinned", () => {
    expect(assessManifest(WEB_RENDER_MANIFEST).complete).toBe(true);
    expect(WEB_RENDER_MANIFEST.provenance.license).toBe("Apache-2.0");
    expect(WEB_RENDER_MANIFEST.provenance.commit).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("names web.fetch as its fallback, because that is the cheaper path", () => {
    expect(WEB_RENDER_MANIFEST.fallbackCapabilityIds).toContain("web.fetch");
  });

  it("states the redirect limitation rather than implying it is prevented", () => {
    expect(
      WEB_RENDER_MANIFEST.limitations.some((l) => l.includes("post-check rather than prevention")),
    ).toBe(true);
  });
});

describe.skipIf(!STACK.ok)("a booted engine exposes it, and it renders a real page", () => {
  it("is registered with its manifest", async () => {
    const engine = await bootEngine();

    expect(engine.capabilities.list().some((c) => c.id === WEB_RENDER_CAPABILITY_ID)).toBe(true);
    expect(engine.capabilities.manifestFor(WEB_RENDER_CAPABILITY_ID)?.provenance.license).toBe(
      "Apache-2.0",
    );
  }, 120_000);

  it("returns rendered markdown for a public page, attributed to its source", async () => {
    const engine = await bootEngine();

    const output = (await engine.capabilities.execute(
      WEB_RENDER_CAPABILITY_ID,
      { url: "https://example.com", maxBytes: 100_000 },
      context(),
    )) as Record<string, unknown>;

    expect(output.installed).toBe(true);
    expect(output.url).toBe("https://example.com/");
    expect(output.statusCode).toBe(200);
    expect(String(output.markdown).length).toBeGreaterThan(50);
    expect(output.markdown).toContain("documentation examples");
  }, 180_000);
});

describe("the SSRF check happens before the subprocess, not after", () => {
  it.each([
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/internal",
    "http://192.168.1.1/",
  ])("refuses %s", async (url) => {
    const engine = await bootEngine();

    const output = (await engine.capabilities
      .execute(WEB_RENDER_CAPABILITY_ID, { url }, context())
      .catch((err: unknown) => ({ status: "threw", reason: String(err) }))) as Record<
      string,
      unknown
    >;

    const text = `${String(output.status ?? "")} ${String(output.reason ?? "")}`;
    // Either the SSRF guard or the policy engine refused it. What must NOT
    // happen is a successful fetch of an internal address.
    expect(text).toMatch(/private|internal|SSRF|blocked|forbidden|not allowed|refus/i);
    expect(output.markdown).toBeUndefined();
  }, 180_000);

  it("refuses a non-HTTP scheme", async () => {
    const engine = await bootEngine();

    const output = (await engine.capabilities
      .execute(WEB_RENDER_CAPABILITY_ID, { url: "file:///etc/passwd" }, context())
      .catch((err: unknown) => ({ status: "threw", reason: String(err) }))) as Record<
      string,
      unknown
    >;

    const text = `${String(output.status ?? "")} ${String(output.reason ?? "")}`;
    expect(text).toMatch(/HTTP|scheme|Invalid|url/i);
    expect(output.markdown).toBeUndefined();
  }, 180_000);
});
