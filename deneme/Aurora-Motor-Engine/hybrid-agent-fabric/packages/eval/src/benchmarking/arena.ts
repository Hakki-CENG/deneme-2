/**
 * FAZ 7 — Coding Expert Arena: head-to-head verdicts over `compareRuns`.
 *
 * `benchmarking/comparison.ts` already compares agents honestly — shared task
 * set, `"not-provided"` instead of 0, `honestNotes`. What it does not do is
 * answer the question the plan asks: on this task family, does Aurora win, draw
 * or lose?
 *
 * Four rules keep the answer honest, and each one exists because the tempting
 * alternative would produce a number that looks like a result:
 *
 *   1. Fewer than two contestants with results means no comparison is possible.
 *      `comparable` is false and every verdict is `no-verdict`. A
 *      single-contestant arena does not report 100%.
 *   2. A task only one contestant ran is `no-verdict`, not a win.
 *   3. Two failures are a draw, and the reason says both failed. A draw between
 *      two agents that produced nothing is not a shared success.
 *   4. The ranking that decides a verdict is written down here, once: verified
 *      success beats unverified success beats completion beats nothing.
 *
 * Nothing in this file runs an agent. It scores results a caller obtained, and
 * reports which contestants could not run — which is the state of this
 * repository's sandbox, where no rival coding agent is installed.
 */

import type { ComparisonRun, ComparisonTaskResult } from "./comparison.js";

/** Why one result outranks another. Ordered strongest first. */
const RANKING = [
  { name: "verified success", rank: 3 },
  { name: "unverified success", rank: 2 },
  { name: "completed without success", rank: 1 },
  { name: "nothing", rank: 0 },
] as const;

/** Where a result sits on the ranking, and what to call it. */
export function rankResult(result: ComparisonTaskResult | undefined): { rank: number; label: string } {
  if (result === undefined) return { rank: 0, label: RANKING[3]!.name };
  if (result.verified === true) return { rank: 3, label: RANKING[0]!.name };
  if (result.success === true) return { rank: 2, label: RANKING[1]!.name };
  if (result.completed === true) return { rank: 1, label: RANKING[2]!.name };
  return { rank: 0, label: RANKING[3]!.name };
}

export type HeadToHead = "win" | "draw" | "loss" | "no-verdict";

export interface ArenaTaskVerdict {
  readonly taskId: string;
  readonly family: string;
  readonly verdict: HeadToHead;
  /** What decided it, in terms a reader can check against the runs. */
  readonly reason: string;
  readonly baseline: { agent: string; rank: number; label: string };
  readonly opponent: { agent: string; rank: number; label: string } | undefined;
}

export interface ContestantAvailability {
  readonly agent: string;
  readonly available: boolean;
  readonly reason?: string;
}

export interface ArenaReport {
  readonly family: string;
  /** The agent every verdict is measured against. */
  readonly baselineAgent: string;
  readonly contestants: readonly string[];
  readonly verdicts: readonly ArenaTaskVerdict[];
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly noVerdicts: number;
  /**
   * False when the arena cannot produce a comparison at all. A caller must not
   * turn `wins / (wins + draws + losses)` into a headline while this is false.
   */
  readonly comparable: boolean;
  /** Contestants that were named but produced nothing, and why. */
  readonly unavailable: readonly ContestantAvailability[];
  readonly honestNotes: readonly string[];
}

/**
 * Which family a task belongs to.
 *
 * Absent, every task in the runs belongs to the family being scored — the
 * natural reading of "score this family, here are the results". Supply one to
 * split a mixed run, e.g. by task-id prefix.
 */
export type FamilyOf = (taskId: string) => string;

/**
 * Scores one task family head-to-head against a baseline agent.
 *
 * `runs` are the results as obtained; `availability` lets a caller declare
 * contestants that could not run, so their absence is reported rather than
 * silently shrinking the field.
 */
