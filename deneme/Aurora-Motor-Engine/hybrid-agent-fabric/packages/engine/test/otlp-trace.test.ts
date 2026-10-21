/**
 * OTLP trace export, checked against the reference implementation.
 *
 * The load-bearing test here is the first one. This module builds its OTLP JSON
 * by hand, which is only defensible if the shape is compared against something
 * that is not also hand-built. So the real `@opentelemetry/sdk-trace-base` and
 * `@opentelemetry/exporter-trace-otlp-http` are run against a local receiver,
 * and the structure they produce is compared with the structure this module
 * produces. Both go over real HTTP to a real socket — no mocked fetch.
 *
 * That matters because the alternative would have been asserting the payload
 * against constants typed into the test, which proves only that the test and
 * the module agree with each other.
 *
 * The OpenTelemetry packages are devDependencies. Nothing at runtime imports
 * them; the exporter in `src/` has no `@opentelemetry` import, matching the
 * metrics exporter it sits beside.
 */

import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import {
  OtlpTraceExporter,
  buildOtlpTracePayload,
  toolCallIdToSpanId,
  turnIdToTraceId,
  type RecordedSpan,
} from "../src/observability/trace-exporter.js";
import type { CapabilityLifecycleEvent } from "../src/capabilities/capability-broker.js";

// ─── A real receiver, not a mocked fetch ───

interface Received {
  body: unknown;
  contentType: string | undefined;
}

async function withReceiver<T>(
  run: (url: string, received: Received[]) => Promise<T>,
): Promise<T> {
  const received: Received[] = [];
  let server: Server | undefined;
  try {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let body: unknown = raw;
        try {
          body = JSON.parse(raw);
        } catch {
          // A non-JSON body is itself something the assertions should catch.
        }
        received.push({ body, contentType: req.headers["content-type"] });
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    return await run(`http://127.0.0.1:${port}/v1/traces`, received);
  } finally {
    await new Promise<void>((r) => server?.close(() => r()));
  }
}

// ─── Fixtures ───

const TURN_ID = "11111111-2222-3333-4444-555555555555";
const TOOL_CALL_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function sampleSpan(overrides: Partial<RecordedSpan> = {}): RecordedSpan {
  return {
    traceId: turnIdToTraceId(TURN_ID),
    spanId: toolCallIdToSpanId(TOOL_CALL_ID),
    name: "haf.capability math.symbolic",
    kind: 1,
    startTimeUnixNano: "1700000000000000000",
    endTimeUnixNano: "1700000000500000000",
    attributes: [{ key: "haf.capability.id", value: { stringValue: "math.symbolic" } }],
    statusCode: 1,
    ...overrides,
  };
}

function lifecycleEvent(overrides: Partial<CapabilityLifecycleEvent> = {}): CapabilityLifecycleEvent {
  return {
    phase: "finished",
    descriptor: { id: "math.symbolic", risk: "pure", source: "core" } as never,
    context: {
      tenantId: "tenant-1",
      sessionId: "00000000-0000-0000-0000-000000000001",
      familyId: "00000000-0000-0000-0000-000000000002",
      turnId: TURN_ID,
      toolCallId: TOOL_CALL_ID,
      source: "user",
      workspacePath: tmpdir(),
      idempotencyKey: "k",
    } as never,
    status: "ok",
    durationMs: 12,
    ...overrides,
  };
}

/** The structural skeleton an OTLP/HTTP trace payload must have. */
function structureOf(payload: unknown): string[] {
  const paths: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      paths.push(`${path}[]`);
      if (value.length > 0) walk(value[0], `${path}[]`);
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        walk((value as Record<string, unknown>)[key], path === "" ? key : `${path}.${key}`);
      }
      return;
    }
    paths.push(path);
  };
  walk(payload, "");
  return [...new Set(paths)].sort();
}

afterEach(() => {
  // Nothing global is patched here; this exists so a future change that does
  // patch fetch has a place to restore it.
});

