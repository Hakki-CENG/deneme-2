/**
 * FAZ 22 1/3 — a transition model learned from what was observed, which says so.
 *
 * Measured first. `world/` is 1965 lines across four files, and four of FAZ 22's
 * five additions are already there: structured state (`upsertEntity`, `recordState`,
 * `stateAt`, `temporalView` — 36 mentions of "structured"), causal relations
 * (`assertCausality`, `recordCausalObservation`, `causalLinks` — 19), uncertainty
 * (16) and counterfactual (4). Surprise appears 42 times.
 *
 * "transition" appears **zero** times. That is the missing piece.
 *
 * It is also the one the plan calls *learned*, which is where this has to be
 * careful: FAZ 21 just renamed two modules whose names promised learning they did
 * not do. The measurement that decides whether this can be built at all is
 * `recordCausalObservation`, and it is genuinely instructive — it increments
 * confirmations and refutations, recomputes confidence as Laplace-smoothed
 * `(c+1)/(total+2)`, and adjusts strength. That is real learning from data. It is
 * statistical rather than neural, and it works.
 *
 * So a learned transition model is buildable here without a model server: count
 * observed transitions and report the distribution they imply. This does that, and
 * names itself for what it is.
 *
 * Five rules:
 *
 *   1. A transition probability comes only from observed transitions, never
 *      declared. Nothing here accepts a caller-supplied probability.
 *   2. An unobserved (state, action) pair has no prediction at all — not
 *      probability zero. Zero would claim "this leads nowhere", which is a
 *      statement about the world; absent is a statement about the record. This is
 *      the world-model version of the rule FAZ 12, 14 and 20 all encode.
 *   3. Too few observations gives `insufficient-sample`, not a probability. A
 *      transition seen once is an anecdote, and reporting it as 100% is how a world
 *      model becomes confidently wrong.
 *   4. Every prediction carries its sample size. A probability without a
 *      denominator is the shape that gets acted on as though it meant something.
 *   5. The model states that it is a frequency model. It is not a neural
 *      transition function and does not generalise to states it has not seen;
 *      saying so here is cheaper than renaming it later.
 */

export interface ObservedTransition {
  readonly fromState: string;
  readonly action: string;
  readonly toState: string;
}

export type TransitionVerdict = "predicted" | "insufficient-sample" | "unobserved";

export interface TransitionPrediction {
  readonly fromState: string;
  readonly action: string;
  readonly verdict: TransitionVerdict;
  /** Most frequent outcome, when there is enough evidence to name one. */
  readonly toState?: string;
  readonly probability?: number;
  /** Transitions observed for this (state, action) pair. The denominator. */
  readonly observations: number;
  /** All outcomes seen, with their counts, so a split is visible. */
  readonly distribution: readonly { toState: string; count: number }[];
  readonly detail: string;
}

export interface TransitionModelSummary {
  readonly pairs: number;
  readonly transitions: number;
  readonly mechanism: string;
}

/** Minimum observations before a frequency is reported as a probability. */
export const MIN_TRANSITION_OBSERVATIONS = 5;

/**
 * A transition model built from observed transitions.
 *
 * Deliberately a class over an immutable record rather than a mutable store: the
 * caller owns persistence, and the model is rebuilt from the transitions it is
 * given, so it can never drift away from its own evidence.
 */
export class TransitionModel {
  private readonly counts = new Map<string, Map<string, number>>();
  private readonly totals = new Map<string, number>();
  private transitionCount = 0;

  constructor(observations: readonly ObservedTransition[] = []) {
    for (const observation of observations) this.observe(observation);
  }

  /** Records one observed transition. */
  observe(observation: ObservedTransition): this {
    const key = TransitionModel.key(observation.fromState, observation.action);
    const outcomes = this.counts.get(key) ?? new Map<string, number>();
    outcomes.set(observation.toState, (outcomes.get(observation.toState) ?? 0) + 1);
    this.counts.set(key, outcomes);
    this.totals.set(key, (this.totals.get(key) ?? 0) + 1);
    this.transitionCount += 1;
    return this;
  }

  /**
   * Predicts the next state.
   *
   * `minObservations` defaults to `MIN_TRANSITION_OBSERVATIONS`. A caller may lower
   * it, but not below 1 — a probability over zero observations is not a lowering of
   * the bar, it is the absence of one.
   */
  predict(
    fromState: string,
    action: string,
    options: { minObservations?: number } = {},
  ): TransitionPrediction {
    const minObservations = Math.max(1, options.minObservations ?? MIN_TRANSITION_OBSERVATIONS);
    const key = TransitionModel.key(fromState, action);
    const outcomes = this.counts.get(key);
    const base = { fromState, action };

    // Rule 2: never seen is not "leads nowhere".
    if (outcomes === undefined) {
      return {
        ...base,
        verdict: "unobserved",
        observations: 0,
        distribution: [],
        detail: `no transition from "${fromState}" under "${action}" has been observed, which is a gap in the record rather than a statement that nothing happens`,
      };
    }

    const distribution = [...outcomes.entries()]
      .map(([toState, count]) => ({ toState, count }))
      .sort((a, b) => b.count - a.count || a.toState.localeCompare(b.toState));
    const total = this.totals.get(key) ?? 0;

    // Rule 3: an anecdote is not a probability.
    if (total < minObservations) {
      return {
        ...base,
        verdict: "insufficient-sample",
        observations: total,
        distribution,
        detail:
          `only ${total} transition(s) observed from "${fromState}" under "${action}", below the ${minObservations} needed to report a probability` +
          (distribution.length > 1 ? `, and they already disagree: ${distribution.map((d) => `${d.toState} ×${d.count}`).join(", ")}` : ""),
      };
    }

    const top = distribution[0]!;
    return {
      ...base,
      verdict: "predicted",
      toState: top.toState,
      probability: top.count / total,
      observations: total,
      distribution,
      detail:
        `"${top.toState}" in ${top.count}/${total} observed transitions` +
        (distribution.length > 1
          ? ` — the outcome is not deterministic: ${distribution.map((d) => `${d.toState} ×${d.count}`).join(", ")}`
          : ""),
    };
  }

  /** Rule 5: what this mechanism is, stated where a reader will see it. */
  summary(): TransitionModelSummary {
    return {
      pairs: this.counts.size,
      transitions: this.transitionCount,
      mechanism:
        "frequency counts over observed transitions. This is not a neural transition function and does not generalise to states it has not seen",
    };
  }

  private static key(fromState: string, action: string): string {
    return `${fromState}\u0000${action}`;
  }
}

/**
 * Whether a prediction can be acted on.
 *
 * False for `unobserved` and for `insufficient-sample`. Planning against either
 * would mean the world model asserting something it has no evidence for — which is
 * the failure mode the whole predict/observe/compare loop exists to catch.
 */
export function isPredictionActionable(prediction: TransitionPrediction): boolean {
  return prediction.verdict === "predicted";
}
