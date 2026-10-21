/**
 * FAZ 8 4/4 — what a failed research audit does, as a policy the caller chooses.
 *
 * 3/4 attached the audit to every report. Nothing acted on it: a report whose
 * audit blocked was still returned, still served by the API route, and still
 * offered by the `research.report` capability. Deciding what should happen there
 * is a policy question, and burying one answer in the code would have made it
 * invisible — so this makes the choice explicit, names the three options, and
 * states what each costs.
 *
 *   annotate  Attach the audit and mention it in the summary. The default.
 *             Nothing changes for existing callers, and a report is never
 *             withheld. The cost is that a client which ignores `audit` sees
 *             exactly what it saw before.
 *   flag      As annotate, plus a marker in the title. Chosen for surfaces that
 *             display a title and nothing else — a list, a notification, a log
 *             line — where an audit buried in a field would never be seen.
 *   block     Refuse to produce the report, throwing with the audit attached.
 *             The strongest option and deliberately not the default: the
 *             `research.report` capability is declared `risk: "pure"` and
 *             reports previously succeeded, so making this the default would
 *             turn working calls into errors as a side effect of an audit being
 *             introduced.
 *
 * Two rules hold across all three:
 *
 *   1. No policy can turn an unverified report into a verified one. `annotate`
 *      and `flag` leave the verdict exactly as the audit set it.
 *   2. A clean audit changes nothing. The modes differ only in what a *failed*
 *      audit does, so a policy cannot make a good report look worse either.
 */

import type { ResearchAudit } from "./research-report-audit.js";
import type { ResearchReport } from "./research-engine-service.js";

export type ResearchAuditPolicy = "annotate" | "flag" | "block";

export const RESEARCH_AUDIT_POLICIES: readonly ResearchAuditPolicy[] = ["annotate", "flag", "block"];

/** The marker `flag` puts at the start of the title. */
export const FLAGGED_TITLE_PREFIX = "[UNVERIFIED] ";

/**
 * Thrown by the `block` policy.
 *
 * Carries the audit so a caller can explain the refusal instead of only knowing
 * that one happened. This is not a failure of the research: the report may be
 * fine. What is missing is evidence that it is.
 */
export class ResearchAuditBlockedError extends Error {
  readonly audit: ResearchAudit;
  readonly reportId: string;

  constructor(reportId: string, audit: ResearchAudit) {
    super(`research report ${reportId} was blocked by its audit: ${audit.summary}`);
    this.name = "ResearchAuditBlockedError";
    this.audit = audit;
    this.reportId = reportId;
  }
}

export interface ResearchAuditPolicyOutcome {
  /** What the policy did, so a caller can record it rather than infer it. */
  readonly action: "none" | "annotated" | "flagged" | "blocked";
  readonly policy: ResearchAuditPolicy;
  /** True when the audit was clean and the policy therefore did nothing. */
  readonly clean: boolean;
}

/**
 * Applies a policy to a report and its audit.
 *
 * Mutates the report for `annotate` and `flag` (the audit is already attached by
 * the time this runs) and throws for `block`. Returns what it did.
 */
export function applyResearchAuditPolicy(
  report: ResearchReport,
  audit: ResearchAudit,
  policy: ResearchAuditPolicy = "annotate",
): ResearchAuditPolicyOutcome {
  if (!RESEARCH_AUDIT_POLICIES.includes(policy)) {
    // An unknown policy is not treated as the permissive one.
    throw new Error(`unknown research audit policy: ${String(policy)}`);
  }

  const clean = audit.verdict === "verified" && audit.blocking.length === 0;
  if (clean) {
    // Rule 2: a clean audit changes nothing, whatever the policy asked for.
    return { action: "none", policy, clean: true };
  }

  if (policy === "block") {
    throw new ResearchAuditBlockedError(report.id, audit);
  }

  if (policy === "flag" && !report.title.startsWith(FLAGGED_TITLE_PREFIX)) {
    report.title = `${FLAGGED_TITLE_PREFIX}${report.title}`;
    return { action: "flagged", policy, clean: false };
  }

  return { action: "annotated", policy, clean: false };
}

/**
 * Is this report safe to present as a finding?
 *
 * A convenience for callers that would otherwise reach into `audit.verdict` and
 * guess. Absent audit means **not** established — a report from before the audit
 * existed is not thereby trustworthy.
 */
export function isResearchVerified(report: ResearchReport): boolean {
  return report.audit?.verdict === "verified" && report.audit.blocking.length === 0;
}