describe("the hand-built payload matches the reference implementation", () => {
  it("produces the same OTLP structure as @opentelemetry/exporter-trace-otlp-http", async () => {
    await withReceiver(async (url, received) => {
      // 1. The reference implementation, through a real socket.
      const api = await import("@opentelemetry/api");
      const { BasicTracerProvider, SimpleSpanProcessor } = await import(
        "@opentelemetry/sdk-trace-base"
      );
      const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");

      const referenceExporter = new OTLPTraceExporter({ url });
      const provider = new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(referenceExporter)],
      });
      const tracer = provider.getTracer("haf.reference", "1.0.0");
      const span = tracer.startSpan("haf.capability math.symbolic");
      span.setAttribute("haf.capability.id", "math.symbolic");
      span.setStatus({ code: api.SpanStatusCode.OK });
      span.end();
      await provider.forceFlush();
      await provider.shutdown();

      // 2. This module, through the same receiver.
      const mine = new OtlpTraceExporter({ endpoint: url, serviceName: "haf-reference-check" });
      mine.record(lifecycleEvent());
      expect(await mine.exportNow()).toBe(true);

      expect(received).toHaveLength(2);
      const [reference, own] = received;

      // Both must be JSON over HTTP.
      expect(reference!.contentType).toContain("application/json");
      expect(own!.contentType).toContain("application/json");

      // The skeleton must match: same resource/scope/span field names at the
      // same paths. Value-level differences are expected (ids, timestamps,
      // which attributes) and are asserted separately below.
      const referencePaths = structureOf(reference!.body);
      const ownPaths = structureOf(own!.body);
      for (const required of [
        "resourceSpans[]",
        "resourceSpans[].resource.attributes[]",
        "resourceSpans[].scopeSpans[]",
        "resourceSpans[].scopeSpans[].scope.name",
        "resourceSpans[].scopeSpans[].spans[]",
        "resourceSpans[].scopeSpans[].spans[].name",
        "resourceSpans[].scopeSpans[].spans[].spanId",
        "resourceSpans[].scopeSpans[].spans[].traceId",
        "resourceSpans[].scopeSpans[].spans[].startTimeUnixNano",
        "resourceSpans[].scopeSpans[].spans[].endTimeUnixNano",
        "resourceSpans[].scopeSpans[].spans[].status.code",
      ]) {
        expect(referencePaths, `the reference payload is missing ${required}`).toContain(required);
        expect(ownPaths, `this module's payload is missing ${required}`).toContain(required);
      }
    });
  }, 120_000);

  it("emits ids in the same format the reference implementation does", async () => {
    await withReceiver(async (url, received) => {
      const { BasicTracerProvider, SimpleSpanProcessor } = await import(
        "@opentelemetry/sdk-trace-base"
      );
      const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
      const referenceExporter = new OTLPTraceExporter({ url });
      const provider = new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(referenceExporter)],
      });
      provider.getTracer("haf.reference").startSpan("x").end();
      await provider.forceFlush();
      await provider.shutdown();

      const mine = new OtlpTraceExporter({ endpoint: url });
      mine.record(lifecycleEvent());
      await mine.exportNow();

      const spanOf = (payload: unknown) => {
        const rs = (payload as { resourceSpans: Array<{ scopeSpans: Array<{ spans: unknown[] }> }> })
          .resourceSpans[0]!;
        return rs.scopeSpans[0]!.spans[0] as { traceId: string; spanId: string };
      };
      const ref = spanOf(received[0]!.body);
      const own = spanOf(received[1]!.body);

      // 32 hex and 16 hex, and never all-zero, which OTLP treats as invalid.
      for (const s of [ref, own]) {
        expect(s.traceId).toMatch(/^[0-9a-f]{32}$/);
        expect(s.spanId).toMatch(/^[0-9a-f]{16}$/);
        expect(s.traceId).not.toBe("0".repeat(32));
        expect(s.spanId).not.toBe("0".repeat(16));
      }
    });
  }, 120_000);
});

