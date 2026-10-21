/**
 * FAZ 15 1/3 — a proactive system that cannot measure its own false-positive rate
 * cannot know whether it is helping or training the user to ignore it.
 *
 * Measured first. The proactive layer is substantial: a 912-line
 * `ProactiveInitiativeService` with watchers, intake events, `runWatchers`,
 * `propose`, `budget`, `evaluate`, `markDelivered` and `dismiss`, and all five of
 * FAZ 15's mechanisms are present somewhere in the engine (opportunity 13 files,
 * anomaly 7, proactive 19, scheduled 13, trigger 32).
 *
 * What it does not have is a measure of its own accuracy. `InitiativeEvaluation`
 * reports `queued`, `suppressed`, `digested` and `budget` — that is a decision
 * about **what to send now**. `dismiss` records a dismissal, and nothing ever
 * turns those records into a rate. So the system decides what to surface, and
 * never learns whether surfacing it was right.
 *
 * That matters more here than in the other subsystems, because the failure mode is
 * self-reinforcing: a proactive assistant that surfaces mostly noise does not get
 * ignored for one message, it gets ignored permanently. Nothing in the engine
 * currently distinguishes "the user is quiet because there is nothing to say"
 * from "the user is quiet because they stopped reading".
 *
 * Five rules:
 *
 *   1. Precision is computed only over initiatives that actually reached the
 *      user. `candidate`, `queued`, `suppressed`, `digested` and `expired` never
 *      reached anyone, so counting them inflates the number — a suppressed
 *      initiative is not a correct one, it is one nobody saw.
 *   2. Too few delivered initiatives gives `insufficient-sample`, never a rate.
 *      100% precision over one delivered initiative is not a measurement; it is
 *      one initiative.
 *   3. Precision is always reported with its denominator. A bare percentage is
 *      the shape that gets quoted without the thing that makes it mean anything.
 *   4. A dismissal is a signal, not a verdict — a dismissed initiative may still
 *      have been worth surfacing. But a dismissal *rate* across a real sample is
 *      evidence, and that is what this computes.
 *   5. A high dismissal rate is stated plainly as a defect of the system. Not
 *      softened, and not attributed to the user.
 */

import type { Initiative } from "./proactive-initiative-service.js";

/** Which states mean the initiative was actually put in front of the user. */
const REACHED_USER = new Set<Initiative["state"]>(["delivered", "dismissed"]);

export type PrecisionVerdict = "measured" | "insufficient-sample";

export interface ProactivePrecision {
  readonly verdict: PrecisionVerdict;
  /** Initiatives that reached the user in any form. The denominator. */
  readonly reached: number;
  /** Reached and left standing. */
  readonly accepted: number;
  /** Reached and dismissed. */
  readonly dismissed: number;
  /** Present only when the verdict is `measured`. */
  readonly precision?: number;
  /** Initiatives that never reached anyone, reported so they are not mistaken for accuracy. */
  readonly neverReached: number;
  readonly detail: string;
}

/**
 * Measures how much of what the system put in front of the user was wanted.
 *
 * `minSample` defaults to 10: below that, a rate is more misleading than an
 * admitted absence of one. It is a parameter rather than a constant because the
 * right floor depends on how often the system speaks at all.
 */
export function measureProactivePrecision(
  initiatives: readonly Initiative[],
  options: { minSample?: number } = {},
): ProactivePrecision {
  const minSample = options.minSample ?? 10;
  const reached = initiatives.filter((initiative) => REACHED_USER.has(initiative.state));
  const dismissed = reached.filter((initiative) => initiative.state === "dismissed").length;
  const accepted = reached.length - dismissed;
  const neverReached = initiatives.length - reached.length;

  if (reached.length < minSample) {
    return {
      verdict: "insufficient-sample",
      reached: reached.length,
      accepted,
      dismissed,
      neverReached,
      detail:
        `only ${reached.length} initiative(s) reached the user, below the ${minSample} needed to measure precision — ` +
        `a rate over this few would be a description of those initiatives, not of the system`,
    };
  }

  const precision = accepted / reached.length;
  const parts = [
    `${accepted}/${reached.length} delivered initiative(s) were left standing (${Math.round(precision * 100)}%)`,
    `${dismissed} dismissed`,
  ];
  if (neverReached > 0) {
    parts.push(`${neverReached} never reached the user and are excluded, because an unseen initiative is not a correct one`);
  }
  if (precision < 0.5) {
    parts.push(
      `most of what was surfaced was dismissed: the system is training the user to stop reading, and that is a defect of the system rather than of the user`,
    );
  }

  return {
    verdict: "measured",
    reached: reached.length,
    accepted,
    dismissed,
    precision,
    neverReached,
    detail: parts.join("; "),
  };
}

/**
 * Whether the measurement is sound enough to act on.
 *
 * An `insufficient-sample` is not a pass. Acting on it would mean adjusting a
 * proactive system on the strength of a handful of messages — the same shape as
 * adjusting one on the strength of none.
 */
export function isPrecisionActionable(measurement: ProactivePrecision): boolean {
  return measurement.verdict === "measured";
}
