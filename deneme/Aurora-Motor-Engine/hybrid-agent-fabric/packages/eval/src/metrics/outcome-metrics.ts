/**
 * Outcome metrics — the numbers that answer "is this version better?"
 *
 * `TaskMetrics` describes a single run. A pass/fail rate across a batch does not
 * describe a *version*, because it can be improved without the agent getting any
 * better: retry harder and the pass rate rises, or stop verifying and the pass
 * rate rises again. Three of the figures below exist specifically to make those
 * two cheats visible.
 *
 *   falseSuccess        passed acceptance but nothing independent confirmed it.
 *                       This is the metric to drive toward zero; a suite whose
 *                       pass rate climbs while this climbs too is not improving.
 *   firstAttemptSuccess success before any retry — retrying is recovery, not
 *                       competence, and mixing the two flatters a release.
 *   recoverySuccess     of the runs that did fail, how many came back. Kept
 *                       separate so real recovery is credited without letting it
 *                       masquerade as first-attempt capability.
 *
 * Every ratio is 0 when its denominator is empty rather than NaN, so a partial
 * batch still produces comparable output instead of poisoning an average.
 */
import type { OutcomeComparison, OutcomeMetrics, RunRecord } from "../tasks/types.js";

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function deriveOutcomeMetrics(runs: readonly RunRecord[]): OutcomeMetrics {
  const total = runs.length;
  const succeeded = runs.filter((run) => run.succeeded).length;
  const verified = runs.filter((run) => run.succeeded && run.verified).length;
  const firstAttempt = runs.filter((run) => run.succeeded && run.attempts <= 1).length;
  const failedOnce = runs.filter((run) => run.attempts > 1);
  const recovered = failedOnce.filter((run) => run.recovered).length;
  // A pass with no verification behind it. Counted from the successes, not from
  // every run, so it reads as "share of our wins that we cannot defend".
  const unverifiedWins = runs.filter((run) => run.succeeded && !run.verified).length;

  const toolCalls = runs.reduce((sum, run) => sum + run.toolCalls, 0);
  const toolFailures = runs.reduce((sum, run) => sum + run.toolFailures, 0);

  const byDomain: OutcomeMetrics["byDomain"] = {};
  for (const run of runs) {
    const bucket = (byDomain[run.domain] ??= { runs: 0, taskSuccess: 0, verifiedSuccess: 0, falseSuccess: 0 });
    bucket.runs += 1;
    if (run.succeeded) bucket.taskSuccess += 1;
    if (run.succeeded && run.verified) bucket.verifiedSuccess += 1;
    if (run.succeeded && !run.verified) bucket.falseSuccess += 1;
  }
  // Normalise the per-domain counts to rates so domains of different sizes are
  // comparable side by side.
  for (const bucket of Object.values(byDomain)) {
    const n = bucket.runs;
    bucket.taskSuccess = ratio(bucket.taskSuccess, n);
    bucket.verifiedSuccess = ratio(bucket.verifiedSuccess, n);
    bucket.falseSuccess = ratio(bucket.falseSuccess, n);
  }

  const latencies = runs.map((run) => run.durationMs).sort((a, b) => a - b);
  const withBudget = runs.filter((run) => run.contextBudget > 0);
  const replans = runs.reduce((sum, run) => sum + run.replans, 0);
  const steps = runs.reduce((sum, run) => sum + run.steps, 0);
  const withRecall = runs.filter((run) => typeof run.recallAtK === "number");
  const longHorizon = runs.filter((run) => run.sessions > 1);

  return {
    runs: total,
    taskSuccess: ratio(succeeded, total),
    verifiedSuccess: ratio(verified, total),
    firstAttemptSuccess: ratio(firstAttempt, total),
    recoverySuccess: ratio(recovered, failedOnce.length),
    falseSuccess: ratio(unverifiedWins, succeeded),
    toolEfficiency: ratio(toolCalls - toolFailures, toolCalls),
    meanSteps: ratio(steps, total),
    meanCostUsd: ratio(runs.reduce((sum, run) => sum + run.costUsd, 0), total),
    meanLatencyMs: ratio(runs.reduce((sum, run) => sum + run.durationMs, 0), total),
    p95LatencyMs: percentile(latencies, 0.95),
    meanContextUtilisation:
      withBudget.length > 0
        ? withBudget.reduce((sum, run) => sum + run.contextTokens / run.contextBudget, 0) / withBudget.length
        : 0,
    // A count, not a rate: two violations in one run and one violation in each
    // of two runs are different failures and averaging them hides that.
    safetyViolations: runs.reduce((sum, run) => sum + run.safetyViolations, 0),
    planningQualityProxy: steps > 0 ? Math.max(0, 1 - replans / steps) : 0,
    memoryRetrievalQuality:
      withRecall.length > 0 ? withRecall.reduce((sum, run) => sum + (run.recallAtK ?? 0), 0) / withRecall.length : null,
    longHorizonCompletion:
      longHorizon.length > 0 ? ratio(longHorizon.filter((run) => run.succeeded).length, longHorizon.length) : null,
    byDomain,
  };
}

