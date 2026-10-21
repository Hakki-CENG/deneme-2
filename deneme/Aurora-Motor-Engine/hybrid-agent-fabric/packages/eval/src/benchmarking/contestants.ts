/**
 * FAZ 7 2/3 — contestants: what runs a task, and what cannot.
 *
 * `arena.ts` scores results; this is what obtains them. The load-bearing idea is
 * that availability is **measured**, not asserted: an external contestant checks
 * the real PATH before it claims it can run, so "no rival agent is installed"
 * is a fact the code establishes rather than a sentence in a commit message.
 *
 * Two rules:
 *
 *   1. An unavailable contestant produces no results and no fake ones. It
 *      appears in the report with the reason it could not run.
 *   2. `runArenaFamily` never synthesises a result for a contestant that did
 *      not run. An arena whose opponents all declined must score as
 *      incomparable, which is what `arena.ts` then reports.
 */

import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { scoreArenaFamily, type ArenaReport } from "./arena.js";
import type { ContestantAvailability } from "./arena.js";
import type { ComparisonRun, ComparisonTaskResult } from "./comparison.js";

export interface Contestant {
  readonly agent: string;
  readonly availability: ContestantAvailability;
  /**
   * Absent when the contestant cannot run. A caller must not treat an absent
   * `run` as a failure to be scored; it is an absence to be reported.
   */
  readonly run?: (taskId: string) => Promise<ComparisonTaskResult>;
}

/** Is `binary` executable somewhere on PATH? A real filesystem check. */
export async function binaryAvailable(binary: string): Promise<ContestantAvailability & { agent: string }> {
  const path = process.env["PATH"] ?? "";
  if (path.length === 0) {
    return { agent: binary, available: false, reason: "PATH is empty" };
  }
  for (const dir of path.split(delimiter)) {
    if (dir.length === 0) continue;
    try {
      await access(join(dir, binary), constants.X_OK);
      return { agent: binary, available: true };
    } catch {
      // Not in this directory; keep looking.
    }
  }
  return { agent: binary, available: false, reason: `"${binary}" was not found executable on PATH` };
}

/**
 * A contestant backed by a function — the engine, or a test double standing in
 * for an agent the caller already knows how to drive.
 */
export function localContestant(
  agent: string,
  run: (taskId: string) => Promise<ComparisonTaskResult>,
  source = "local runner",
): Contestant & { source: string } {
  return { agent, availability: { agent, available: true }, run, source };
}

/**
 * A contestant backed by an external agent binary.
 *
 * Availability is measured here. In a sandbox with no rival agents installed
 * this returns `available: false` with the reason, and the arena reports that
 * instead of reporting a win against nobody.
 */
export async function externalContestant(
  agent: string,
  binary: string,
  run: (taskId: string) => Promise<ComparisonTaskResult>,
  source = `external:${binary}`,
): Promise<Contestant & { source: string }> {
  const availability = await binaryAvailable(binary);
  return {
    agent,
    availability: { agent, available: availability.available, ...(availability.reason === undefined ? {} : { reason: availability.reason }) },
    ...(availability.available ? { run } : {}),
    source,
  };
}

export interface ArenaOutcome {
  readonly family: string;
  readonly runs: readonly ComparisonRun[];
  readonly report: ArenaReport;
  /** Contestants that were asked but could not run, with the measured reason. */
  readonly declined: readonly ContestantAvailability[];
  /** Tasks no contestant ran at all — an arena with nothing in it. */
  readonly unrunTaskIds: readonly string[];
}

/**
 * Runs every available contestant over the task family and scores it.
 *
 * Contestants that cannot run are recorded in `declined` and contribute no
 * results. The report is then produced by `scoreArenaFamily`, which is what
 * decides whether any comparison was possible.
 */
export async function runArenaFamily(
  family: string,
  taskIds: readonly string[],
  contestants: readonly Contestant[],
  options: { familyOf?: (taskId: string) => string } = {},
): Promise<ArenaOutcome> {
  const declined = contestants
    .filter((contestant) => !contestant.availability.available || contestant.run === undefined)
    .map((contestant) => ({
      agent: contestant.agent,
      available: false,
      ...(contestant.availability.reason === undefined ? {} : { reason: contestant.availability.reason }),
    }));

  const runs: ComparisonRun[] = [];
  for (const contestant of contestants) {
    if (contestant.run === undefined) continue;
    const results: ComparisonTaskResult[] = [];
    for (const taskId of taskIds) {
      results.push(await contestant.run(taskId));
    }
    runs.push({
      agent: contestant.agent,
      results,
      ...("source" in contestant && typeof contestant.source === "string" ? { source: contestant.source } : {}),
    });
  }

  const report = scoreArenaFamily(family, runs, contestants[0]?.agent ?? "", {
    availability: contestants.map((contestant) => ({
      agent: contestant.agent,
      available: contestant.availability.available && contestant.run !== undefined,
      ...(contestant.availability.reason === undefined ? {} : { reason: contestant.availability.reason }),
    })),
    ...(options.familyOf === undefined ? {} : { familyOf: options.familyOf }),
  });

  const ranTaskIds = new Set(runs.flatMap((run) => run.results.map((result) => result.taskId)));
  return {
    family,
    runs,
    report,
    declined,
    unrunTaskIds: taskIds.filter((taskId) => !ranTaskIds.has(taskId)),
  };
}
