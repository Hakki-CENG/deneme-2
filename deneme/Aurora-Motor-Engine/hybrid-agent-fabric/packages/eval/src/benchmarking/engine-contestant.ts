/**
 * FAZ 7 3/3 — an engine-backed contestant, and an arena that runs end to end.
 *
 * 1/3 scored verdicts and 2/3 measured which agents could run. Nothing drove an
 * arena yet. This is the missing piece: a contestant whose results come from
 * actually executing a task.
 *
 * The mapping from an engine `TaskReport` to a scored result deliberately reuses
 * the engine's own predicates — `isSuccess`, `didRun` — instead of inventing a
 * second vocabulary. `isSuccess` is a single status on purpose; its own comment
 * says every time it was a set, `executed` got added, and "code that ran without
 * being checked is not code that worked". A second mapping would eventually
 * relearn that mistake.
 *
 * Consequence, and the point of it: a report that says `succeeded` but carries
 * no passing verification scores as **unverified success**, not verified. The
 * arena therefore cannot turn FAZ 6's rule around — a self-assessed run never
 * earns the top rank here either.
 *
 * What this still cannot do: run a rival agent. No rival binary exists on this
 * machine (measured in test/faz7-contestants.test.ts), so an arena assembled
 * here has one contestant and reports that no comparison was possible.
 */

import { didRun, isSuccess } from "@haf/engine";
import type { TaskReport, VerificationReport } from "@haf/engine";

import { arenaHeadline, type ArenaReport } from "./arena.js";
import { externalContestant, localContestant, runArenaFamily, type ArenaOutcome, type Contestant } from "./contestants.js";
import type { ComparisonTaskResult } from "./comparison.js";

/** The slice of a report the mapping needs. The real `TaskReport` satisfies it. */
export interface ScorableReport {
  readonly status: TaskReport["status"];
  readonly verification: VerificationReport | undefined;
  readonly attempts: number;
  readonly durationMs: number;
}

/**
 * Turns an engine report into a scored result.
 *
 * `success` and `verified` come from different places on purpose: success is the
 * run's own claim, verified is whether independent evidence agreed. Keeping them
 * separate is what lets the arena rank an unverified success below a verified
 * one instead of treating both as wins.
 *
 * Cost and interventions are omitted rather than guessed — the report does not
 * carry them, and a fabricated 0 would read as "free" in a cost comparison.
 */
export function taskResultFromReport(taskId: string, report: ScorableReport): ComparisonTaskResult {
  return {
    taskId,
    success: isSuccess(report.status),
    verified: report.verification?.verdict === "pass",
    completed: didRun(report.status),
    recovered: report.attempts > 1 && isSuccess(report.status),
    latencyMs: report.durationMs,
  };
}

/** The engine surface this contestant drives. `AuroraEngine` satisfies it. */
export interface EngineRunner {
  execute(description: string): Promise<ScorableReport>;
}

/**
 * A contestant that runs each task through the engine.
 *
 * `tasks` maps a task id to the description handed to the engine, so the same
 * id is what every contestant is asked to do — a comparison across different
 * prompts would not be a comparison.
 */
export function engineContestant(
  agent: string,
  engine: EngineRunner,
  tasks: Readonly<Record<string, string>>,
  source = "engine",
): Contestant & { source: string } {
  return localContestant(
    agent,
    async (taskId) => {
      const description = tasks[taskId];
      if (description === undefined) {
        // Not a failure to score: the task was not defined for this contestant.
        return { taskId, completed: false };
      }
      return taskResultFromReport(taskId, await engine.execute(description));
    },
    source,
  );
}

export interface CodingArenaOptions {
  /** Rival agents to attempt, by name and binary. Unavailable ones are reported. */
  readonly rivals?: readonly { agent: string; binary: string; run: (taskId: string) => Promise<ComparisonTaskResult> }[];
  readonly familyOf?: (taskId: string) => string;
}

export interface CodingArenaResult {
  readonly outcome: ArenaOutcome;
  readonly report: ArenaReport;
  /** `undefined` when no comparison was possible — see `arenaHeadline`. */
  readonly headline: string | undefined;
}

/**
 * Runs the coding arena over a task family: the engine as baseline, plus any
 * rival agents that turn out to be installed.
 *
 * Returns the scored report and a headline only when a comparison actually
 * happened. In this repository's sandbox the rivals are all unavailable, so the
 * headline is `undefined` and the report says so.
 */
export async function runCodingArena(
  family: string,
  tasks: Readonly<Record<string, string>>,
  engine: EngineRunner,
  options: CodingArenaOptions = {},
): Promise<CodingArenaResult> {
  const taskIds = Object.keys(tasks);
  const contestants: Contestant[] = [engineContestant("aurora", engine, tasks)];

  for (const rival of options.rivals ?? []) {
    contestants.push(await externalContestant(rival.agent, rival.binary, rival.run));
  }

  const outcome = await runArenaFamily(family, taskIds, contestants, {
    ...(options.familyOf === undefined ? {} : { familyOf: options.familyOf }),
  });

  return { outcome, report: outcome.report, headline: arenaHeadline(outcome.report) };
}
