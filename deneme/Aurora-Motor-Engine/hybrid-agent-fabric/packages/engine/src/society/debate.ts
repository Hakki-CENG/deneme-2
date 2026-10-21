/**
 * FAZ 13 1/3 — a debate resolves a conflict by recording it, not by outvoting it.
 *
 * Measured first. "debate" appears in only 2 files and both are world-model files;
 * "conflict resolution" appears in 1, also world-model; "mentor" appears in none.
 * So the society layer has no debate mechanism at all.
 *
 * Consensus does exist — `execution/consensus-verifier.ts` — but it answers a
 * single binary claim: does this hold, yes or no, voted across independent
 * sources. That is the right mechanism for its question and the wrong one for
 * this phase's. When two experts produce *substantively different* positions —
 * "the cause is X" against "the cause is Y" — a majority vote picks one and
 * discards the other, and the result reads as a resolution when it is a
 * suppression. The losing position's evidence disappears from the record, which
 * is exactly how a wrong answer survives: nobody is left holding the objection.
 *
 * This is the same rule FAZ 8 applied to citations — an unresolved major
 * contradiction blocks and is never averaged away — applied to experts instead.
 *
 * Five rules:
 *
 *   1. A majority resolution does not delete the dissent. Every position is
 *      recorded with its evidence, and the resolution names what it overruled.
 *   2. A tie is `unresolved`, not a coin flip.
 *   3. A position with no supporting evidence cannot win. Without that rule the
 *      loudest expert wins, and a debate becomes a volume contest.
 *   4. An expert that abstained is not counted as agreeing, and two experts
 *      sharing a source are not two opinions — the independence rule consensus
 *      already enforces, applied to positions.
 *   5. If every position is evidence-free the debate is `unresolved` no matter
 *      how the votes fall. There is nothing to resolve on.
 */

export interface Position {
  /** Which expert holds it. */
  readonly expert: string;
  /** Where the expert's judgement comes from, for independence. */
  readonly source: string;
  /** The claim being advanced. */
  readonly stance: string;
  /** What supports it. Empty means the expert gave no support. */
  readonly evidence: readonly string[];
  /** Declining to take a position. Distinct from holding a weak one. */
  readonly abstained?: boolean;
}

export interface DebateResolution {
  readonly topic: string;
  readonly resolved: boolean;
  /** The stance adopted, when one was. */
  readonly adopted?: string;
  /** Every position taken, adopted and overruled alike. */
  readonly positions: readonly Position[];
  /** Positions that lost, kept with their evidence rather than dropped. */
  readonly overruled: readonly Position[];
  readonly abstentions: number;
  readonly independentSources: number;
  readonly outcome: "resolved" | "unresolved" | "tie";
  readonly summary: string;
}

/** How many distinct sources are represented among these positions. */
export function distinctSources(positions: readonly Position[]): number {
  return new Set(positions.map((position) => position.source)).size;
}

/** Whether a position advanced anything to support itself. */
export function hasEvidence(position: Position): boolean {
  return position.evidence.some((item) => item.trim().length > 0);
}

/**
 * Resolves a debate.
 *
 * The winner is the evidence-bearing position held by the most independent
 * sources. Not the most voices, and not the most confident one: sources, because
 * one expert holding three aliases is one opinion, and evidence, because without
 * it there is nothing to weigh.
 */
export function resolveDebate(topic: string, positions: readonly Position[]): DebateResolution {
  const taken = positions.filter((position) => position.abstained !== true);
  const abstentions = positions.length - taken.length;
  const sources = distinctSources(taken);

  const record = (outcome: DebateResolution["outcome"], adopted: string | undefined, summary: string): DebateResolution =>
    ({
      topic,
      resolved: outcome === "resolved",
      ...(adopted === undefined ? {} : { adopted }),
      positions,
      overruled: adopted === undefined ? [] : taken.filter((position) => position.stance !== adopted),
      abstentions,
      independentSources: sources,
      outcome,
      summary,
    });

  if (taken.length === 0) {
    return record("unresolved", undefined, `every expert abstained, so there is nothing to resolve`);
  }

  // Rule 3 and 5: evidence-free positions cannot carry a resolution.
  const supported = taken.filter(hasEvidence);
  if (supported.length === 0) {
    return record(
      "unresolved",
      undefined,
      `${taken.length} position(s) were taken but none offered evidence, so there is nothing to weigh — a debate between unsupported opinions is a volume contest, not an argument`,
    );
  }

  // One vote per source per stance: a source repeating itself is not more support.
  const tally = new Map<string, Set<string>>();
  for (const position of supported) {
    const holders = tally.get(position.stance);
    if (holders === undefined) tally.set(position.stance, new Set([position.source]));
    else holders.add(position.source);
  }

  const ranked = [...tally.entries()]
    .map(([stance, holders]) => ({ stance, support: holders.size }))
    .sort((a, b) => b.support - a.support);

  const leader = ranked[0]!;
  const runnerUp = ranked[1];

  // Rule 2: an even split is not a decision.
  if (runnerUp !== undefined && runnerUp.support === leader.support) {
    return record(
      "tie",
      undefined,
      `${leader.support} independent source(s) each for "${leader.stance}" and "${runnerUp.stance}" — a tie is recorded as a tie rather than broken by order of arrival`,
    );
  }

  const overruledStances = ranked.slice(1).map((entry) => `${entry.stance} (${entry.support} source(s))`);
  return record(
    "resolved",
    leader.stance,
    `"${leader.stance}" held by ${leader.support} independent source(s)${
      overruledStances.length > 0 ? `, overruling ${overruledStances.join(" and ")} — the overruled evidence stays on the record` : ""
    }${abstentions > 0 ? `; ${abstentions} abstention(s) were not counted as agreement` : ""}`,
  );
}

/**
 * Whether the resolution is safe to act on.
 *
 * A `tie` and an `unresolved` are both refusals, and they are kept distinct from
 * each other because they mean different things: a tie means the evidence split,
 * unresolved means there was none.
 */
export function isActionable(resolution: DebateResolution): boolean {
  return resolution.resolved;
}
