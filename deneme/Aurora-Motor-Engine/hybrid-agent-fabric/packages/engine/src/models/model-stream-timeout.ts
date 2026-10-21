/**
 * A stall timeout for model streams.
 *
 * An audit left a local model running for more than 300 seconds with the session
 * stuck in `running` and no way to tell a slow generation from a dead one. The
 * router had no timeout at all: it passed a caller's `AbortSignal` through when
 * there was one and otherwise waited forever.
 *
 * The timeout here is on **silence**, not on total duration, and that distinction
 * is the whole point. A long generation legitimately takes minutes and must not
 * be cut off for taking them; what is pathological is a stream that produces
 * nothing. So the window restarts on every event, and a model that keeps talking
 * is never interrupted however long it runs.
 *
 * Aborting is not just a matter of stopping the read. The timer also aborts the
 * request's own signal, so the provider's `fetch` is cancelled too — otherwise
 * the generator would stop being consumed while the socket stayed open and the
 * server kept paying for a response nobody was going to read.
 */
import { ModelProviderError } from "./model-provider-error.js";
import type { ModelStreamEvent } from "../types.js";

/** Default silence window. Generous enough for a slow first token on a local model. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 120_000;

/** Hard bounds, so a misconfigured value cannot disable the timeout or make it useless. */
const MIN_IDLE_TIMEOUT_MS = 1_000;
const MAX_IDLE_TIMEOUT_MS = 30 * 60_000;

export function clampIdleTimeoutMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  return Math.min(MAX_IDLE_TIMEOUT_MS, Math.max(MIN_IDLE_TIMEOUT_MS, Math.floor(value)));
}

export interface IdleTimeoutOptions {
  /** Silence window in milliseconds. Restarted by every event. */
  readonly idleMs: number;
  /** Named in the failure, so an operator can see which route went quiet. */
  readonly providerId: string;
  /**
   * Aborted when the window expires. Pass this signal to the provider so the
   * underlying request is cancelled and not merely abandoned.
   */
  readonly controller: AbortController;
  /** The caller's own signal, if it had one. Chained, never replaced. */
  readonly callerSignal?: AbortSignal;
}

/**
 * Wrap a provider stream so that going quiet for `idleMs` ends it.
 *
 * Throws a `ModelProviderError` coded `stream_idle_timeout`. Distinct from
 * `cancelled`, which means the caller asked for it to stop, and from
 * `transport_error`, which means the connection broke: here the connection is
 * fine and the model simply stopped answering, and an operator needs to tell
 * those three apart.
 */
export async function* withIdleTimeout(
  source: AsyncIterable<ModelStreamEvent>,
  options: IdleTimeoutOptions,
): AsyncGenerator<ModelStreamEvent> {
  const iterator = source[Symbol.asyncIterator]();
  const { idleMs, providerId, controller, callerSignal } = options;

  const forwardCallerAbort = (): void => {
    if (callerSignal?.aborted) controller.abort(callerSignal.reason);
  };
  forwardCallerAbort();
  callerSignal?.addEventListener("abort", () => controller.abort(callerSignal.reason), { once: true });

  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stalled = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const failure = new ModelProviderError(
            `Model provider ${providerId} produced no output for ${idleMs} ms and was aborted.`,
            {
              providerId,
              code: "stream_idle_timeout",
              retryable: true,
              credentialDisposition: "cooldown",
            },
          );
          // Abort first, so the provider's fetch unwinds rather than being left
          // open behind an abandoned generator.
          controller.abort(failure);
          reject(failure);
        }, idleMs);
        // The timer must not keep the process alive on its own.
        timer.unref?.();
      });

      let next: IteratorResult<ModelStreamEvent>;
      try {
        next = await Promise.race([iterator.next(), stalled]);
      } catch (error) {
        // Close the underlying generator before rethrowing, so the provider gets
        // a chance to release its connection.
        await iterator.return?.();
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (next.done) return;
      yield next.value;
    }
  } finally {
    callerSignal?.removeEventListener("abort", () => controller.abort(callerSignal.reason));
    await iterator.return?.();
  }
}