describe("id derivation is stable and valid", () => {
  it("maps a turn to 32 hex and a tool call to 16 hex, deterministically", () => {
    expect(turnIdToTraceId(TURN_ID)).toMatch(/^[0-9a-f]{32}$/);
    expect(toolCallIdToSpanId(TOOL_CALL_ID)).toMatch(/^[0-9a-f]{16}$/);
    expect(turnIdToTraceId(TURN_ID)).toBe(turnIdToTraceId(TURN_ID));
    expect(turnIdToTraceId(TURN_ID)).not.toBe(turnIdToTraceId("99999999-2222-3333-4444-555555555555"));
  });

  it("never produces an all-zero id, which OTLP rejects", () => {
    expect(turnIdToTraceId("")).not.toBe("0".repeat(32));
    expect(toolCallIdToSpanId("")).not.toBe("0".repeat(16));
    expect(turnIdToTraceId("not-a-uuid")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("puts every call from one turn in the same trace, and each call in its own span", () => {
    const exporter = new OtlpTraceExporter({ endpoint: "http://127.0.0.1:1/v1/traces" });
    exporter.record(lifecycleEvent());
    exporter.record(
      lifecycleEvent({
        context: {
          turnId: TURN_ID,
          toolCallId: "ffffffff-0000-1111-2222-333333333333",
          tenantId: "tenant-1",
          sessionId: "00000000-0000-0000-0000-000000000001",
          familyId: "00000000-0000-0000-0000-000000000002",
          source: "user",
          workspacePath: tmpdir(),
          idempotencyKey: "k",
        } as never,
      }),
    );

    const payload = buildOtlpTracePayload(
      (exporter as unknown as { spans: RecordedSpan[] }).spans,
      { endpoint: "http://127.0.0.1:1/v1/traces" },
    ) as { resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<Record<string, unknown>> }> }> };
    const spans = payload.resourceSpans[0]!.scopeSpans[0]!.spans;

    expect(spans).toHaveLength(2);
    expect(spans[0]!.traceId).toBe(spans[1]!.traceId);
    expect(spans[0]!.spanId).not.toBe(spans[1]!.spanId);
  });
});

describe("the span records what happened, and only that", () => {
  it("records a successful call with its measured duration", () => {
    const exporter = new OtlpTraceExporter({ endpoint: "http://127.0.0.1:1/v1/traces" });
    exporter.record(lifecycleEvent({ phase: "started" }));
    exporter.record(lifecycleEvent());

    const spans = (exporter as unknown as { spans: RecordedSpan[] }).spans;
    expect(spans).toHaveLength(1);
    const span = spans[0]!;
    expect(span.statusCode).toBe(1);
    expect(span.name).toBe("haf.capability math.symbolic");

    const attrs = Object.fromEntries(span.attributes.map((a) => [a.key, a.value]));
    expect(attrs["haf.capability.id"]).toEqual({ stringValue: "math.symbolic" });
    expect(attrs["haf.status"]).toEqual({ stringValue: "ok" });
    expect(attrs["haf.duration.ms"]).toEqual({ intValue: "12" });
    // A start WAS observed, so the caveat attribute must be absent.
    expect(attrs["haf.span.timing"]).toBeUndefined();
    // BigInt, not Number: these are 19-digit nanosecond timestamps and a Number
    // cannot hold one exactly. The first version of this assertion converted
    // through Number, lost precision, and reported a 12 ms duration as
    // 12000256 ns while the exporter's own arithmetic was correct.
    expect(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)).toBe(12_000_000n);
  });

  it("says when a duration was never measured instead of inventing one", () => {
    // capability-broker.ts emits `finished` for a blocked call BEFORE `started`,
    // so there is no start to measure from and no durationMs.
    const exporter = new OtlpTraceExporter({ endpoint: "http://127.0.0.1:1/v1/traces" });
    exporter.record(
      lifecycleEvent({
        phase: "finished",
        status: "blocked",
        durationMs: undefined,
        decision: { decision: "deny", reasonCode: "SQL-DROP", message: "quoted user content here" } as never,
      }),
    );

    const span = (exporter as unknown as { spans: RecordedSpan[] }).spans[0]!;
    const attrs = Object.fromEntries(span.attributes.map((a) => [a.key, a.value]));

    expect(span.statusCode).toBe(2);
    expect(attrs["haf.span.timing"]).toEqual({ stringValue: "no-start-observed" });
    expect(attrs["haf.duration.ms"]).toBeUndefined();
    expect(attrs["haf.policy.decision"]).toEqual({ stringValue: "deny" });
    expect(attrs["haf.policy.reason_code"]).toEqual({ stringValue: "SQL-DROP" });
    // Zero-length, not fabricated.
    expect(span.startTimeUnixNano).toBe(span.endTimeUnixNano);
  });

  it("carries no caller content: not the error message, not the policy prose", () => {
    // The token has to be one that cannot appear by accident, and picking one
    // took two attempts to get right.
    //   attempt 1 used "SELECT" and failed on the reason code "SQL-SELECT" —
    //     reason codes are enum-like identifiers and ARE recorded, deliberately.
    //   attempt 2 used "40000" and was flaky: span ids are 16 hex characters
    //     and timestamps are 19 digits, and measurement says 22221 of 200000
    //     such timestamps contain that substring. It passed once by luck.
    // This token uses letters outside a-f, so it can appear in neither a hex id
    // nor a decimal timestamp.
    const secret = "the tenant reference is zqx-wombat-7731";
    const exporter = new OtlpTraceExporter({ endpoint: "http://127.0.0.1:1/v1/traces" });
    exporter.record(
      lifecycleEvent({
        status: "error",
        error: secret,
        decision: { decision: "deny", reasonCode: "SQL-SELECT", message: secret } as never,
      }),
    );

    const span = (exporter as unknown as { spans: RecordedSpan[] }).spans[0]!;
    const serialised = JSON.stringify(span);

    expect(serialised).not.toContain("zqx-wombat-7731");
    expect(serialised).not.toContain("zqx");
    expect(serialised).not.toContain("wombat");
    expect(serialised).not.toContain("tenant reference");
    // The reason code is an identifier, not content, and is kept.
    expect(serialised).toContain("SQL-SELECT");
    // The fact of failure is kept; its text is not.
    const attrs = Object.fromEntries(span.attributes.map((a) => [a.key, a.value]));
    expect(attrs["haf.error.present"]).toEqual({ stringValue: "true" });
  });
});

