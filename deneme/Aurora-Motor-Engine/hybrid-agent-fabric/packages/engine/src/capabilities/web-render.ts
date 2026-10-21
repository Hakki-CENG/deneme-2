/**
 * web.render — a page as it looks after JavaScript has run.
 *
 * Aurora already has `web.fetch`, and it is good at what it does: bounded HTTP
 * with SSRF and redirect checks. But it is plain HTTP, so a page that builds
 * its content in the browser comes back as an empty shell. This capability is
 * the other thing: it drives a real headless Chromium through crawl4ai and
 * returns the rendered result as markdown.
 *
 * It is a separate capability rather than a change to `web.fetch`, because the
 * two have different costs and different risk. A headless browser is far more
 * expensive than a GET and has a far larger attack surface. A planner should be
 * able to choose the cheap one and reach for this only when the page needs it.
 *
 * Security, and where each check lives:
 *
 *   - The SSRF check runs HERE, before the subprocess starts, using
 *     `assertSafeUrl` from `capabilities/web.ts`. That function is already
 *     tested, rejects non-HTTP(S) schemes, rejects embedded credentials and
 *     blocks private-network targets. Reimplementing it in Python would put the
 *     same rule in two languages where nobody would notice them drifting.
 *
 *   - The redirect check is a POST-check, and this file says so rather than
 *     implying otherwise. crawl4ai exposes no redirect cap, so a public URL can
 *     redirect somewhere internal and the request will already have happened.
 *     What is possible is to inspect the final URL the worker reports and
 *     reject the result if the crawl ended up somewhere that `assertSafeUrl`
 *     would have refused. Prevention would be better; this is what is
 *     actually available.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { defineCapability } from "./schema.js";
import { assertSafeUrl } from "./web.js";
import type { CapabilityManifest } from "./manifest.js";
import { runSubprocessCapability } from "./external/subprocess-adapter.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const WEB_RENDER_WORKER_PATH = resolve(HERE, "../../external-workers/web_render.py");

/** Version measured when this capability was written. Pinned, not `latest`. */
export const CRAWL4AI_PINNED_VERSION = "0.9.5";

export const WEB_RENDER_MANIFEST: CapabilityManifest = {
  id: "web.render",
  version: "1.0.0",
  domain: ["web-retrieval", "research"],
  description:
    "Fetch a public URL in a real headless browser and return the rendered content as markdown. " +
    "Use web.fetch instead when the page does not need JavaScript.",
  executionMode: "subprocess",
  requiredPermissions: ["network.egress.public", "process.spawn"],
  networkPolicy: "allowlist",
  filesystemPolicy: "none",
  resourceLimits: { timeoutMs: 60_000, memoryMb: 1024 },
  healthCheck: "python3 -c 'import crawl4ai'",
  verifierIds: ["web.render.provenance"],
  benchmarks: [],
  provenance: {
    repository: "https://github.com/unclecode/crawl4ai",
    commit: CRAWL4AI_PINNED_VERSION,
    license: "Apache-2.0",
  },
  limitations: [
    "no redirect cap is available in crawl4ai, so the private-network check on the final URL is a post-check rather than prevention",
    "requires a Chromium binary and its system libraries to be installed",
    "extracts text as markdown; it does not preserve layout, tables or images",
    "far more expensive than web.fetch and should not be the default",
  ],
  fallbackCapabilityIds: ["web.fetch"],
};

export const WEB_RENDER_CAPABILITY_ID = WEB_RENDER_MANIFEST.id;

interface RenderedPage {
  url: string;
  markdown: string;
  truncated: boolean;
  statusCode: number | null;
  success: boolean;
}

