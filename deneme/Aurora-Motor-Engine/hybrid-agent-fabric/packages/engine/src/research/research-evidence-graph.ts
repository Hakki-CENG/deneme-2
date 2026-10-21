/**
 * FAZ 8 2/4 — the evidence graph, on the provenance vocabulary that already exists.
 *
 * FAZ 8 names an "evidence graph". `aurora/provenance-service.ts` already has
 * one: `ProvenanceNode`, `ProvenanceEdge` with `sourced-from` and `verified-by`
 * relations, and `ProvenanceTrace` with `unresolvedRefs` and a digest. Its own
 * header says it reconstructs the chain "from durable state only" and "never
 * asks a model to narrate causality, so the explanation cannot be invented after
 * the fact". That is the right base for research evidence, and building a second
 * graph type beside it would have meant two answers to "where did this come
 * from".
 *
 * So this file does not define a graph. It emits a `ProvenanceTrace` from a
 * research report, using the existing kinds and relations:
 *
 *   report  -> `cognitive-object`      the artifact whose provenance is asked
 *   source  -> `world-entity`          something in the world it rests on
 *   audit   -> `decision`              the judgement about whether it holds
 *   citation-> `sourced-from` edge     report rests on source
 *   audit   -> `verified-by` edge      report was judged by the audit
 *
 * Four rules, each about not letting the graph flatter the report:
 *
 *   1. A citation whose source is not in the set lands in `unresolvedRefs`. It
 *      is not dropped — a missing link is the finding, and `unresolvedRefs` is
 *      the field that exists for it.
 *   2. The audit's verdict is written onto the `verified-by` edge, including
 *      how many findings blocked. A graph that records that verification
 *      happened but not that it failed is a graph that hides the result.
 *   3. A retracted or disputed source says so in its own node attributes, so
 *      the defect travels with the node instead of depending on the reader
 *      also having the audit.
 *   4. No edge is invented. The trace contains exactly the links citations and
 *      the audit establish — never an inferred one.
 *
 * The digest uses the same formula `ProvenanceService.explain` uses, so a
 * research trace is comparable with a trace built from durable state.
 */

import { auroraDigest } from "../util/aurora-state.js";
import type { ProvenanceEdge, ProvenanceNode, ProvenanceTrace } from "../aurora/provenance-service.js";

import type { ResearchAudit } from "./research-report-audit.js";
import type { ResearchReport, ResearchSource } from "./research-engine-service.js";

export interface ResearchEvidenceGraphInput {
  readonly tenantId: string;
  readonly report: ResearchReport;
  readonly sources?: readonly ResearchSource[];
  /** When supplied, its verdict is recorded on a `verified-by` edge. */
  readonly audit?: ResearchAudit;
  readonly depth?: number;
  readonly nowMs?: number;
}

export interface ResearchEvidenceGraph {
  readonly trace: ProvenanceTrace;
  /** Citations that could not be resolved to a source, by citation id. */
  readonly unresolvedCitationIds: readonly string[];
  /** What the graph deliberately does not contain. */
  readonly notes: readonly string[];
}

/**
 * Builds the evidence graph for a research report.
 *
 * Does not throw. What it cannot link, it reports as unresolved rather than
 * quietly omitting.
 */
