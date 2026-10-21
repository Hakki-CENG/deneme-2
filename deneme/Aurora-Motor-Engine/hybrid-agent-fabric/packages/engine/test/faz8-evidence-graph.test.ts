/**
 * FAZ 8 2/4 — the evidence graph, on the provenance vocabulary.
 *
 * The tests that matter are the four about not letting the graph flatter the
 * report: an unresolved link is recorded rather than dropped, a failed audit is
 * written onto the edge, a source's defect travels with its node, and no edge is
 * invented.
 */

import { describe, expect, it } from "vitest";

import { auroraDigest } from "../src/util/aurora-state.js";
import { researchEvidenceTrace, sourcesSupportingClaim } from "../src/research/research-evidence-graph.js";
import { auditResearchReport } from "../src/research/research-report-audit.js";
import type { ResearchReport, ResearchSource } from "../src/research/research-engine-service.js";

function source(fields: Partial<ResearchSource> = {}): ResearchSource {
  return {
    id: "s1",
    url: "https://example.org/a",
    title: "A study",
    snippet: "…",
    sourceType: "academic",
    trustScore: 0.8,
    relevanceScore: 0.7,
    freshnessScore: 0.9,
    citations: [],
    verified: true,
    normalizedUrl: "https://example.org/a",
    ...fields,
  };
}

function report(fields: Partial<ResearchReport> = {}): ResearchReport {
  return {
    id: "r1",
    resultId: "q1",
    title: "Report",
    summary: "Findings.",
    sections: [{ title: "Findings", content: "…", citations: ["c1"] }],
    citations: [{ id: "c1", text: "the measured effect was 12%", sourceId: "s1", context: "…", verified: true }],
    metadata: {
      totalSources: 1,
      avgTrustScore: 0.8,
      contradictionsFound: 0,
      contradictionsResolved: 0,
      wordCount: 10,
      quotedFindings: 1,
      unsupportedFindings: 0,
    },
    generatedAt: "2026-01-15T00:00:00.000Z",
    ...fields,
  };
}

describe("the graph uses the existing provenance vocabulary", () => {
  it("emits report, source and audit nodes with the existing kinds", () => {
    const { trace } = researchEvidenceTrace({
      tenantId: "t",
      report: report(),
      sources: [source()],
      audit: auditResearchReport(report(), { sources: [source()], contradictions: [], maxAgeDays: 365 }),
    });
    expect(trace.rootKind).toBe("cognitive-object");
    expect(trace.nodes.map((n) => n.kind).sort()).toEqual(["cognitive-object", "decision", "world-entity"]);
    expect(trace.edges.map((e) => e.relation).sort()).toEqual(["sourced-from", "verified-by"]);
  });

  it("computes the digest the way ProvenanceService.explain does", () => {
    const { trace } = researchEvidenceTrace({ tenantId: "t", report: report(), sources: [source()] });
    const expected = auroraDigest(trace.nodes.map((n) => `${n.kind}:${n.id}`).sort().join("|"));
    expect(trace.digest).toBe(expected);
  });
});

describe("an unresolved link is recorded, not dropped", () => {
  it("puts a citation to a missing source in unresolvedRefs", () => {
    const { trace, unresolvedCitationIds } = researchEvidenceTrace({
      tenantId: "t",
      report: report(),
      sources: [source({ id: "other" })],
    });
    expect(trace.unresolvedRefs).toEqual(["research-source:s1"]);
    expect(unresolvedCitationIds).toEqual(["c1"]);
    // And no edge pretending the link exists.
    expect(trace.edges.filter((e) => e.relation === "sourced-from")).toEqual([]);
    expect(trace.narrative.some((line) => line.includes("the link is unresolved"))).toBe(true);
  });

  it("says so when no source set was supplied at all", () => {
    const { trace, unresolvedCitationIds } = researchEvidenceTrace({ tenantId: "t", report: report() });
    expect(unresolvedCitationIds).toEqual(["c1"]);
    expect(trace.unresolvedRefs).toEqual(["research-source:s1"]);
    expect(trace.nodes.filter((n) => n.kind === "world-entity")).toEqual([]);
  });
});