function parseWorkerOutput(stdout: string): { ok: true; page: RenderedPage } | { ok: false; reason: string } {
  const trimmed = stdout.trim();
  if (trimmed === "") return { ok: false, reason: "the worker produced no output at all" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, reason: `the worker's output is not valid JSON: ${String(err)}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "the worker's output is not a JSON object" };
  }
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.url !== "string") return { ok: false, reason: "the result carries no url" };
  if (typeof candidate.markdown !== "string") {
    return { ok: false, reason: "the result carries no markdown" };
  }
  return {
    ok: true,
    page: {
      url: candidate.url,
      markdown: candidate.markdown,
      truncated: candidate.truncated === true,
      statusCode: typeof candidate.statusCode === "number" ? candidate.statusCode : null,
      success: candidate.success === true,
    },
  };
}

export function webRenderCapabilities() {
  return [
    defineCapability(
      {
        id: WEB_RENDER_CAPABILITY_ID,
        version: WEB_RENDER_MANIFEST.version,
        description:
          "Render a public URL in a headless browser and return markdown. Refuses private-network targets. " +
          "Returns status 'unavailable' if crawl4ai or Chromium is not installed.",
        risk: "network",
        sideEffect: false,
        source: "core",
        idempotency: "inherent",
      },
      z.object({
        url: z.string().url().max(2048),
        maxBytes: z.number().int().min(1).max(5_000_000).optional(),
        timeoutMs: z.number().int().min(1000).max(180_000).optional(),
      }),
      async ({ url, maxBytes, timeoutMs }) => {
        // SSRF check before anything is spawned. The same function web.fetch
        // uses, so both network capabilities enforce one contract.
        const safe = await assertSafeUrl(url);

        const run = await runSubprocessCapability(WEB_RENDER_MANIFEST, {
          command: "python3",
          args: [WEB_RENDER_WORKER_PATH],
          stdin: JSON.stringify({
            url: safe.toString(),
            maxBytes: maxBytes ?? 200_000,
            timeoutMs: timeoutMs ?? 30_000,
          }),
        });

        if (run.status === "unavailable") {
          return {
            status: "unavailable",
            reason: run.reason ?? "crawl4ai or Chromium could not be started",
            installed: false,
          };
        }

        const parsed = parseWorkerOutput(run.stdout);
        if (!parsed.ok) {
          return {
            status: run.status,
            installed: true,
            reason: parsed.reason,
            stderr: run.stderr.slice(0, 2000),
          };
        }

        // The post-check. crawl4ai cannot cap redirects, so a public URL may
        // have ended up somewhere internal. Refuse the result if it did.
        try {
          await assertSafeUrl(parsed.page.url);
        } catch (err) {
          return {
            status: "blocked",
            installed: true,
            reason:
              `the request started at a public URL but ended at '${parsed.page.url}', which the ` +
              `SSRF policy refuses: ${String(err instanceof Error ? err.message : err)}`,
          };
        }

        return {
          status: parsed.page.success ? run.status : "failed",
          installed: true,
          url: parsed.page.url,
          markdown: parsed.page.markdown,
          truncated: parsed.page.truncated,
          statusCode: parsed.page.statusCode,
          durationMs: run.durationMs,
        };
      },
      {
        idempotency: "inherent",
        output: z.object({
          status: z.string(),
          installed: z.boolean(),
          url: z.string().optional(),
          markdown: z.string().optional(),
          truncated: z.boolean().optional(),
          statusCode: z.number().nullable().optional(),
          reason: z.string().optional(),
          stderr: z.string().optional(),
          durationMs: z.number().optional(),
        }),
        /**
         * Provenance is the check that matters for a fetched page: the result
         * must name where it came from. Content without a source is a claim
         * nobody can follow, and this repo has removed enough of those already.
         */
        verify: async (output) => {
          const value = output as Record<string, unknown>;
          if (value.status === "unavailable") {
            return { ok: false, reason: "nothing was fetched, so there is no source to establish" };
          }
          if (value.status === "blocked") {
            return { ok: false, reason: String(value.reason ?? "the request was blocked by policy") };
          }
          if (typeof value.url !== "string" || value.url === "") {
            return { ok: false, reason: "the result does not name the URL it came from" };
          }
          if (typeof value.markdown !== "string") {
            return { ok: false, reason: "the result carries no content" };
          }
          if (value.markdown.trim() === "") {
            return {
              ok: false,
              reason:
                "the page rendered but produced no extractable text, which is not the same as " +
                "a page that was successfully read",
            };
          }
          return { ok: true, reason: `content is attributed to ${value.url}` };
        },
      },
    ),
  ];
}