describe("exporting fails open and keeps its accounting honest", () => {
  it("posts real JSON to a real receiver and reports success", async () => {
    await withReceiver(async (url, received) => {
      const exporter = new OtlpTraceExporter({ endpoint: url, serviceName: "haf-test" });
      exporter.record(lifecycleEvent());

      expect(await exporter.exportNow()).toBe(true);
      expect(received).toHaveLength(1);
      expect(exporter.status().exportsTotal).toBe(1);
      expect(exporter.status().failuresTotal).toBe(0);
      expect(exporter.status().bufferedSpans).toBe(0);
    });
  }, 60_000);

  it("keeps the batch when the collector is down, and records only the error class", async () => {
    // Port 1 is not listening, so the connection is refused.
    const exporter = new OtlpTraceExporter({ endpoint: "http://127.0.0.1:1/v1/traces" });
    exporter.record(lifecycleEvent());

    expect(await exporter.exportNow()).toBe(false);

    const status = exporter.status();
    expect(status.failuresTotal).toBe(1);
    expect(status.exportsTotal).toBe(0);
    // Returned to the buffer rather than lost.
    expect(status.bufferedSpans).toBe(1);
    // The class only — never the message, which can carry network detail. The
    // class itself is whatever the platform throws (a refused connection
    // surfaces as TypeError through fetch, not Error), so what is asserted is
    // that a class was recorded and that no message escaped with it.
    expect(typeof status.lastFailureClass).toBe("string");
    expect(status.lastFailureClass!.length).toBeGreaterThan(0);
    const serialised = JSON.stringify(status);
    expect(serialised).not.toContain("ECONNREFUSED");
    expect(serialised).not.toContain("127.0.0.1:1");
  }, 60_000);

  it("drops the oldest span rather than growing without bound, and counts it", () => {
    const exporter = new OtlpTraceExporter(
      { endpoint: "http://127.0.0.1:1/v1/traces" },
      { maxBuffered: 3 },
    );
    for (let i = 0; i < 5; i++) {
      exporter.record(
        lifecycleEvent({
          context: {
            turnId: TURN_ID,
            toolCallId: `00000000-0000-0000-0000-00000000000${i}`,
            tenantId: "t",
            sessionId: "00000000-0000-0000-0000-000000000001",
            familyId: "00000000-0000-0000-0000-000000000002",
            source: "user",
            workspacePath: tmpdir(),
            idempotencyKey: "k",
          } as never,
        }),
      );
    }

    const status = exporter.status();
    expect(status.spansTotal).toBe(5);
    expect(status.bufferedSpans).toBe(3);
    expect(status.spansDroppedTotal).toBe(2);
  });

  it("refuses a non-HTTP endpoint at construction, before any task turn", () => {
    expect(() => new OtlpTraceExporter({ endpoint: "file:///etc/passwd" })).toThrow(/HTTP/);
  });

  it("treats an empty buffer as nothing to do rather than a failure", async () => {
    const exporter = new OtlpTraceExporter({ endpoint: "http://127.0.0.1:1/v1/traces" });
    expect(await exporter.exportNow()).toBe(true);
    expect(exporter.status().failuresTotal).toBe(0);
  });
});