describe("a failed audit is written onto the edge", () => {
  it("records a passing verdict", () => {
    const audit = auditResearchReport(report(), { sources: [source()], contradictions: [], maxAgeDays: 365 });
    const { trace } = researchEvidenceTrace({ tenantId: "t", report: report(), sources: [source()], audit });
    const edge = trace.edges.find((e) => e.relation === "verified-by");
    expect(edge?.detail).toContain("verified:");
  });

  it("records a blocking verdict and what blocked", () => {
    const badSources = [source({ sourceType: "unknown" })];
    const audit = auditResearchReport(report(), { sources: badSources, contradictions: [], maxAgeDays: 365 });
    const { trace } = researchEvidenceTrace({ tenantId: "t", report: report(), sources: badSources, audit });

    const edge = trace.edges.find((e) => e.relation === "verified-by");
    expect(edge?.detail).toContain("unverified:");
    expect(edge?.detail).toContain("unknown is not treated as acceptable");
    const node = trace.nodes.find((n) => n.kind === "decision");
    expect(node?.attributes["verdict"]).toBe("unverified");
    expect(node?.attributes["blocking"]).toBe(1);
  });

  it("says plainly when no judgement was recorded", () => {
    const { trace, notes } = researchEvidenceTrace({ tenantId: "t", report: report(), sources: [source()] });
    expect(trace.edges.filter((e) => e.relation === "verified-by")).toEqual([]);
    expect(notes.some((n) => n.includes("no judgement about whether the claims hold"))).toBe(true);
  });
});

describe("a source's defect travels with its node", () => {
  it("carries a retracted status on the node itself", () => {
    const retracted = source({
      verificationDetails: { status: "retracted", confidence: 1, evidence: [], checkedAt: "2026-01-01T00:00:00.000Z" },
    });
    const { trace } = researchEvidenceTrace({ tenantId: "t", report: report(), sources: [retracted] });
    const node = trace.nodes.find((n) => n.kind === "world-entity");
    expect(node?.attributes["verificationStatus"]).toBe("retracted");
  });

  it("carries trust and type so a reader does not need the audit too", () => {
    const { trace } = researchEvidenceTrace({ tenantId: "t", report: report(), sources: [source({ trustScore: 0.2 })] });
    const node = trace.nodes.find((n) => n.kind === "world-entity");
    expect(node?.attributes["sourceType"]).toBe("academic");
    expect(node?.attributes["trustScore"]).toBe(0.2);
    expect(node?.confidence).toBe(0.2);
  });
});

describe("no edge is invented", () => {
  it("draws one sourced-from edge per citation, not one per mention", () => {
    const { trace } = researchEvidenceTrace({
      tenantId: "t",
      report: report({
        citations: [
          { id: "c1", text: "12%", sourceId: "s1", context: "…", verified: true },
          { id: "c2", text: "12% again", sourceId: "s1", context: "…", verified: true },
        ],
      }),
      sources: [source()],
    });
    // Two citations to the same source are two pieces of evidence but one
    // provenance link; duplicating it would overstate how much rests on it.
    expect(trace.edges.filter((e) => e.relation === "sourced-from")).toHaveLength(1);
  });

  it("does not link a source that was gathered but never cited", () => {
    const { trace } = researchEvidenceTrace({
      tenantId: "t",
      report: report(),
      sources: [source(), source({ id: "s2", url: "https://example.org/b", title: "Unused" })],
    });
    const targets = trace.edges.filter((e) => e.relation === "sourced-from").map((e) => e.to);
    expect(targets).toEqual(["research-source:s1"]);
    // The uncited source is still a node — it was gathered — but nothing claims it.
    expect(trace.nodes.some((n) => n.id === "research-source:s2")).toBe(true);
  });

  it("marks a quote the engine could not bind", () => {
    const { trace } = researchEvidenceTrace({
      tenantId: "t",
      report: report({
        citations: [{ id: "c1", text: "12%", sourceId: "s1", context: "…", verified: false, verificationReason: "quote not found" }],
      }),
      sources: [source()],
    });
    const edge = trace.edges.find((e) => e.relation === "sourced-from");
    expect(edge?.detail).toContain("could not bind this quote to the source");
  });
});

describe("sourcesSupportingClaim", () => {
  it("returns the source a resolved citation rests on", () => {
    expect(sourcesSupportingClaim(report(), [source()], "c1").map((s) => s.id)).toEqual(["s1"]);
  });

  it("returns nothing for a citation that does not resolve", () => {
    expect(sourcesSupportingClaim(report(), [], "c1")).toEqual([]);
    expect(sourcesSupportingClaim(report(), [source()], "nope")).toEqual([]);
  });
});
