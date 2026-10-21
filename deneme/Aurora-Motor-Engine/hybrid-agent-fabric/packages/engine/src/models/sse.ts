/**
 * Server-sent-event parsing for model providers.
 *
 * Extracted from `codex-subscription-provider.ts`, which had a correct
 * implementation locked to one file: a bounded buffer, `\n\n` framing,
 * multi-line `data:` joining, `[DONE]` handling and a size ceiling on both the
 * event and the buffer. Every other provider that needed streaming either
 * re-implemented a weaker version or, in the case of Anthropic, Gemini and
 * Azure OpenAI, called `await response.json()` and yielded the finished body —
 * which is not streaming at all, and means the caller waits for the whole
 * completion before seeing a single token.
 *
 * The size ceilings are the reason this is a shared helper rather than a
 * per-provider loop. An unbounded buffer turns a provider that never sends a
 * frame boundary into unbounded memory growth; a per-event ceiling turns a
 * single enormous event into a parse failure rather than an allocation. Both
 * were right in the Codex code and would have been easy to forget elsewhere.
 */

/** Default ceiling for one decoded `data:` payload. */
export const DEFAULT_MAX_EVENT_BYTES = 2 * 1024 * 1024;
/** Default ceiling for the accumulated buffer between frame boundaries. */
export const DEFAULT_MAX_BUFFER_BYTES = 2 * 1024 * 1024;

export interface SseParseOptions {
  /** Provider id, used only to make a ceiling violation attributable. */
  providerId: string;
  signal?: AbortSignal | undefined;
  maxEventBytes?: number;
  maxBufferBytes?: number;
}

/**
 * Yield each JSON object from an SSE byte stream, in order, as it arrives.
 *
 * Frames are separated by a blank line; `data:` lines within one frame are
 * concatenated. A `[DONE]` sentinel and empty payloads are skipped. Anything
 * that is not a JSON object is ignored rather than thrown, because providers
 * interleave comments and keep-alive frames that carry no usable value.
 */
export async function* parseSseJson(
  body: ReadableStream<Uint8Array>,
  options: SseParseOptions,
): AsyncGenerator<Record<string, unknown>> {
  const maxEventBytes = options.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES;
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      options.signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        if (Buffer.byteLength(data) > maxEventBytes) {
          throw new Error(`${options.providerId} SSE event exceeds ${maxEventBytes} bytes.`);
        }
        const parsed: unknown = JSON.parse(data);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          yield parsed as Record<string, unknown>;
        }
      }
      // A provider that never sends a boundary must not be able to grow this
      // without limit.
      if (Buffer.byteLength(buffer) > maxBufferBytes) {
        throw new Error(`${options.providerId} SSE buffer exceeds ${maxBufferBytes} bytes.`);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** A byte stream from literal chunks — used to drive the parser without a network. */
export function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}
