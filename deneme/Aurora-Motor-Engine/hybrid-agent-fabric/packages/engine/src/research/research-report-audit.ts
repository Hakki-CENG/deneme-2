/**
 * FAZ 8 1/4 — auditing a research report, on the six dimensions the plan names.
 *
 * Measured first: `research/research-engine-service.ts` (1157 lines) already
 * implements most of FAZ 8's list — `ResearchSource` with `trustScore`,
 * `freshnessScore` and a `sourceType` that includes `unknown`; `Citation` whose
 * quoted text is checked against the fetched content and bound to it by
 * `contentDigest`; `Contradiction` with severity; `VerificationResult` with
 * `disputed` and `retracted`. Search, web fetch and PDF extraction exist too.
 * So this phase is not a fresh build, and pretending otherwise would have
 * duplicated a subsystem.
 *
 * What was missing is the plan's Evaluator line: something that judges a report
 * on citation correctness, source quality, claim support, coverage,
 * contradiction and temporal validity. This is it.
 *
 * Three rules carry the honesty:
 *
 *   1. `unknown` is not safe. A source of unknown type is a blocking finding,
 *      not a neutral one — the same rule the security screening follows.
 *   2. A contradiction is never averaged away. An unresolved major
 *      contradiction blocks the report; the audit does not compute a mean
 *      confidence across sources that disagree.
 *   3. The audit reports which dimensions it actually checked. If a dimension
 *      could not be evaluated, the verdict is `unverified` and says so, rather
 *      than quietly reporting fewer dimensions as though all six passed.
 *
 * `researchReportEvaluator` wraps an audit as an `Evaluator` for the consensus
 * verifier. Its `source` is fixed and model-free, which is the point: consensus
 * discounts evaluators that share a source because their errors correlate, and
 * a deterministic audit shares nothing with a model judge.
 */

import type { Evaluator, EvaluatorJudgement } from "../execution/consensus-verifier.js";
import type { Citation, Contradiction, ResearchReport, ResearchSource } from "./research-engine-service.js";

export type ResearchAuditDimension =
  | "citation_correctness"
  | "source_quality"
  | "claim_support"
  | "coverage"
  | "contradiction"
  | "temporal_validity";

export const RESEARCH_AUDIT_DIMENSIONS: readonly ResearchAuditDimension[] = [
  "citation_correctness",
  "source_quality",
  "claim_support",
  "coverage",
  "contradiction",
  "temporal_validity",
];

export interface ResearchAuditFinding {
  readonly dimension: ResearchAuditDimension;
  /** A blocking finding means the report must not be presented as verified. */
  readonly severity: "blocking" | "warning";
  readonly message: string;
}

export interface ResearchAuditOptions {
  /** Sources the report's citations may point at. Required for citation checks. */
  readonly sources?: readonly ResearchSource[];
  /** Contradictions found between those sources. */
  readonly contradictions?: readonly Contradiction[];
  /** Trust below this is a warning. Defaults to 0.3. */
  readonly minTrustScore?: number;
  /** A source older than this many days is a temporal-validity finding. */
  readonly maxAgeDays?: number;
  /** When the audit ran; defaults to now. */
  readonly nowMs?: number;
}

export interface ResearchAudit {
  readonly findings: readonly ResearchAuditFinding[];
  readonly blocking: readonly ResearchAuditFinding[];
  readonly warnings: readonly ResearchAuditFinding[];
  /**
   * `verified` only when every dimension was checked and none blocked. A report
   * whose sources were not supplied cannot be verified — it is `unverified`
   * with the reason attached.
   */
  readonly verdict: "verified" | "unverified";
  /** Dimensions that could actually be evaluated. */
  readonly dimensionsChecked: readonly ResearchAuditDimension[];
  /** Dimensions skipped, and why. Never silently absent. */
  readonly dimensionsSkipped: readonly { dimension: ResearchAuditDimension; reason: string }[];
  readonly summary: string;
}

const DAY_MS = 86_400_000;

/**
 * Audits a research report on the six dimensions.
 *
 * Returns findings; it does not throw. A report that cannot be audited is
 * reported as unauditable, which is different from a report that failed.
 */