export function researchEvidenceTrace(input: ResearchEvidenceGraphInput): ResearchEvidenceGraph {
  const { report, audit } = input;
  const sources = input.sources ?? [];
  const notes: string[] = [];
  const nodes: ProvenanceNode[] = [];
  const edges: ProvenanceEdge[] = [];
  const unresolved: string[] = [];
  const narrative: string[] = [];

  const reportId = `research-report:${report.id}`;
  nodes.push({
    kind: "cognitive-object",
    id: reportId,
    label: report.title,
    detail: `${report.sections.length} section(s), ${report.citations.length} citation(s)`,
    attributes: {
      citations: report.citations.length,
      sections: report.sections.length,
      unsupportedFindings: report.metadata.unsupportedFindings,
    },
  });

  const sourceIds = new Set<string>();
  for (const source of sources) {
    const id = `research-source:${source.id}`;
    sourceIds.add(source.id);
    const status = source.verificationDetails?.status;
    nodes.push({
      kind: "world-entity",
      id,
      label: source.title,
      detail: source.url,
      confidence: source.trustScore,
      attributes: {
        sourceType: source.sourceType,
        trustScore: source.trustScore,
        freshnessScore: source.freshnessScore,
        verified: source.verified,
        // Rule 3: the defect travels with the node.
        ...(status === undefined ? {} : { verificationStatus: status }),
        ...(source.publishedAt === undefined ? {} : { publishedAt: source.publishedAt }),
        ...(source.duplicateOf === undefined ? {} : { duplicateOf: source.duplicateOf }),
      },
    });
  }

  // Rule 4: one edge per citation that actually resolves. Rule 1: the rest are
  // unresolved, not dropped.
  const unresolvedCitationIds: string[] = [];
  for (const citation of report.citations) {
    if (!sourceIds.has(citation.sourceId)) {
      unresolved.push(`research-source:${citation.sourceId}`);
      unresolvedCitationIds.push(citation.id);
      narrative.push(
        `citation "${flatten(citation.text)}" points at source "${citation.sourceId}", which is not in the source set — the link is unresolved`,
      );
      continue;
    }
    edges.push({
      from: reportId,
      to: `research-source:${citation.sourceId}`,
      relation: "sourced-from",
      detail:
        `"${flatten(citation.text)}"` +
        (citation.verified ? "" : " (the engine could not bind this quote to the source)") +
        (citation.contentDigest === undefined ? "" : ` [digest ${citation.contentDigest.slice(0, 12)}]`),
    });
  }

  if (audit !== undefined) {
    const auditId = `research-audit:${report.id}`;
    nodes.push({
      kind: "decision",
      id: auditId,
      label: `research report audit — ${audit.verdict}`,
      detail: audit.summary,
      attributes: {
        verdict: audit.verdict,
        blocking: audit.blocking.length,
        warnings: audit.warnings.length,
        dimensionsChecked: audit.dimensionsChecked.length,
        dimensionsSkipped: audit.dimensionsSkipped.length,
      },
    });
    // Rule 2: the verdict, including failure, is on the edge.
    edges.push({
      from: reportId,
      to: auditId,
      relation: "verified-by",
      detail:
        `${audit.verdict}: ${audit.summary}` +
        (audit.blocking.length > 0
          ? ` — blocking: ${audit.blocking.slice(0, 2).map((finding) => finding.message).join(" | ")}`
          : ""),
    });
    narrative.push(`audit reached ${audit.verdict}: ${audit.summary}`);
  } else {
    notes.push("no audit was supplied, so the graph records provenance but no judgement about whether the claims hold");
  }

  if (input.sources === undefined) {
    notes.push("no source set was supplied, so every citation is unresolved and no `sourced-from` edge could be drawn");
  }

  const dedupedNodes = dedupe(nodes);
  const dedupedEdges = dedupeEdges(edges);

  return {
    trace: {
      tenantId: input.tenantId,
      rootKind: "cognitive-object",
      rootId: reportId,
      nodes: dedupedNodes,
      edges: dedupedEdges,
      narrative,
      unresolvedRefs: [...new Set(unresolved)],
      depth: input.depth ?? 2,
      // Same formula as ProvenanceService.explain, so traces are comparable.
      digest: auroraDigest(dedupedNodes.map((item) => `${item.kind}:${item.id}`).sort().join("|")),
      generatedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    },
    unresolvedCitationIds,
    notes,
  };
}

/**
 * Which sources a claim in the report actually rests on.
 *
 * Returns nothing for a claim whose citations do not resolve, rather than
 * treating an unresolvable citation as support.
 */
export function sourcesSupportingClaim(
  report: ResearchReport,
  sources: readonly ResearchSource[],
  citationId: string,
): readonly ResearchSource[] {
  const citation = report.citations.find((item) => item.id === citationId);
  if (citation === undefined) return [];
  const source = sources.find((item) => item.id === citation.sourceId);
  return source === undefined ? [] : [source];
}

function flatten(text: string, limit = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

function dedupe(nodes: readonly ProvenanceNode[]): ProvenanceNode[] {
  const seen = new Set<string>();
  const out: ProvenanceNode[] = [];
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}

function dedupeEdges(edges: readonly ProvenanceEdge[]): ProvenanceEdge[] {
  const out: ProvenanceEdge[] = [];
  for (const edge of edges) {
    if (!out.some((item) => item.from === edge.from && item.to === edge.to && item.relation === edge.relation)) {
      out.push(edge);
    }
  }
  return out;
}