export function scoreArenaFamily(
  family: string,
  runs: readonly ComparisonRun[],
  baselineAgent: string,
  options: { availability?: readonly ContestantAvailability[]; familyOf?: FamilyOf } = {},
): ArenaReport {
  const familyOf = options.familyOf ?? ((): string => family);
  const honestNotes: string[] = [];

  const scored = runs.filter((run) => run.agent !== baselineAgent);
  const baseline = runs.find((run) => run.agent === baselineAgent);

  const namedButAbsent = (options.availability ?? []).filter(
    (entry) => !entry.available || !runs.some((run) => run.agent === entry.agent),
  );
  const unavailable: ContestantAvailability[] = [
    ...namedButAbsent.map((entry) => ({
      agent: entry.agent,
      available: false,
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
    })),
  ];

  if (baseline === undefined) {
    honestNotes.push(`the baseline agent "${baselineAgent}" produced no results, so nothing can be compared against it`);
  }
  if (scored.length === 0) {
    honestNotes.push(
      unavailable.length > 0
        ? `no opponent ran: ${unavailable.map((entry) => `${entry.agent} (${entry.reason ?? "no reason given"})`).join(", ")}`
        : "no opponent produced results, so there is nothing to compare against",
    );
  }

  const taskIds = [...new Set(runs.flatMap((run) => run.results.map((result) => result.taskId)))].filter(
    (taskId) => familyOf(taskId) === family,
  );

  const verdicts: ArenaTaskVerdict[] = taskIds.map((taskId) => {
    const baselineResult = baseline?.results.find((result) => result.taskId === taskId);
    const baselineSide = {
      agent: baselineAgent,
      ...rankResult(baselineResult),
    };

    // The strongest opponent result on this task. Choosing the strongest is a
    // judgement and is stated: the claim "Aurora beats the field" should hold
    // against the field's best showing, not its average.
    let best: { agent: string; rank: number; label: string } | undefined;
    for (const run of scored) {
      const result = run.results.find((item) => item.taskId === taskId);
      if (result === undefined) continue;
      const ranked = { agent: run.agent, ...rankResult(result) };
      if (best === undefined || ranked.rank > best.rank) best = ranked;
    }

    if (best === undefined) {
      return {
        taskId,
        family,
        verdict: "no-verdict" as const,
        reason: "only the baseline ran this task; an unopposed task is not a win",
        baseline: baselineSide,
        opponent: undefined,
      };
    }

    if (baselineResult === undefined) {
      return {
        taskId,
        family,
        verdict: "loss" as const,
        reason: `the baseline did not run this task and ${best.agent} reached ${best.label}`,
        baseline: baselineSide,
        opponent: best,
      };
    }

    if (baselineSide.rank > best.rank) {
      return {
        taskId,
        family,
        verdict: "win" as const,
        reason: `${baselineSide.label} beats ${best.agent}'s ${best.label}`,
        baseline: baselineSide,
        opponent: best,
      };
    }
    if (baselineSide.rank < best.rank) {
      return {
        taskId,
        family,
        verdict: "loss" as const,
        reason: `${best.agent}'s ${best.label} beats the baseline's ${baselineSide.label}`,
        baseline: baselineSide,
        opponent: best,
      };
    }

    // Equal rank. Two failures are a draw and are labelled as such, because
    // "draw" must not read as "both did fine".
    const bothFailed = baselineSide.rank === 0;
    return {
      taskId,
      family,
      verdict: "draw" as const,
      reason: bothFailed
        ? `both produced nothing — a draw between two failures, not a shared success`
        : `both reached ${baselineSide.label}`,
      baseline: baselineSide,
      opponent: best,
    };
  });

  const wins = verdicts.filter((v) => v.verdict === "win").length;
  const draws = verdicts.filter((v) => v.verdict === "draw").length;
  const losses = verdicts.filter((v) => v.verdict === "loss").length;
  const noVerdicts = verdicts.filter((v) => v.verdict === "no-verdict").length;

  const comparable = baseline !== undefined && scored.length > 0 && wins + draws + losses > 0;
  if (!comparable && taskIds.length > 0) {
    honestNotes.push(
      "no head-to-head verdict could be reached on any task in this family; a win rate computed from this report would be meaningless",
    );
  }
  if (noVerdicts > 0 && comparable) {
    honestNotes.push(`${noVerdicts} task(s) were unopposed and are excluded from the tally rather than counted as wins`);
  }

  return {
    family,
    baselineAgent,
    contestants: runs.map((run) => run.agent),
    verdicts,
    wins,
    draws,
    losses,
    noVerdicts,
    comparable,
    unavailable,
    honestNotes,
  };
}

/**
 * The headline sentence, or an honest refusal to produce one.
 *
 * Returns `undefined` when the arena is not comparable. Printing "Aurora won
 * 100% of tasks" from a single-contestant run is exactly the failure this
 * function exists to prevent, so the caller gets nothing to print instead.
 */
export function arenaHeadline(report: ArenaReport): string | undefined {
  if (!report.comparable) return undefined;
  const decided = report.wins + report.draws + report.losses;
  const share = Math.round((report.wins / decided) * 100);
  const notes = report.honestNotes.length > 0 ? ` (${report.honestNotes.join("; ")})` : "";
  return (
    `On the "${report.family}" family ${report.baselineAgent} won ${report.wins}, drew ${report.draws} ` +
    `and lost ${report.losses} of ${decided} opposed task(s) — ${share}% win rate${notes}`
  );
}