export function auditResearchReport(report: ResearchReport, options: ResearchAuditOptions = {}): ResearchAudit {
  const findings: ResearchAuditFinding[] = [];
  const skipped: { dimension: ResearchAuditDimension; reason: string }[] = [];
  const sources = options.sources;
  const minTrust = options.minTrustScore ?? 0.3;
  const nowMs = options.nowMs ?? Date.now();

  const add = (dimension: ResearchAuditDimension, severity: ResearchAuditFinding["severity"], message: string) =>
    findings.push({ dimension, severity, message });

  // --- claim support: does the report rest on evidence at all? -------------
  if (report.citations.length === 0) {
    add("claim_support", "blocking", "the report carries no citations, so none of its claims are supported by a source");
  }
  const uncitedSections = report.sections.filter((section) => (section.citations?.length ?? 0) === 0);
  for (const section of uncitedSections) {
    add("coverage", "warning", `section "${section.title}" cites nothing`);
  }

  // --- citation correctness ------------------------------------------------
  if (sources === undefined) {
    skipped.push({
      dimension: "citation_correctness",
      reason: "no sources were supplied, so citations cannot be resolved against anything",
    });
  } else {
    const byId = new Map(sources.map((source) => [source.id, source]));
    for (const citation of report.citations) {
      const source = byId.get(citation.sourceId);
      if (source === undefined) {
        add(
          "citation_correctness",
          "blocking",
          `citation "${truncate(citation.text)}" points at source "${citation.sourceId}", which is not in the source set`,
        );
        continue;
      }
      if (citation.text.trim().length === 0) {
        add("citation_correctness", "blocking", "a citation carries no quoted text, so it evidences nothing");
      }
      if (citation.verified === false) {
        add(
          "citation_correctness",
          "blocking",
          `citation "${truncate(citation.text)}" did not bind to its source${citation.verificationReason ? `: ${citation.verificationReason}` : ""}`,
        );
      }
      // The quote was verified against some content; if the source has since
      // changed, the verification no longer applies to what is being cited.
      if (
        citation.contentDigest !== undefined &&
        source.contentDigest !== undefined &&
        citation.contentDigest !== source.contentDigest
      ) {
        add(
          "citation_correctness",
          "blocking",
          `citation "${truncate(citation.text)}" was verified against different content than its source now holds`,
        );
      }
      if (source.verificationDetails?.status === "retracted") {
        add("citation_correctness", "blocking", `source "${source.title}" is retracted but is still cited`);
      } else if (source.verificationDetails?.status === "disputed") {
        add("citation_correctness", "warning", `source "${source.title}" is disputed`);
      }
    }
  }

  // --- source quality ------------------------------------------------------
  if (sources === undefined) {
    skipped.push({ dimension: "source_quality", reason: "no sources were supplied" });
  } else {
    for (const source of sources) {
      if (source.sourceType === "unknown") {
        add(
          "source_quality",
          "blocking",
          `source "${source.title}" has an unknown type — unknown is not treated as acceptable`,
        );
      }
      if (source.trustScore < minTrust) {
        add("source_quality", "warning", `source "${source.title}" has trust ${source.trustScore.toFixed(2)}, below ${minTrust}`);
      }
      if (source.verified === false) {
        add("source_quality", "warning", `source "${source.title}" is not verified`);
      }
    }
  }

  // --- coverage ------------------------------------------------------------
  if (sources !== undefined && sources.length > 0) {
    const cited = new Set(report.citations.map((citation) => citation.sourceId));
    const uncited = sources.filter((source) => !cited.has(source.id) && source.duplicateOf === undefined);
    if (uncited.length === sources.length) {
      add("coverage", "blocking", "no source in the set is cited by the report");
    } else {
      for (const source of uncited) {
        add("coverage", "warning", `source "${source.title}" was gathered but never cited`);
      }
    }
  }

  // --- contradiction -------------------------------------------------------
  const contradictions = options.contradictions;
  if (contradictions === undefined) {
    skipped.push({ dimension: "contradiction", reason: "no contradiction set was supplied" });
  } else {
    for (const contradiction of contradictions) {
      const unresolved = contradiction.resolution === undefined || contradiction.resolution.trim().length === 0;
      const severity: ResearchAuditFinding["severity"] =
        contradiction.severity === "major" && unresolved ? "blocking" : "warning";
      add(
        "contradiction",
        severity,
        `${contradiction.severity} contradiction between "${contradiction.sourceA}" and "${contradiction.sourceB}"` +
          (unresolved ? " — unresolved" : ` — resolution: ${contradiction.resolution}`),
      );
    }
  }

  // --- temporal validity ---------------------------------------------------
  const maxAgeDays = options.maxAgeDays;
  if (sources === undefined) {
    skipped.push({ dimension: "temporal_validity", reason: "no sources were supplied" });
  } else if (maxAgeDays === undefined) {
    skipped.push({
      dimension: "temporal_validity",
      reason: "no age horizon was supplied, so staleness cannot be judged — age is not assumed acceptable",
    });
  } else {
    for (const source of sources) {
      if (source.publishedAt === undefined) {
        add("temporal_validity", "warning", `source "${source.title}" has no publication date; its age is unknown, not assumed fresh`);
        continue;
      }
      const ageDays = (nowMs - Date.parse(source.publishedAt)) / DAY_MS;
      if (!Number.isFinite(ageDays)) {
        add("temporal_validity", "warning", `source "${source.title}" has an unparseable publication date "${source.publishedAt}"`);
      } else if (ageDays > maxAgeDays) {
        add(
          "temporal_validity",
          "warning",
          `source "${source.title}" is ${Math.round(ageDays)} days old, beyond the ${maxAgeDays}-day horizon`,
        );
      }
    }
  }

  const blocking = findings.filter((finding) => finding.severity === "blocking");
  const checked = RESEARCH_AUDIT_DIMENSIONS.filter(
    (dimension) => !skipped.some((entry) => entry.dimension === dimension),
  );
  const verdict = blocking.length === 0 && skipped.length === 0 ? "verified" : "unverified";

  const parts: string[] = [];
  if (blocking.length > 0) parts.push(`${blocking.length} blocking finding(s)`);
  const warnings = findings.filter((finding) => finding.severity === "warning");
  if (warnings.length > 0) parts.push(`${warnings.length} warning(s)`);
  if (skipped.length > 0) parts.push(`${skipped.length} dimension(s) could not be checked: ${skipped.map((s) => s.dimension).join(", ")}`);

  return {
    findings,
    blocking,
    warnings,
    verdict,
    dimensionsChecked: checked,
    dimensionsSkipped: skipped,
    summary: parts.length === 0 ? "all six dimensions checked, nothing blocking" : parts.join("; "),
  };
}

