/**
 * Persisted baselines: the part that makes "is this version better?" answerable
 * from disk rather than from someone's memory of last week's run.
 *
 * A baseline is not just the aggregate. It stores the per-run records too,
 * because the question that actually blocks a release is rarely "did the mean
 * move" — it is "which task that used to pass now fails". An aggregate-only
 * baseline cannot answer that, and a big domain improving will happily hide a
 * small one breaking.
 */
import { mkdir, readFile, rename, readdir } from "node:fs/promises";
import { join } from "node:path";
import { compareOutcomeMetrics, deriveOutcomeMetrics, findRegressions } from "../metrics/outcome-metrics.js";
import type { OutcomeMetrics, RunRecord } from "../tasks/types.js";

export interface BaselineRecord {
  readonly id: string;
  /** Human label — branch, tag, or release name. */
  readonly label: string;
  /**
   * Commit the baseline was measured at, or null when it could not be
   * determined. Stored rather than inferred later: a baseline whose provenance
   * has to be guessed is not a baseline.
   */
  readonly gitSha: string | null;
  readonly version: string;
  /** Provider/model under test, e.g. "mock" or "anthropic:claude-x". */
  readonly model: string;
  readonly generatedAt: string;
  readonly metrics: OutcomeMetrics;
  readonly runs: RunRecord[];
}

export interface BaselineSummary {
  readonly id: string;
  readonly label: string;
  readonly gitSha: string | null;
  readonly version: string;
  readonly model: string;
  readonly generatedAt: string;
  readonly taskSuccess: number;
  readonly runs: number;
}

export interface BaselineComparison {
  readonly baselineId: string;
  readonly baselineMetrics: OutcomeMetrics;
  readonly candidateMetrics: OutcomeMetrics;
  readonly verdict: "improved" | "regressed" | "unchanged";
  readonly reasons: string[];
  /** Tasks that passed in the baseline and fail now. */
  readonly regressions: Array<{ taskId: string; domain: string; before: boolean; after: boolean }>;
  /**
   * Whether a release gate should stop. True on an aggregate regression OR on
   * any single task regression: a rising average does not license shipping a
   * task that used to work and no longer does.
   */
  readonly blocking: boolean;
}

function fileFor(dir: string, id: string): string {
  return join(dir, `baseline-${id}.json`);
}

const LATEST = "latest.json";

export async function saveBaseline(dir: string, record: BaselineRecord): Promise<string> {
  await mkdir(dir, { recursive: true });
  const serialised = JSON.stringify(record, null, 2) + "\n";
  const target = fileFor(dir, record.id);
  // Write-then-rename: a reader must never observe a half-written baseline and
  // treat it as the truth. A partial JSON file that parses to garbage is worse
  // than no file at all.
  const tmp = `${target}.tmp`;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(tmp, serialised, "utf8");
  await rename(tmp, target);
  await writeFile(join(dir, LATEST), serialised, "utf8");
  return target;
}

/** Parses and validates; returns null for a missing or unreadable file. */
export async function loadBaseline(dir: string, id?: string): Promise<BaselineRecord | null> {
  const path = id === undefined ? join(dir, LATEST) : fileFor(dir, id);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Partial<BaselineRecord>;
  if (typeof candidate.id !== "string" || candidate.metrics === undefined || !Array.isArray(candidate.runs)) return null;
  return candidate as BaselineRecord;
}

export async function listBaselines(dir: string): Promise<BaselineSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: BaselineSummary[] = [];
  for (const entry of entries) {
    if (!entry.startsWith("baseline-") || !entry.endsWith(".json")) continue;
    const record = await loadBaseline(dir, entry.slice("baseline-".length, -".json".length));
    if (record === null) continue;
    out.push({
      id: record.id,
      label: record.label,
      gitSha: record.gitSha,
      version: record.version,
      model: record.model,
      generatedAt: record.generatedAt,
      taskSuccess: record.metrics.taskSuccess,
      runs: record.runs.length,
    });
  }
  return out.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
}

/**
 * Compares a candidate batch against a stored baseline.
 *
 * Returns null when no baseline exists — deliberately, rather than declaring an
 * improvement. With nothing to compare against there is no verdict to give, and
 * a gate that reads "improved" from an absent baseline would pass everything on
 * the first run.
 */
export async function compareAgainstBaseline(
  dir: string,
  candidateRuns: RunRecord[],
  options: { baselineId?: string } = {},
): Promise<BaselineComparison | null> {
  const baseline = await loadBaseline(dir, options.baselineId);
  if (baseline === null) return null;

  const candidateMetrics = deriveOutcomeMetrics(candidateRuns);
  const comparison = compareOutcomeMetrics(baseline.metrics, candidateMetrics);
  const regressions = findRegressions(baseline.runs, candidateRuns);
  const blocking =
    comparison.verdict === "regressed" ||
    regressions.length > 0 ||
    // Safety is not a tradeable axis: more violations is blocking even if every
    // other number improved.
    candidateMetrics.safetyViolations > baseline.metrics.safetyViolations;

  const reasons = [...comparison.reasons];
  if (regressions.length > 0) reasons.push(`${regressions.length} task(s) that passed in the baseline now fail`);
  if (candidateMetrics.safetyViolations > baseline.metrics.safetyViolations) {
    reasons.push(
      `safety violations rose (${baseline.metrics.safetyViolations} -> ${candidateMetrics.safetyViolations})`,
    );
  }

  return {
    baselineId: baseline.id,
    baselineMetrics: baseline.metrics,
    candidateMetrics,
    verdict: blocking ? "regressed" : comparison.verdict,
    reasons,
    regressions,
    blocking,
  };
}
