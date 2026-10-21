/**
 * FAZ 19 1/3 — a strategy is ranked by what it achieved, not by what it predicted.
 *
 * Measured first. `aurora/strategy-generator.ts` (170 lines) already proposes
 * several distinct strategies for one goal — `TaskStrategy`, `selectStrategy`,
 * `parseStrategyProposals`, and a system prompt that asks for distinct approaches.
 * That half of FAZ 19 exists.
 *
 * What it does is *select*, not *race*. `selectStrategy` ranks by risk first and
 * speed second, using `candidate.riskLevel` and `candidate.estimatedMs` — and the
 * comment on `estimatedMs` says plainly that it is "the planner's own estimate". So
 * the strategy that claims to be fastest and least risky wins, and the claim is
 * never tested. The proposer grades its own homework.
 *
 * That is exactly what FAZ 19's line forbids: "Aurora should not say 'always my
 * way'". A ranking built on self-declared estimates is that sentence with extra
 * steps, because whichever approach the planner favours is also the one that gets
 * the flattering numbers.
 *
 * This adds the measurement half. It does not run strategies — that needs a model,
 * and none runs in this sandbox — it takes outcomes and ranks them honestly.
 *
 * Five rules:
 *
 *   1. Ranking uses measured outcomes only. A strategy's own `estimatedMs` and
 *      `riskLevel` are the proposer's prediction and never appear in the ranking.
 *   2. A strategy that did not run is `not-run`, never last place. Ranking an
 *      unrun strategy as the worst of the field is a fabricated result — it invents
 *      a performance nobody observed.
 *   3. Fewer than two strategies with a measured outcome means no ranking at all,
 *      `comparable: false`. The same rule FAZ 7 applied to a single-contestant
 *      coding arena: one result is not a comparison.
 *   4. A tie is a tie and is labelled one, never broken by declaration order.
 *   5. An outcome that was not verified does not count as a win. A strategy that
 *      produced something nobody checked did not win; it produced unchecked output.
 *      This is FAZ 18's point arriving in the arena: generation without
 *      verification has nothing to rank.
 */

import type { TaskStrategy } from "./strategy-generator.js";

export interface StrategyRunOutcome {
  readonly strategyId: string;
  /** False when the strategy never executed, for any reason. */
  readonly ran: boolean;
  readonly succeeded: boolean;
  /** Whether something outside the strategy checked the result. */
  readonly verified: boolean;
  /** Wall-clock time actually taken. Absent when it did not run. */
  readonly measuredMs?: number;
  readonly detail: string;
}

export interface StrategyStanding {
  readonly strategyId: string;
  readonly name: string;
  readonly place: number;
  readonly measuredMs: number;
  readonly detail: string;
}

export interface StrategyArenaResult {
  /** False when there is nothing to compare, so no ranking is offered. */
  readonly comparable: boolean;
  readonly ranking: readonly StrategyStanding[];
  readonly winner?: string;
  readonly notRun: readonly string[];
  /** Ran, but nothing checked the output. */
  readonly unverified: readonly string[];
  readonly summary: string;
}

/**
 * Ranks strategies by what they measured.
 *
 * Takes the proposed strategies alongside the outcomes so that a strategy which
 * never produced an outcome is reported as absent rather than silently dropped —
 * a field of four with one missing is not a field of three.
 */
export function raceStrategies(
  strategies: readonly TaskStrategy[],
  outcomes: readonly StrategyRunOutcome[],
): StrategyArenaResult {
  const byId = new Map(strategies.map((strategy) => [strategy.id, strategy]));
  const byOutcome = new Map(outcomes.map((outcome) => [outcome.strategyId, outcome]));

  const notRun: string[] = [];
  const unverified: string[] = [];
  const ranked: Array<{ strategyId: string; name: string; measuredMs: number; detail: string }> = [];

  for (const strategy of strategies) {
    const outcome = byOutcome.get(strategy.id);

    // Rule 2: not run is not last place.
    if (outcome === undefined || !outcome.ran) {
      notRun.push(strategy.id);
      continue;
    }
    // Rule 5: an unchecked result is not a win.
    if (!outcome.verified) {
      unverified.push(strategy.id);
      continue;
    }
    if (!outcome.succeeded) continue;

    ranked.push({
      strategyId: strategy.id,
      name: strategy.name,
      measuredMs: outcome.measuredMs ?? 0,
      detail: outcome.detail,
    });
  }

  const nameOf = (id: string): string => byId.get(id)?.name ?? id;
  const notes: string[] = [];
  if (notRun.length > 0) notes.push(`${notRun.length} did not run (${notRun.map(nameOf).join(", ")}) and are not ranked`);
  if (unverified.length > 0) {
    notes.push(`${unverified.length} produced output nothing checked (${unverified.map(nameOf).join(", ")}) and cannot be ranked as a win`);
  }

  // Rule 3: one measured result is not a comparison.
  if (ranked.length < 2) {
    return {
      comparable: false,
      ranking: [],
      notRun,
      unverified,
      summary:
        `no ranking: ${ranked.length} of ${strategies.length} strategies produced a verified, measured outcome` +
        (notes.length > 0 ? `; ${notes.join("; ")}` : ""),
    };
  }

  ranked.sort((a, b) => a.measuredMs - b.measuredMs);

  // Rule 4: equal measured times share a place rather than being ordered by
  // whoever was proposed first.
  const ranking: StrategyStanding[] = [];
  let place = 1;
  for (let index = 0; index < ranked.length; index += 1) {
    const entry = ranked[index]!;
    if (index > 0 && entry.measuredMs > ranked[index - 1]!.measuredMs) place = index + 1;
    ranking.push({ strategyId: entry.strategyId, name: entry.name, place, measuredMs: entry.measuredMs, detail: entry.detail });
  }

  const leaders = ranking.filter((standing) => standing.place === 1);
  const tied = leaders.length > 1;

  return {
    comparable: true,
    ranking,
    ...(tied ? {} : { winner: leaders[0]!.strategyId }),
    notRun,
    unverified,
    summary:
      (tied
        ? `${leaders.length} strategies tied at ${leaders[0]!.measuredMs}ms and the tie is reported as a tie rather than broken by proposal order`
        : `"${leaders[0]!.name}" was fastest at ${leaders[0]!.measuredMs}ms among ${ranked.length} verified runs`) +
      (notes.length > 0 ? `; ${notes.join("; ")}` : ""),
  };
}

/**
 * Whether the arena produced a result that can be acted on.
 *
 * False for `comparable: false`. Acting on a single measured strategy as though it
 * had won a race is how "always my way" comes back wearing a scoreboard.
 */
export function isArenaDecisive(result: StrategyArenaResult): boolean {
  return result.comparable && result.winner !== undefined;
}
