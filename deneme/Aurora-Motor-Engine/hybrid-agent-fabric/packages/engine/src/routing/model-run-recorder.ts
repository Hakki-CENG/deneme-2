/**
 * FAZ 20's missing source: model runs, recorded as they happen.
 *
 * `assessModelReliability` has measured reliability from observed runs since FAZ 20,
 * and it was built with the deliberate decision *not* to feed reliability into the
 * routing score, because there was no run source and a term that is always empty is
 * worse than no term. Measured now: `recordModelRun` had zero callers outside its own
 * module, and `StreamingMetricsCollector` — which looks like a run source — has zero
 * users at all, so bridging to it would have chained one unused thing to another.
 *
 * The real chokepoint is `ModelProviderRegistry.stream()`. Every consumer in the
 * engine goes through `this.models.stream(request)`, and there are at least seven
 * call sites across four files, so wrapping each would be invasive and would drift.
 * Wrapping the provider is one place.
 *
 * Classification, and the case that matters:
 *
 *   - completed having yielded content      -> `usable`
 *   - completed having yielded none         -> `unusable`
 *   - threw                                 -> `error`, or `timeout` when it is one
 *   - **abandoned by the consumer**         -> not recorded at all
 *
 * The last one is the point. When a caller stops iterating early, the model may well
 * have been about to produce a fine answer. Recording that as `unusable` would blame
 * the model for the caller's decision, and recording it as `usable` would claim an
 * answer nobody received. Neither is a measurement, so it is not recorded — and
 * `abandoned` is counted separately so the gap in the sample is visible instead of
 * silent.
 *
 * A timeout is classified by the error, not by a timer here: the provider owns the
 * deadline, and a second, unauthoritative clock would disagree with it.
 */

import type { ModelProvider, ModelRequest, ModelStreamEvent } from "../types.js";
import type { ModelRunRecord, RunOutcomeKind } from "./model-reliability.js";

export interface RunTally {
  readonly usable: number;
  readonly unusable: number;
  readonly error: number;
  readonly timeout: number;
  /** Runs whose outcome could not be observed because the consumer stopped early. */
  readonly abandoned: number;
}

export interface ModelRunRecorder {
  /** Appends one observed run. */
  record(record: ModelRunRecord): void;
  /**
   * Notes a run whose outcome could not be observed because the consumer stopped
   * early.
   *
   * A separate method rather than a fifth outcome kind: `RunOutcomeKind` describes
   * what the model did, and "the caller walked away" is not something the model did.
   * Folding it in would require widening that union with a value that is not a
   * measurement, and every consumer of it would have to learn to skip it.
   */
  noteAbandoned(modelId: string): void;
  /** Every run recorded for a model, in order. */
  runsFor(modelId: string): readonly ModelRunRecord[];
  /** Counts by outcome, so an empty sample is distinguishable from a clean one. */
  tally(modelId: string): RunTally;
}

/** A recorder that keeps runs in memory, bounded per model. */
export class InMemoryModelRunRecorder implements ModelRunRecorder {
  private readonly runs = new Map<string, ModelRunRecord[]>();
  private readonly abandonedCounts = new Map<string, number>();

  constructor(private readonly maxRunsPerModel = 200) {}

  noteAbandoned(modelId: string): void {
    this.abandonedCounts.set(modelId, (this.abandonedCounts.get(modelId) ?? 0) + 1);
  }

  record(record: ModelRunRecord): void {
    const existing = this.runs.get(record.modelId) ?? [];
    existing.push(record);
    // Bounded so a long-lived process cannot grow without limit. The oldest runs
    // are dropped, which is the right end to drop: reliability is about recent
    // behaviour.
    if (existing.length > this.maxRunsPerModel) existing.splice(0, existing.length - this.maxRunsPerModel);
    this.runs.set(record.modelId, existing);
  }

  runsFor(modelId: string): readonly ModelRunRecord[] {
    return this.runs.get(modelId) ?? [];
  }

  tally(modelId: string): RunTally {
    const runs = this.runsFor(modelId);
    const count = (outcome: RunOutcomeKind): number => runs.filter((run) => run.outcome === outcome).length;
    return {
      usable: count("usable"),
      unusable: count("unusable"),
      error: count("error"),
      timeout: count("timeout"),
      abandoned: this.abandonedCounts.get(modelId) ?? 0,
    };
  }
}

/**
 * Wraps a provider so every run it serves is recorded.
 *
 * Returns a `ModelProvider`, so it can be registered in place of the provider it
 * wraps and nothing downstream has to know. The wrapper adds no behaviour of its own:
 * it yields the same events, in the same order, and rethrows the same errors.
 */
export function withRunRecording(provider: ModelProvider, recorder: ModelRunRecorder): ModelProvider {
  return {
    id: provider.id,
    async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
      let sawContent = false;
      let completed = false;
      try {
        for await (const event of provider.stream(request)) {
          if (carriesContent(event)) sawContent = true;
          yield event;
        }
        completed = true;
        recorder.record({ modelId: provider.id, outcome: sawContent ? "usable" : "unusable" });
      } catch (error) {
        completed = true;
        recorder.record({
          modelId: provider.id,
          outcome: isTimeout(error) ? "timeout" : "error",
        });
        throw error;
      } finally {
        // The consumer stopped early: `completed` is still false. Counted, not
        // recorded as an outcome, because "the caller walked away" is not something
        // the model did and must never be mistaken for a measurement of it.
        if (!completed) recorder.noteAbandoned(provider.id);
      }
    },
  };
}

/** Whether an event carries model output, as opposed to lifecycle noise. */
function carriesContent(event: ModelStreamEvent): boolean {
  const candidate = event as { type?: string; text?: string; delta?: string };
  // A field wins over the type: an event typed "text" that carries an empty string
  // announced output and produced none, and counting it as an answer would make an
  // empty completion look usable.
  if (typeof candidate.text === "string") return candidate.text.length > 0;
  if (typeof candidate.delta === "string") return candidate.delta.length > 0;
  return false;
}

/**
 * Whether an error is a timeout.
 *
 * Decided from the error the provider raised, not from a second clock here. Matches
 * the shapes the providers and `fetch` actually produce rather than inventing one.
 */
function isTimeout(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return true;
    return /timed?\s?out|timeout/i.test(error.message);
  }
  return false;
}
