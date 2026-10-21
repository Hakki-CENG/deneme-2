/**
 * OTLP trace export — the half of OpenTelemetry Aurora did not have.
 *
 * Measured before this was written: `otlp-exporter.ts` already exports OTLP
 * *metrics*, is wired in `engine.ts` and is tested. What it has no part in is
 * tracing — a grep for span or trace in that file returns nothing, and it
 * builds `resourceMetrics`/`scopeMetrics` by hand with no `@opentelemetry`
 * dependency anywhere in the package. So this module adds spans, not another
 * metrics path.
 *
 * Spans are built from the capability broker's lifecycle events rather than
 * from a new record kept alongside them. `CapabilityLifecycleEvent` already
 * carries the descriptor, the context (tenant, session, turn, tool call), the
 * policy decision, the status and the duration. Inventing a second log to
 * trace from would guarantee the two drift.
 *
 * Four conventions are carried over from the metrics exporter rather than
 * reinvented, because they are the reason that one is safe to run:
 *
 *   - content-free. Attributes are identifiers, statuses and durations. The
 *     broker's `error` field is a message that can contain caller content, so
 *     it is dropped entirely and only the fact of failure is recorded.
 *   - only the error class is kept for export failures, never the message.
 *   - fail open. A collector being down must not break a task turn.
 *   - the interval timer is unref'd so it never holds the process open.
 *
 * The payload is built by hand, matching the metrics exporter's approach. That
 * is only defensible if the hand-built shape is checked against something that
 * is not also hand-built, so `test/otlp-trace.test.ts` runs the real
 * `@opentelemetry/exporter-trace-otlp-http` against a local receiver and
 * asserts this produces the same structure.
 *
 * One thing this does not record, stated because it is a real limit: the broker
 * emits `finished` for a policy-blocked or approval-denied call BEFORE it emits
 * `started` (capability-broker.ts:192, :204 versus :215). Those calls therefore
 * have no measured duration, and their spans are zero-length and marked
 * `haf.span.timing = no-start-observed` rather than being given a plausible
 * looking invented one. There is likewise no turn-root span: the broker's events
 * begin at the capability call, so the trace shows the calls and not the
 * reasoning around them.
 */

import type { CapabilityBroker, CapabilityLifecycleEvent } from "../capabilities/capability-broker.js";
import { ENGINE_VERSION } from "../version.js";

export interface OtlpTraceExporterOptions {
  endpoint: string;
  serviceName?: string;
  serviceVersion?: string;
  instanceId?: string;
  headers?: Record<string, string>;
  /** How long to wait between exports. Defaults to 15 seconds. */
  intervalMs?: number;
  /** Spans held before an export is forced. Defaults to 200. */
  maxBufferedSpans?: number;
}

export interface OtlpTraceExporterStatus {
  running: boolean;
  bufferedSpans: number;
  spansTotal: number;
  spansDroppedTotal: number;
  exportsTotal: number;
  failuresTotal: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureClass?: string;
}

/** A finished span, content-free by construction. */
export interface RecordedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string | undefined;
  name: string;
  /** OTLP SpanKind. 1 = INTERNAL, which is what a capability call is. */
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<{ key: string; value: { stringValue?: string; intValue?: string } }>;
  /** OTLP StatusCode. 0 = UNSET, 1 = OK, 2 = ERROR. */
  statusCode: number;
}

const HEX = /^[0-9a-fA-F]+$/;

function toHex(input: string, length: number): string {
  const cleaned = input.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (cleaned.length === 0) return "0".repeat(length - 1) + "1";
  let out = "";
  for (let i = 0; i < length; i++) out += cleaned[i % cleaned.length]!;
  // OTLP treats an all-zero id as invalid, so it is never emitted.
  return HEX.test(out) && out.replace(/0/g, "") !== "" ? out : "0".repeat(length - 1) + "1";
}

/**
 * A turn's UUID becomes the trace id, so every capability call made during one
 * turn lands in the same trace. Derived rather than random, which means the
 * mapping is stable and can be reasoned about from a turn id alone.
 */
export function turnIdToTraceId(turnId: string): string {
  return toHex(turnId, 32);
}

/** A tool call's UUID becomes the span id, so it is unique per call. */
export function toolCallIdToSpanId(toolCallId: string): string {
  return toHex(toolCallId, 16);
}

function attr(key: string, value: string): RecordedSpan["attributes"][number] {
  return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number): RecordedSpan["attributes"][number] {
  return { key, value: { intValue: String(Math.trunc(value)) } };
}

export function buildOtlpTracePayload(
  spans: readonly RecordedSpan[],
  options: OtlpTraceExporterOptions,
): unknown {
  const attribute = (key: string, value: string) => ({ key, value: { stringValue: value } });
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            attribute("service.name", options.serviceName ?? "hybrid-agent-fabric"),
            attribute("service.version", options.serviceVersion ?? ENGINE_VERSION),
            ...(options.instanceId ? [attribute("service.instance.id", options.instanceId)] : []),
          ],
        },
        scopeSpans: [
          {
            scope: { name: "haf.capability", version: ENGINE_VERSION },
            spans: spans.map((span) => ({
              traceId: span.traceId,
              spanId: span.spanId,
              ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
              name: span.name,
              kind: span.kind,
              startTimeUnixNano: span.startTimeUnixNano,
              endTimeUnixNano: span.endTimeUnixNano,
              attributes: span.attributes,
              status: { code: span.statusCode },
            })),
          },
        ],
      },
    ],
  };
}

export class OtlpTraceExporter {
  private readonly spans: RecordedSpan[] = [];
  private readonly startedAt = new Map<string, number>();
  private timer: NodeJS.Timeout | undefined;
  private exporting = false;

