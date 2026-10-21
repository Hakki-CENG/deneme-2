/**
 * FAZ 5 — Semantic Task Router.
 *
 * The thing this replaces is keyword classification: `g.includes("code")`,
 * `text.includes("refactor")`, a score built from substrings. Two goals sharing
 * a word got the same answer, and a goal that needed five different kinds of
 * expertise got one label.
 *
 * So the router here answers a different question — *what does this task
 * actually require?* — and its answer is a **list**, because a performance bug
 * that must be fixed and shipped safely needs a software engineer, a security
 * reviewer and someone to research the regression, not one category.
 *
 * Two rules hold the line:
 *
 *   1. There is no keyword matching in this file. Not as a fast path, not as a
 *      fallback. When no capability analysis is available the router returns
 *      `source: "none"` and selects nobody, with a reason. A keyword guess
 *      wearing the word "semantic" is worse than an honest "I could not tell".
 *
 *   2. The requirement-to-expert mapping is data the experts declare
 *      (`servesCapabilities`), not a table written here. Adding an expert must
 *      not mean editing routing code.
 */

import type { ExpertRegistry } from "./expert-registry.js";

/** One capability a task was analysed as needing. */
export interface CapabilityRequirement {
  /** Stable id, e.g. `code_change`, `security_review`, `web_research`. */
  readonly capability: string;
  /** What in the task implied this. A requirement with no evidence is an assertion. */
  readonly evidence: string;
  /** 0..1. Below `minConfidence` the requirement is set aside and reported. */
  readonly confidence: number;
}

/** An expert selected for a task, and which of its requirements it covers. */
export interface ExpertMatch {
  readonly expertId: string;
  /** The requirements this expert serves, in the order the task listed them. */
  readonly serves: readonly string[];
}

export interface TaskRouting {
  readonly requirements: readonly CapabilityRequirement[];
  /**
   * Selected experts, most coverage first. Empty means nobody was selected —
   * check `reason` for whether that is because the task needs nothing an
   * expert offers or because nothing could be determined.
   */
  readonly matches: readonly ExpertMatch[];
  /**
   * Requirements no registered expert serves.
   *
   * Reported rather than dropped: an uncovered requirement is how you find out
   * a domain is missing, and dropping it would turn that into a silent pass.
   */
  readonly uncovered: readonly string[];
  /** Requirements set aside for low confidence, so the threshold is visible. */
  readonly lowConfidence: readonly string[];
  /** `"analysis"` when requirements drove this; `"none"` when nothing could. */
  readonly source: "analysis" | "none";
  readonly reason: string;
}

export interface RoutingOptions {
  /** Requirements at or below this confidence are set aside. Default 0. */
  readonly minConfidence?: number;
}

/**
 * Reads a capability analysis into requirements.
 *
 * Returns only what it could actually read. A reply naming three capabilities
 * yields three requirements; a malformed entry is skipped rather than repaired,
 * because guessing what a half-parsed requirement meant is how a router ends up
 * confident about something nobody said.
 *
 * An unknown or out-of-range confidence becomes 0, never a middling value: a
 * number invented here would sail past any threshold the caller set.
 */
export function parseCapabilityRequirements(value: unknown): CapabilityRequirement[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null && Array.isArray((value as { requirements?: unknown }).requirements)
      ? ((value as { requirements: unknown[] }).requirements)
      : [];

  const requirements: CapabilityRequirement[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const capability = typeof record["capability"] === "string" ? record["capability"].trim() : "";
    if (capability === "") continue;
    const evidence = typeof record["evidence"] === "string" ? record["evidence"].trim() : "";
    const rawConfidence = record["confidence"];
    const confidence =
      typeof rawConfidence === "number" && Number.isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1
        ? rawConfidence
        : 0;
    requirements.push({ capability, evidence, confidence });
  }
  return requirements;
}

/**
 * Decides which experts a task needs.
 *
 * Pure: the same requirements and the same registry always give the same
 * answer, and nothing here calls a model. Producing the requirements is a
 * separate, model-shaped job; keeping the two apart means the selection can be
 * tested without one and audited without the other.
 */
export function routeTask(
  requirements: readonly CapabilityRequirement[],
  registry: ExpertRegistry,
  options: RoutingOptions = {},
): TaskRouting {
  const minConfidence = options.minConfidence ?? 0;

  if (requirements.length === 0) {
    return {
      requirements: [],
      matches: [],
      uncovered: [],
      lowConfidence: [],
      source: "none",
      reason:
        "no capability analysis was available, so no expert was selected; this router does not substitute keyword matching",
    };
  }

  const considered = requirements.filter((requirement) => requirement.confidence > minConfidence);
  const lowConfidence = requirements
    .filter((requirement) => requirement.confidence <= minConfidence)
    .map((requirement) => requirement.capability);

  if (considered.length === 0) {
    return {
      requirements,
      matches: [],
      uncovered: [],
      lowConfidence,
      source: "none",
      reason: `every requirement was at or below the confidence threshold of ${minConfidence}; nothing was selected on a guess`,
    };
  }

  const wanted = considered.map((requirement) => requirement.capability);
  const matches: ExpertMatch[] = [];
  const covered = new Set<string>();

  for (const registration of registry.list()) {
    // `list()` includes unusable experts; only a usable one may be selected.
    if (!registration.usable) continue;
    const serves = (registration.expert.servesCapabilities ?? []).filter((capability) => wanted.includes(capability));
    if (serves.length === 0) continue;
    // Order the served capabilities the way the task listed them, so the
    // primary concern reads first rather than in registration order.
    const ordered = wanted.filter((capability) => serves.includes(capability));
    for (const capability of ordered) covered.add(capability);
    matches.push({ expertId: registration.expert.id, serves: ordered });
  }

  // Most coverage first; ties broken by id so the answer does not depend on the
  // order experts happened to be registered in.
  matches.sort((a, b) => b.serves.length - a.serves.length || (a.expertId < b.expertId ? -1 : a.expertId > b.expertId ? 1 : 0));

  const uncovered = wanted.filter((capability) => !covered.has(capability));

  const parts: string[] = [];
  parts.push(
    matches.length === 0
      ? "no registered expert serves any of the required capabilities"
      : `${matches.length} expert${matches.length === 1 ? "" : "s"} selected across ${covered.size} of ${wanted.length} required capabilities`,
  );
  if (uncovered.length > 0) parts.push(`uncovered: ${uncovered.join(", ")}`);
  if (lowConfidence.length > 0) parts.push(`set aside for low confidence: ${lowConfidence.join(", ")}`);

  return { requirements, matches, uncovered, lowConfidence, source: "analysis", reason: parts.join("; ") };
}
