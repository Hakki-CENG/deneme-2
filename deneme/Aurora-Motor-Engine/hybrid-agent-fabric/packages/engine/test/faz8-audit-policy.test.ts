/**
 * FAZ 8 4/4 — what a failed research audit does.
 *
 * The policy is the caller's, so the tests cover all three modes plus the two
 * rules that hold across them: no policy can make an unverified report verified,
 * and a clean audit changes nothing whatever was asked for.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ResearchEngineService } from "../src/research/research-engine-service.js";
import {
  FLAGGED_TITLE_PREFIX,
  RESEARCH_AUDIT_POLICIES,
  ResearchAuditBlockedError,
  applyResearchAuditPolicy,
  isResearchVerified,
} from "../src/research/research-audit-policy.js";
import { auditResearchReport } from "../src/research/research-report-audit.js";
import type { ResearchReport, ResearchSource } from "../src/research/research-engine-service.js";

const NOW = Date.parse("2026-09-25T12:00:00Z");

async function engine(): Promise<ResearchEngineService> {
  const root = await mkdtemp(join(tmpdir(), "haf-research-policy-"));
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

/** A report whose audit is genuinely clean, built directly. */
function cleanReport(): { report: ResearchReport; sources: ResearchSource[] } {
  const sources: ResearchSource[] = [
    {
      id: "s1",
      url: "https://example.org/a",
      title: "A study",
      snippet: "…",
      publishedAt: "2026-01-01T00:00:00.000Z",
      sourceType: "academic",
      trustScore: 0.9,
      relevanceScore: 0.8,
      freshnessScore: 0.9,
      citations: [],
      verified: true,
      normalizedUrl: "https://example.org/a",
    },
  ];
  const report: ResearchReport = {
    id: "r1",
    resultId: "q1",
    title: "Clean report",
    summary: "Findings.",
    sections: [{ title: "Findings", content: "…", citations: ["c1"] }],
    citations: [{ id: "c1", text: "four hours", sourceId: "s1", context: "…", verified: true }],
    metadata: {
      totalSources: 1,
      avgTrustScore: 0.9,
      contradictionsFound: 0,
      contradictionsResolved: 0,
      wordCount: 10,
      quotedFindings: 1,
      unsupportedFindings: 0,
    },
    generatedAt: "2026-01-15T00:00:00.000Z",
  };
  return { report, sources };
}

describe("the three policies on a failing audit", () => {
  it("annotate returns the report and records that it annotated", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    const report = await service.generateReport(result.id, "Rollback", { maxAgeDays: 365 });

    expect(report.audit?.verdict).toBe("unverified");
    expect(report.auditPolicy).toBe("annotated");
    expect(report.title).toBe("Rollback");
  });

  it("flag marks the title so a list view cannot miss it", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    const report = await service.generateReport(result.id, "Rollback", { maxAgeDays: 365, policy: "flag" });

    expect(report.auditPolicy).toBe("flagged");
    expect(report.title).toBe(`${FLAGGED_TITLE_PREFIX}Rollback`);
  });

  it("block refuses the report and carries the audit in the error", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");

    let caught: unknown;
    try {
      await service.generateReport(result.id, "Rollback", { maxAgeDays: 365, policy: "block" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ResearchAuditBlockedError);
    const blocked = caught as ResearchAuditBlockedError;
    expect(blocked.audit.blocking.length).toBeGreaterThan(0);
    expect(blocked.message).toContain("blocked by its audit");
  });

  it("does not persist a blocked report", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");
    await expect(service.generateReport(result.id, "Rollback", { maxAgeDays: 365, policy: "block" })).rejects.toBeInstanceOf(
      ResearchAuditBlockedError,
    );
    // A blocked report that was stored anyway could be retrieved later and read
    // as though it had passed.
    expect(await service.getReports("tenant")).toEqual([]);
  });
});

describe("rule 1 — no policy can make an unverified report verified", () => {
  it("leaves the verdict alone under every policy", async () => {
    const service = await engine();
    const result = await service.research("tenant", "rollback window", "web");

    for (const policy of ["annotate", "flag"] as const) {
      const report = await service.generateReport(result.id, `Rollback ${policy}`, { maxAgeDays: 365, policy });
      expect(report.audit?.verdict, policy).toBe("unverified");
      expect(isResearchVerified(report), policy).toBe(false);
    }
  });
});

describe("rule 2 — a clean audit changes nothing", () => {
  it("does not annotate, flag or block a report that verified", () => {
    const { report, sources } = cleanReport();
    const audit = auditResearchReport(report, { sources, contradictions: [], maxAgeDays: 365 });
    expect(audit.verdict).toBe("verified");

    for (const policy of RESEARCH_AUDIT_POLICIES) {
      const { report: fresh } = cleanReport();
      // generateReport attaches the audit; applyResearchAuditPolicy only acts on
      // it, so a directly built report needs it attached to be readable.
      fresh.audit = audit;
      const outcome = applyResearchAuditPolicy(fresh, audit, policy);
      expect(outcome.action, policy).toBe("none");
      expect(outcome.clean, policy).toBe(true);
      expect(fresh.title, policy).toBe("Clean report");
      expect(isResearchVerified(fresh), policy).toBe(true);
    }
  });
});

describe("isResearchVerified", () => {
  it("does not treat a report with no audit as verified", () => {
    const { report } = cleanReport();
    // A report written before the audit existed is not thereby trustworthy.
    expect(report.audit).toBeUndefined();
    expect(isResearchVerified(report)).toBe(false);
  });
});

describe("an unknown policy is not treated as the permissive one", () => {
  it("throws instead of silently annotating", () => {
    const { report, sources } = cleanReport();
    // Force a blocking finding so the policy branch is reached: warnings alone
    // do not make a report unverified, only blocking findings or an unchecked
    // dimension do.
    const audit = auditResearchReport(report, {
      sources: [{ ...sources[0]!, sourceType: "unknown" }],
      contradictions: [],
      maxAgeDays: 365,
    });
    expect(audit.blocking.length).toBeGreaterThan(0);
    expect(audit.verdict).toBe("unverified");
    expect(() =>
      applyResearchAuditPolicy(report, audit, "silently-pass" as never),
    ).toThrow(/unknown research audit policy/);
  });
});
