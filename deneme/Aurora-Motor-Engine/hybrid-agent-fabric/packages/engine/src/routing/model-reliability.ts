/**
 * FAZ 20 1/3 — a model that is right when it answers and unusable half the time is
 * not a reliable model, and nothing in the router could see that.
 *
 * Measured first. The model layer is large: 24 files under `models/` including nine
 * providers, an OAuth manager, a credential pool, provider profiles and a
 * stage-model policy. Routing is substantial too — `routing/model-routing.ts` (601
 * lines) has `AdaptiveModelRouter`, `BenchmarkRunner`, `ModelComparator` and
 * `ModelRoutingPipeline`, and scoring is `accuracy * 0.6 + latency * 0.2 +
 * cost * 0.2`. Privacy is already handled honestly in `ModelProviderRegistry`:
 * locality is declared per provider and an undeclared provider is assumed to be
 * cloud, because for a privacy constraint the safe assumption about an unknown is
 * that data would leave the device.
 *
 * What is missing is FAZ 20's reliability dimension, and the measurement is
 * unambiguous: the word "reliability" appears in **zero** files under `routing/`
 * and `models/`. `ModelProfile` carries `accuracy: number // 0-1` — one declared
 * figure — alongside declared `latencyMs` and `costPerToken`.
 *
 * Reliability is not accuracy, and treating them as one thing hides the failure
 * mode that matters most in production. A model can be excellent on every request
 * it completes and still be a poor choice because it times out, refuses, or returns
 * malformed output on half of them. A router scoring on declared accuracy keeps
 * choosing that model forever, because each *successful* run confirms the number it
 * was picked for.
 *
 * Five rules:
 *
 *   1. Reliability is measured from observed runs, never declared. A profile cannot
 *      state its own reliability, for the same reason FAZ 19's arena cannot rank on
 *      a strategy's own estimate.
 *   2. A run that errored, timed out, or returned unusable output counts against
 *      reliability. Those are not wrong answers; they are absences of an answer, and
 *      they are what a caller actually experiences as unreliability.
 *   3. Too few runs gives `insufficient-sample`, and that must not read as reliable.
 *      The tempting default — no failures observed, therefore reliable — is exactly
 *      backwards for a model that has never been tried.
 *   4. Reliability is always reported with its denominator. A bare rate is the shape
 *      that gets quoted without the thing that makes it mean anything.
 *   5. Declared accuracy and measured reliability are reported as separate facts.
 *      Collapsing them is how a model that is right when it answers gets selected
 *      for work that cannot tolerate it not answering.
 */

export type RunOutcomeKind = "usable" | "unusable" | "error" | "timeout";

export interface ModelRunRecord {
  readonly modelId: string;
  readonly outcome: RunOutcomeKind;
}

export type ReliabilityVerdict = "measured" | "insufficient-sample";

export interface ModelReliability {
  readonly modelId: string;
  readonly verdict: ReliabilityVerdict;
  readonly runs: number;
  readonly usable: number;
  /** Errors, timeouts and unusable output, counted together: all are "no answer". */
  readonly unusable: number;
  readonly timeouts: number;
  readonly errors: number;
  /** Present only when the verdict is `measured`. */
  readonly reliability?: number;
  readonly detail: string;
}

/**
 * Measures how often a model actually delivered something usable.
 *
 * `minRuns` defaults to 10, matching FAZ 15's precision floor: below that a rate
 * describes those runs rather than the model.
 */
export function measureModelReliability(
  modelId: string,
  runs: readonly ModelRunRecord[],
  options: { minRuns?: number } = {},
): ModelReliability {
  const minRuns = options.minRuns ?? 10;
  const mine = runs.filter((run) => run.modelId === modelId);
  const usable = mine.filter((run) => run.outcome === "usable").length;
  const timeouts = mine.filter((run) => run.outcome === "timeout").length;
  const errors = mine.filter((run) => run.outcome === "error").length;
  const unusable = mine.length - usable;

  if (mine.length < minRuns) {
    return {
      modelId,
      verdict: "insufficient-sample",
      runs: mine.length,
      usable,
      unusable,
      timeouts,
      errors,
      detail:
        mine.length === 0
          ? `this model has never been run, and "no failures observed" is not evidence of reliability — it is evidence that nothing was tried`
          : `only ${mine.length} run(s) recorded for this model, below the ${minRuns} needed to measure reliability`,
    };
  }

  const reliability = usable / mine.length;
  const parts = [`${usable}/${mine.length} runs were usable (${Math.round(reliability * 100)}%)`];
  if (timeouts > 0) parts.push(`${timeouts} timed out`);
  if (errors > 0) parts.push(`${errors} errored`);
  if (unusable - timeouts - errors > 0) parts.push(`${unusable - timeouts - errors} returned unusable output`);
  if (reliability < 0.5) {
    parts.push("this model fails to deliver more often than it delivers, whatever its accuracy is when it does");
  }

  return { modelId, verdict: "measured", runs: mine.length, usable, unusable, timeouts, errors, reliability, detail: parts.join("; ") };
}

/**
 * Whether the measurement is sound enough to route on.
 *
 * An `insufficient-sample` is not a pass. Routing on it would mean preferring a
 * model nobody has tried over one that has been measured — which is the behaviour
 * a reliability dimension exists to prevent.
 */
export function isReliabilityActionable(measurement: ModelReliability): boolean {
  return measurement.verdict === "measured";
}

/**
 * Reports declared accuracy and measured reliability side by side.
 *
 * Rule 5: the two are different facts. A caller choosing a model for work that
 * cannot tolerate a non-answer needs both, and needs to see that they can disagree.
 */
export function compareAccuracyAndReliability(
  modelId: string,
  declaredAccuracy: number,
  measurement: ModelReliability,
): { modelId: string; declaredAccuracy: number; measuredReliability?: number; gap?: number; detail: string } {
  if (measurement.reliability === undefined) {
    return {
      modelId,
      declaredAccuracy,
      detail: `declared accuracy ${declaredAccuracy.toFixed(2)}, reliability not measured: ${measurement.detail}`,
    };
  }
  const gap = declaredAccuracy - measurement.reliability;
  return {
    modelId,
    declaredAccuracy,
    measuredReliability: measurement.reliability,
    gap,
    detail:
      `declared accuracy ${declaredAccuracy.toFixed(2)} against measured reliability ${measurement.reliability.toFixed(2)}` +
      (gap > 0.2
        ? ` — a gap of ${gap.toFixed(2)}: the model is right when it answers and often does not answer, which accuracy alone does not show`
        : ""),
  };
}
