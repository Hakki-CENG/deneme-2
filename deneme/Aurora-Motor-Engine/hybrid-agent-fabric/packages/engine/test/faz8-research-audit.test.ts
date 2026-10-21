/**
 * FAZ 8 1/4 — auditing a research report.
 *
 * The tests that matter are the three rules: `unknown` is not safe, a
 * contradiction is never averaged away, and a dimension that could not be
 * checked makes the verdict `unverified` rather than quietly passing.
 */

import { describe, expect, it } from "vitest";

import {
  RESEARCH_AUDIT_DIMENSIONS,
  auditResearchReport,
  researchReportEvaluator,
  resolveCitations,
} from "../src/research/research-report-audit.js";
import type { Contradiction, ResearchReport, ResearchSource } from "../src/research/research-engine-service.js";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-01-15T00:00:00.000Z");

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
    citations: [
      {
        id: "c1",
        text: "the measured effect was 12%",
        sourceId: "s1",
        context: "…",
        verified: true,
      },
    ],
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

function contradiction(fields: Partial<Contradiction> = {}): Contradiction {
  return { id: "x1", sourceA: "s1", sourceB: "s2", claimA: "12%", claimB: "3%", severity: "major", ...fields };
}

describe("a clean report verifies", () => {
  it("checks all six dimensions and blocks nothing", () => {
    const audit = auditResearchReport(report(), { sources: [source()], contradictions: [], maxAgeDays: 365, nowMs: NOW });
    expect(audit.blocking).toEqual([]);
    expect(audit.verdict).toBe("verified");
    expect(audit.dimensionsChecked).toEqual([...RESEARCH_AUDIT_DIMENSIONS]);
    expect(audit.dimensionsSkipped).toEqual([]);
  });
});