  private readonly state: OtlpTraceExporterStatus = {
    running: false,
    bufferedSpans: 0,
    spansTotal: 0,
    spansDroppedTotal: 0,
    exportsTotal: 0,
    failuresTotal: 0,
  };

  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly options: OtlpTraceExporterOptions,
    private readonly limits: { maxBuffered: number } = { maxBuffered: 200 },
  ) {
    // Checked at construction, like the metrics exporter, so a malformed
    // endpoint fails at wiring time rather than at the first task turn.
    const url = new URL(options.endpoint);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("OTLP endpoint must use HTTP(S).");
    }
  }

  /**
   * Records spans from a broker's lifecycle events. Returns the unsubscribe
   * function so a caller can detach without dropping the exporter.
   */
  subscribeTo(broker: Pick<CapabilityBroker, "subscribe">): () => void {
    const stop = broker.subscribe((event) => {
      this.record(event);
    });
    this.unsubscribe = stop;
    return () => {
      stop();
      if (this.unsubscribe === stop) this.unsubscribe = undefined;
    };
  }

  /** Visible for tests and for the health surface. */
  status(): OtlpTraceExporterStatus {
    return { ...this.state, bufferedSpans: this.spans.length };
  }

  /**
   * Turns one lifecycle event into at most one span.
   *
   * Only `finished` produces a span: that is the point at which a status and,
   * for calls that were allowed to run, a duration exist. `started` is used to
   * capture a real start time, and is discarded otherwise.
   */
  record(event: CapabilityLifecycleEvent): void {
    if (event.phase === "started") {
      this.startedAt.set(event.context.toolCallId, Date.now());
      return;
    }
    if (event.phase !== "finished") return;

    const end = Date.now();
    const observedStart = this.startedAt.get(event.context.toolCallId);
    this.startedAt.delete(event.context.toolCallId);

    const traceId = turnIdToTraceId(event.context.turnId);
    const spanId = toolCallIdToSpanId(event.context.toolCallId);
    const status = event.status ?? "ok";

    const attributes = [
      attr("haf.capability.id", event.descriptor.id),
      attr("haf.capability.risk", String(event.descriptor.risk)),
      attr("haf.status", status),
      attr("haf.tenant.id", event.context.tenantId),
      attr("haf.session.id", event.context.sessionId),
      attr("haf.turn.id", event.context.turnId),
      attr("haf.source", String(event.context.source)),
    ];
    // `decision.message` is prose that can quote caller content, so only the
    // enum and the reason code are recorded.
    if (event.decision) {
      attributes.push(attr("haf.policy.decision", String(event.decision.decision)));
      if (event.decision.reasonCode) attributes.push(attr("haf.policy.reason_code", event.decision.reasonCode));
    }
    if (typeof event.durationMs === "number") {
      attributes.push(intAttr("haf.duration.ms", event.durationMs));
    }
    // The broker's `error` is a message and can carry caller content, so only
    // the fact that something failed is recorded. See the module docstring.
    if (event.error) attributes.push(attr("haf.error.present", "true"));

    // The broker's `durationMs` is the authoritative measurement: it is taken
    // around the call itself, whereas a delta between two of this exporter's
    // own observations includes the time spent emitting and dispatching the
    // event. So the duration wins when it exists, and the observed start is
    // only the fallback.
    const start =
      typeof event.durationMs === "number"
        ? end - event.durationMs
        : (observedStart ?? end);

    if (typeof event.durationMs !== "number" && observedStart === undefined) {
      // Policy-blocked and approval-denied calls emit `finished` before
      // `started` (capability-broker.ts:192, :204 versus :215), so no duration
      // was ever measured by anyone. Say so rather than inventing one.
      attributes.push(attr("haf.span.timing", "no-start-observed"));
    }

    this.push({
      traceId,
      spanId,
      name: `haf.capability ${event.descriptor.id}`,
      kind: 1,
      startTimeUnixNano: (BigInt(start) * 1_000_000n).toString(),
      endTimeUnixNano: (BigInt(end) * 1_000_000n).toString(),
      attributes,
      statusCode: status === "ok" ? 1 : 2,
    });
  }

  private push(span: RecordedSpan): void {
    this.state.spansTotal++;
    if (this.spans.length >= this.limits.maxBuffered) {
      // Dropping the oldest keeps memory bounded when a collector is down.
      // Counted, not silent.
      this.spans.shift();
      this.state.spansDroppedTotal++;
    }
    this.spans.push(span);
  }

  start(): void {
    if (this.timer) return;
    this.state.running = true;
    this.timer = setInterval(() => {
      void this.exportNow();
    }, this.options.intervalMs ?? 15_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.state.running = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  async exportNow(): Promise<boolean> {
    if (this.exporting) return false;
    if (this.spans.length === 0) return true;
    this.exporting = true;
    const batch = this.spans.splice(0, this.spans.length);
    try {
      const response = await fetch(this.options.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...this.options.headers,
        },
        body: JSON.stringify(buildOtlpTracePayload(batch, this.options)),
      });
      if (!response.ok) throw new Error(`OTLP HTTP ${response.status}`);
      this.state.exportsTotal++;
      this.state.lastSuccessAt = new Date().toISOString();
      delete this.state.lastFailureClass;
      return true;
    } catch (error) {
      // Fail open, and record only the class: a collector outage is not a task
      // failure, and a raw network error can carry details worth not keeping.
      this.state.failuresTotal++;
      this.state.lastFailureAt = new Date().toISOString();
      this.state.lastFailureClass = error instanceof Error ? error.name : "unknown";
      // Put the batch back so a transient outage does not lose the trace.
      this.spans.unshift(...batch);
      return false;
    } finally {
      this.exporting = false;
    }
  }
}
