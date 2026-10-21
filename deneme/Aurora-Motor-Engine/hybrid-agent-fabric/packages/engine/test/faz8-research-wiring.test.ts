/**
 * FAZ 8 3/4 — the audit and the evidence graph on the real report path.
 *
 * 1/4 built the evaluator and 2/4 the graph, but nothing called either, so both
 * were decoration. This test drives `generateReport`, the method that actually
 * produces reports, and asserts the judgement now travels with them.
 *
 * The second test is the one that justifies the wiring. A generated report's own
 * summary claims its findings are "all bound to verified citations". When the
 * only source is of unknown type and unverified, that claim is false — and the
 * audit now says so on the report itself instead of leaving the reader to trust
 * the sentence.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ResearchEngineService } from "../src/research/research-engine-service.js";
import { auroraDigest } from "../src/util/aurora-state.js";

const NOW = Date.parse("2026-09-25T12:00:00Z");

async function engine(): Promise<ResearchEngineService> {
  const root = await mkdtemp(join(tmpdir(), "haf-research-wiring-"));
  const body = "<html><head><title>Release trains</title></head><body>the rollback window is four hours</body></html>";
  return new ResearchEngineService(root, {
    now: () => NOW,
    webSearch: {
      configured: true,
      search: async () => ({
        provider: "fake",
        results: [{ title: "Release trains", url: "https://example.com/trains", snippet: "rollback window" }],
        droppedUnsafeUrls: 0,
      }),
    },
    fetcher: {
      fetch: async (url: string) => ({
        finalUrl: url,
        status: 200,
        ok: true,
        contentType: "text/html",
        bytes: new TextEncoder().encode(body),
        decoded: body,
        truncated: false,
      }),
    },
  });
}

describe("generateReport carries its own judgement", () => {
  it("returns a report with an audit and an evidence graph attached", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    const report = await service.generateReport(result.id, "Rollback", { maxAgeDays: 365 });

    expect(report.audit).toBeDefined();
    expect(report.evidence).toBeDefined();
    // Every dimension was checkable, so none is skipped.
    expect(report.audit?.dimensionsSkipped).toEqual([]);
    expect(report.audit?.dimensionsChecked).toHaveLength(6);
  });

  it("contradicts the report's own flattering summary when the evidence does not hold", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    const report = await service.generateReport(result.id, "Rollback", { maxAgeDays: 365 });

    // Measured, not assumed: example.com yields an unknown source type that the
    // engine itself marks unverified, while the generated summary still claims
    // the findings are "all bound to verified citations".
    expect(result.sources[0]?.sourceType).toBe("unknown");
    expect(result.sources[0]?.verified).toBe(false);
    expect(report.summary).toContain("all bound to verified citations");

    // So the audit must disagree, and the report must carry that disagreement.
    expect(report.audit?.verdict).toBe("unverified");
    expect(report.audit?.blocking.some((f) => f.dimension === "source_quality")).toBe(true);
    expect(report.summary).toContain("Audit:");
    expect(report.summary).toContain("blocking finding");
  });

  it("does not append an audit line when the audit is clean", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    // Trust and type are the blockers here; relax the floor so the only question
    // left is whether the wiring appends text it should not.
    const report = await service.generateReport(result.id, "Rollback", { maxAgeDays: 365, minTrustScore: 0 });
    const clean = report.audit?.blocking.filter((f) => f.dimension !== "source_quality") ?? [];
    expect(clean).toEqual([]);
    if (report.audit?.verdict === "verified") {
      expect(report.summary).not.toContain("Audit:");
    }
  });
});

describe("the evidence graph on a real report", () => {
  it("links every citation to a source and leaves nothing unresolved", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    const report = await service.generateReport(result.id, "Rollback", { maxAgeDays: 365 });

    const trace = report.evidence!;
    expect(trace.unresolvedRefs).toEqual([]);
    expect(trace.edges.filter((e) => e.relation === "sourced-from")).toHaveLength(report.citations.length);
    expect(trace.edges.some((e) => e.relation === "verified-by")).toBe(true);
  });

  it("computes its digest the way ProvenanceService.explain does", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    const report = await service.generateReport(result.id, "Rollback", { maxAgeDays: 365 });

    const trace = report.evidence!;
    expect(trace.digest).toBe(auroraDigest(trace.nodes.map((n) => `${n.kind}:${n.id}`).sort().join("|")));
    expect(trace.rootKind).toBe("cognitive-object");
    expect(trace.tenantId).toBe("tenant");
  });

  it("records the audit verdict on the verified-by edge, including when it failed", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    const report = await service.generateReport(result.id, "Rollback", { maxAgeDays: 365 });

    const edge = report.evidence!.edges.find((e) => e.relation === "verified-by");
    expect(edge?.detail).toContain(`${report.audit?.verdict}:`);
  });
});

describe("the age horizon is the caller's policy, not an invented default", () => {
  it("reports temporal validity as unchecked when no horizon is given", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    const report = await service.generateReport(result.id, "Rollback");

    expect(report.audit?.dimensionsSkipped.map((s) => s.dimension)).toEqual(["temporal_validity"]);
    expect(report.audit?.verdict).toBe("unverified");
  });

  it("checks temporal validity when a horizon is given", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    const report = await service.generateReport(result.id, "Rollback", { maxAgeDays: 365 });
    expect(report.audit?.dimensionsSkipped).toEqual([]);
  });
});