describe("unknown is not safe", () => {
  it("blocks a source of unknown type", () => {
    const audit = auditResearchReport(report(), {
      sources: [source({ sourceType: "unknown" })],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(audit.verdict).toBe("unverified");
    const finding = audit.blocking.find((f) => f.dimension === "source_quality");
    expect(finding?.message).toContain("unknown is not treated as acceptable");
  });

  it("warns rather than blocks on merely low trust", () => {
    const audit = auditResearchReport(report(), {
      sources: [source({ trustScore: 0.1 })],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(audit.warnings.some((f) => f.message.includes("below 0.3"))).toBe(true);
    expect(audit.blocking).toEqual([]);
  });
});

describe("a contradiction is never averaged away", () => {
  it("blocks on an unresolved major contradiction", () => {
    const audit = auditResearchReport(report(), {
      sources: [source()],
      contradictions: [contradiction()],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(audit.verdict).toBe("unverified");
    expect(audit.blocking.some((f) => f.dimension === "contradiction" && f.message.includes("unresolved"))).toBe(true);
  });

  it("downgrades a resolved contradiction to a warning, and records the resolution", () => {
    const audit = auditResearchReport(report(), {
      sources: [source()],
      contradictions: [contradiction({ resolution: "different populations" })],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(audit.blocking).toEqual([]);
    expect(audit.warnings.some((f) => f.message.includes("different populations"))).toBe(true);
  });

  it("does not block on a minor unresolved contradiction", () => {
    const audit = auditResearchReport(report(), {
      sources: [source()],
      contradictions: [contradiction({ severity: "minor" })],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(audit.blocking).toEqual([]);
  });
});

describe("a dimension that could not be checked is not a pass", () => {
  it("reports skipped dimensions and refuses to verify", () => {
    const audit = auditResearchReport(report());
    expect(audit.verdict).toBe("unverified");
    expect(audit.dimensionsSkipped.map((s) => s.dimension).sort()).toEqual(
      ["citation_correctness", "contradiction", "source_quality", "temporal_validity"].sort(),
    );
    expect(audit.summary).toContain("could not be checked");
  });

  it("does not assume an undated source is fresh, and skips the dimension without a horizon", () => {
    const noHorizon = auditResearchReport(report(), { sources: [source()], contradictions: [], nowMs: NOW });
    expect(noHorizon.dimensionsSkipped.some((s) => s.dimension === "temporal_validity")).toBe(true);
    expect(noHorizon.verdict).toBe("unverified");

    const undated = auditResearchReport(report(), {
      sources: [source({ publishedAt: undefined })],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(undated.warnings.some((f) => f.message.includes("age is unknown, not assumed fresh"))).toBe(true);
  });

  it("flags a source past the age horizon", () => {
    const audit = auditResearchReport(report(), {
      sources: [source({ publishedAt: new Date(NOW - 800 * DAY_MS).toISOString() })],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(audit.warnings.some((f) => f.message.includes("beyond the 365-day horizon"))).toBe(true);
  });
});

describe("citation correctness", () => {
  it("blocks a citation pointing at a source that is not there", () => {
    const audit = auditResearchReport(report(), {
      sources: [source({ id: "other" })],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(audit.blocking.some((f) => f.message.includes("is not in the source set"))).toBe(true);
  });

  it("blocks a citation that did not bind to its source", () => {
    const audit = auditResearchReport(
      report({
        citations: [{ id: "c1", text: "the measured effect was 12%", sourceId: "s1", context: "…", verified: false, verificationReason: "quote not found" }],
      }),
      { sources: [source()], contradictions: [], maxAgeDays: 365, nowMs: NOW },
    );
    expect(audit.blocking.some((f) => f.message.includes("did not bind to its source: quote not found"))).toBe(true);
  });

  it("blocks a quote verified against content the source no longer holds", () => {
    const audit = auditResearchReport(
      report({
        citations: [{ id: "c1", text: "12%", sourceId: "s1", context: "…", verified: true, contentDigest: "old" }],
      }),
      { sources: [source({ contentDigest: "new" })], contradictions: [], maxAgeDays: 365, nowMs: NOW },
    );
    expect(audit.blocking.some((f) => f.message.includes("different content than its source now holds"))).toBe(true);
  });

  it("blocks a citation with no quoted text", () => {
    const audit = auditResearchReport(
      report({ citations: [{ id: "c1", text: "   ", sourceId: "s1", context: "…", verified: true }] }),
      { sources: [source()], contradictions: [], maxAgeDays: 365, nowMs: NOW },
    );
    expect(audit.blocking.some((f) => f.message.includes("evidences nothing"))).toBe(true);
  });

  it("blocks a retracted source that is still cited, and warns on a disputed one", () => {
    const retracted = auditResearchReport(report(), {
      sources: [source({ verificationDetails: { status: "retracted", confidence: 1, evidence: [], checkedAt: "2026-01-01T00:00:00.000Z" } })],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(retracted.blocking.some((f) => f.message.includes("is retracted but is still cited"))).toBe(true);

    const disputed = auditResearchReport(report(), {
      sources: [source({ verificationDetails: { status: "disputed", confidence: 0.4, evidence: [], checkedAt: "2026-01-01T00:00:00.000Z" } })],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(disputed.blocking).toEqual([]);
    expect(disputed.warnings.some((f) => f.message.includes("is disputed"))).toBe(true);
  });
});

describe("claim support and coverage", () => {
  it("blocks a report that cites nothing", () => {
    const audit = auditResearchReport(report({ citations: [], sections: [{ title: "Findings", content: "…", citations: [] }] }), {
      sources: [source()],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(audit.blocking.some((f) => f.message.includes("carries no citations"))).toBe(true);
  });

  it("warns on a section that cites nothing", () => {
    const audit = auditResearchReport(
      report({ sections: [{ title: "Findings", content: "…", citations: ["c1"] }, { title: "Discussion", content: "…", citations: [] }] }),
      { sources: [source()], contradictions: [], maxAgeDays: 365, nowMs: NOW },
    );
    expect(audit.warnings.some((f) => f.message.includes('section "Discussion" cites nothing'))).toBe(true);
  });

  it("blocks when no gathered source is cited at all", () => {
    const audit = auditResearchReport(report(), {
      sources: [source({ id: "a" }), source({ id: "b" })],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(audit.blocking.some((f) => f.message.includes("no source in the set is cited"))).toBe(true);
  });

  it("does not count a deduplicated source as uncited", () => {
    const audit = auditResearchReport(report(), {
      sources: [source(), source({ id: "dup", duplicateOf: "s1" })],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    expect(audit.warnings.filter((f) => f.message.includes("never cited"))).toEqual([]);
  });
});

describe("resolveCitations", () => {
  it("separates citations that resolve from those that do not", () => {
    const { resolved, unresolved } = resolveCitations(report(), [source()]);
    expect(resolved).toHaveLength(1);
    expect(unresolved).toEqual([]);

    const broken = resolveCitations(report(), []);
    expect(broken.resolved).toEqual([]);
    expect(broken.unresolved).toHaveLength(1);
  });
});

describe("the evaluator wrapper", () => {
  it("declares a model-free source so consensus counts it as independent", async () => {
    const evaluator = researchReportEvaluator(report(), { sources: [source()], contradictions: [], maxAgeDays: 365, nowMs: NOW });
    expect(evaluator.source).toBe("deterministic:research-report-audit");
    const judgement = await evaluator.judge("the effect was 12%");
    expect(judgement.verdict).toBe("pass");
  });

  it("fails on a blocking finding", async () => {
    const evaluator = researchReportEvaluator(report(), {
      sources: [source({ sourceType: "unknown" })],
      contradictions: [],
      maxAgeDays: 365,
      nowMs: NOW,
    });
    const judgement = await evaluator.judge("the effect was 12%");
    expect(judgement.verdict).toBe("fail");
    expect(judgement.reasoning).toContain("unknown is not treated as acceptable");
  });

  it("returns uncertain, never pass, when a dimension could not be checked", async () => {
    const evaluator = researchReportEvaluator(report());
    const judgement = await evaluator.judge("the effect was 12%");
    expect(judgement.verdict).toBe("uncertain");
    expect(judgement.reasoning).toContain("could not be checked");
  });
});