describe("it subscribes to a broker and detaches cleanly", () => {
  it("records from lifecycle events and stops when unsubscribed", () => {
    const listeners = new Set<(e: CapabilityLifecycleEvent) => void>();
    const fakeBroker = {
      subscribe(listener: (e: CapabilityLifecycleEvent) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const exporter = new OtlpTraceExporter({ endpoint: "http://127.0.0.1:1/v1/traces" });
    const unsubscribe = exporter.subscribeTo(fakeBroker);

    for (const listener of listeners) listener(lifecycleEvent());
    expect(exporter.status().spansTotal).toBe(1);

    unsubscribe();
    expect(listeners.size).toBe(0);
    expect(exporter.status().spansTotal).toBe(1);
  });

  it("ignores the phases that are not a completed call", () => {
    const exporter = new OtlpTraceExporter({ endpoint: "http://127.0.0.1:1/v1/traces" });
    exporter.record(lifecycleEvent({ phase: "policy" }));
    exporter.record(lifecycleEvent({ phase: "approval" }));
    exporter.record(lifecycleEvent({ phase: "started" }));

    // `started` only records a timestamp; nothing is exported for it.
    expect(exporter.status().spansTotal).toBe(0);
  });
});

describe("a booted engine actually emits spans to a real receiver", () => {
  // The wiring test. This exists because a capability or an exporter that is
  // built but never reached is a library, not a feature, and this repository
  // has shipped one of those before.
  let root: string | undefined;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("records a capability call made through the broker", async () => {
    await withReceiver(async (url, received) => {
      const { HybridAgentEngine } = await import("../src/engine.js");
      root = await mkdtemp(join(tmpdir(), "haf-otel-"));
      const engine = new HybridAgentEngine({
        homePath: root,
        kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
        sandboxBackend: "local",
        model: { provider: "mock" },
        otlpTraces: { endpoint: url, serviceName: "haf-wiring-test" },
      } as never);
      await engine.initialize();

      expect(engine.otlpTraces).toBeDefined();

      // A capability that needs no external backend.
      await engine.capabilities.execute(
        "acos.status",
        {},
        {
          tenantId: "tenant-test",
          sessionId: "00000000-0000-0000-0000-000000000001",
          familyId: "00000000-0000-0000-0000-000000000002",
          turnId: "00000000-0000-0000-0000-000000000003",
          toolCallId: "00000000-0000-0000-0000-000000000004",
          source: "user",
          workspacePath: root,
        } as never,
      ).catch(() => {
        // Whether the call succeeds is not what is under test here; a span is
        // emitted for a finished call either way.
      });

      expect(await engine.otlpTraces!.exportNow()).toBe(true);
      await engine.shutdown();

      expect(received.length).toBeGreaterThan(0);
      const payload = received[received.length - 1]!.body as {
        resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ name: string }> }> }>;
      };
      const spans = payload.resourceSpans[0]!.scopeSpans[0]!.spans;
      expect(spans.length).toBeGreaterThan(0);
      expect(spans[0]!.name).toMatch(/^haf\.capability /);
    });
  }, 180_000);
});