/** Nearest-rank percentile; 0 for an empty sample. */
function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index]!;
}

/**
 * Tasks that regressed between two batches.
 *
 * Aggregate rates can rise while individual tasks break — one big domain
 * improving masks a small one failing. This is the per-task view, and it is the
 * one a release gate should block on.
 */
export function findRegressions(
  baseline: readonly RunRecord[],
  candidate: readonly RunRecord[],
): Array<{ taskId: string; domain: string; before: boolean; after: boolean }> {
  const before = new Map(baseline.map((run) => [run.taskId, run]));
  const out: Array<{ taskId: string; domain: string; before: boolean; after: boolean }> = [];
  for (const run of candidate) {
    const prior = before.get(run.taskId);
    if (prior === undefined) continue; // new task, not a regression
    if (prior.succeeded && !run.succeeded) {
      out.push({ taskId: run.taskId, domain: run.domain, before: true, after: false });
    }
  }
  return out;
}

/**
 * Compare two batches and report what actually moved.
 *
 * Returns a verdict rather than a table of deltas, because the interesting
 * question is not "did the pass rate rise" but "did it rise for a defensible
 * reason". A pass-rate gain accompanied by a false-success gain is reported as a
 * regression even though the headline number improved.
 */
export function compareOutcomeMetrics(
  baseline: OutcomeMetrics,
  candidate: OutcomeMetrics,
): OutcomeComparison {
  const reasons: string[] = [];
  let improved = 0;
  let regressed = 0;

  const note = (label: string, before: number, after: number, higherIsBetter: boolean) => {
    const delta = after - before;
    if (Math.abs(delta) < 1e-9) return;
    const better = higherIsBetter ? delta > 0 : delta < 0;
    if (better) improved += 1;
    else regressed += 1;
    reasons.push(`${label}: ${before.toFixed(3)} -> ${after.toFixed(3)} (${delta > 0 ? "+" : ""}${delta.toFixed(3)})`);
  };

  note("verifiedSuccess", baseline.verifiedSuccess, candidate.verifiedSuccess, true);
  note("firstAttemptSuccess", baseline.firstAttemptSuccess, candidate.firstAttemptSuccess, true);
  note("recoverySuccess", baseline.recoverySuccess, candidate.recoverySuccess, true);
  note("falseSuccess", baseline.falseSuccess, candidate.falseSuccess, false);
  note("toolEfficiency", baseline.toolEfficiency, candidate.toolEfficiency, true);
  note("meanCostUsd", baseline.meanCostUsd, candidate.meanCostUsd, false);

  // A headline pass-rate gain bought with unverified passes is not progress.
  if (candidate.taskSuccess > baseline.taskSuccess && candidate.falseSuccess > baseline.falseSuccess) {
    regressed += 1;
    reasons.push(
      `taskSuccess rose ${baseline.taskSuccess.toFixed(3)} -> ${candidate.taskSuccess.toFixed(3)} while falseSuccess also rose — the gain is not verified`,
    );
  }

  const verdict = regressed > improved ? "regressed" : improved > regressed ? "improved" : "unchanged";
  return { verdict, reasons };
}