function truncate(text: string, limit = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

/**
 * Wraps an audit as a consensus `Evaluator`.
 *
 * The judge is deterministic and model-free, and its `source` says so. That
 * matters to consensus rather than being cosmetic: evaluators sharing a source
 * are counted once because their errors correlate, and a model judge's errors
 * correlate with another prompt against the same model, not with this.
 *
 * It judges a claim by auditing the report the claim rests on. A blocking
 * finding fails; findings that are all warnings pass; an audit that could not
 * check every dimension returns `uncertain`, never `pass`.
 */
export function researchReportEvaluator(
  report: ResearchReport,
  options: ResearchAuditOptions = {},
  name = "research-report-audit",
): Evaluator {
  return {
    name,
    source: "deterministic:research-report-audit",
    judge: async (claim: string): Promise<EvaluatorJudgement> => {
      const audit = auditResearchReport(report, options);
      if (audit.blocking.length > 0) {
        return {
          verdict: "fail",
          reasoning: `${audit.blocking.length} blocking finding(s) on the evidence behind "${truncate(claim)}": ${audit.blocking
            .slice(0, 3)
            .map((finding) => finding.message)
            .join(" | ")}`,
          confidence: 0.9,
        };
      }
      if (audit.dimensionsSkipped.length > 0) {
        return {
          verdict: "uncertain",
          reasoning: audit.summary,
          confidence: 0.4,
        };
      }
      return { verdict: "pass", reasoning: audit.summary, confidence: 0.7 };
    },
  };
}

/** The citations a report actually relies on, resolved against its source set. */
export function resolveCitations(
  report: ResearchReport,
  sources: readonly ResearchSource[],
): { resolved: readonly { citation: Citation; source: ResearchSource }[]; unresolved: readonly Citation[] } {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const resolved: { citation: Citation; source: ResearchSource }[] = [];
  const unresolved: Citation[] = [];
  for (const citation of report.citations) {
    const source = byId.get(citation.sourceId);
    if (source === undefined) unresolved.push(citation);
    else resolved.push({ citation, source });
  }
  return { resolved, unresolved };
}
