/**
 * A batch of tool calls must run concurrently, and still be recorded in order.
 *
 * Measured before this change: `session-actor.ts` ran them one at a time —
 * `for (const call of toolCalls) { … await capabilities.execute(…) … }`. A turn
 * that asked for five file reads waited for each in turn.
 *
 * Parallelising that naively would have been a regression of a different kind.
 * `appendMessage` mutates `snapshot.messages` and `emit` appends to the event
 * stream, so interleaving them with the executions would make both depend on
 * which capability happened to finish first — the same turn could produce a
 * different message order and a different event order on every run.
 *
 * So the actor executes concurrently and commits sequentially. These tests pin
 * both halves, which is why they drive a real `SessionActor` rather than
 * asserting on `Promise.all`: the property under test is the actor's, and a
 * harness that stubs the actor proves nothing about it.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SessionActor,
  createInitialSnapshot,
} from "../src/runtime/session-actor.js";
import type { CapabilityBroker } from "../src/capabilities/capability-broker.js";
import type { ContextManager } from "../src/context/context-manager.js";
import type { EventStore } from "../src/persistence/event-store.js";
import type { SnapshotStore } from "../src/persistence/snapshot-store.js";
import type {
  CommandEnvelope,
  ModelProvider,
  ModelStreamEvent,
  SessionSnapshot,
} from "../src/types.js";

interface Timing {
  startedAt: number;
  finishedAt: number;
}

/** Two tools whose completion order is the opposite of their call order. */
function timedCapabilities(timings: Map<string, Timing>, delays: Record<string, number>, failing?: string) {
  return {
    list: () =>
      Object.keys(delays).map((id) => ({
        id,
        version: "1.0.0",
        description: id,
        risk: "pure" as const,
        sideEffect: false,
        source: "core" as const,
      })),
    execute: async (name: string) => {
      const startedAt = Date.now();
      try {
        if (failing === name) throw new Error(`${name} failed on purpose`);
        await new Promise((resolve) => setTimeout(resolve, delays[name] ?? 0));
        return { ok: name };
      } finally {
        timings.set(name, { startedAt, finishedAt: Date.now() });
      }
    },
  } as unknown as CapabilityBroker;
}

function modelThatCallsToolsThenAnswers(toolNames: string[]): ModelProvider {
  let iteration = 0;
  return {
    id: "test-model",
    stream: async function* (): AsyncIterable<ModelStreamEvent> {
      iteration += 1;
      if (iteration === 1) {
        for (const name of toolNames) {
          yield { type: "tool_call", call: { type: "tool_call", id: randomUUID(), name, arguments: {} } };
        }
        yield { type: "done", stopReason: "tool_use" };
        return;
      }
      yield { type: "text_delta", delta: "done" };
      yield { type: "done", stopReason: "end_turn" };
    },
  };
}

const stubEventStore = {
  append: async () => undefined,
  read: async () => [],
  lastSequence: async () => 0,
} as unknown as EventStore;

const stubSnapshotStore = {
  save: async () => undefined,
  load: async () => undefined,
} as unknown as SnapshotStore;

const stubContext = {
  assemble: async (_frozen: unknown, messages: unknown[]) => ({
    systemPrompt: "system",
    messages,
    projection: { truncated: false },
  }),
  syncExternalMemory: async () => ({ status: "disabled" as const }),
} as unknown as ContextManager;

const frozenContext = {
  basePrompt: "system",
  memorySnapshot: "",
  skillIndex: "",
  learningSnapshot: "",
  createdAt: new Date().toISOString(),
};

async function buildActor(snapshot: SessionSnapshot, model: ModelProvider, capabilities: CapabilityBroker) {
  const actor = new SessionActor({
    snapshot,
    eventStore: stubEventStore,
    snapshotStore: stubSnapshotStore,
    model,
    capabilities,
    context: stubContext,
    frozenContext,
  });
  await actor.initialize(false);
  return actor;
}

async function prompt(actor: SessionActor, sessionId: string, tenantId: string): Promise<void> {
  const command: CommandEnvelope = {
    protocolVersion: 1,
    commandId: randomUUID(),
    clientId: "test",
    tenantId,
    sessionId,
    kind: "session.prompt",
    source: "user",
    issuedAt: new Date().toISOString(),
    payload: { text: "read both" },
  };
  await actor.dispatch(command);
}

async function setup(toolNames: string[], delays: Record<string, number>, failing?: string) {
  const workspace = await mkdtemp(join(tmpdir(), "haf-parallel-"));
  const timings = new Map<string, Timing>();
  const sessionId = randomUUID();
  const snapshot = createInitialSnapshot({ sessionId, tenantId: "local", name: "t", workspacePath: workspace });
  const actor = await buildActor(snapshot, modelThatCallsToolsThenAnswers(toolNames), timedCapabilities(timings, delays, failing));
  return { actor, timings, sessionId };
}

/** Tool results, in the order they appear in the session record. */
function recordedToolNames(actor: SessionActor): string[] {
  return actor.state.messages
    .filter((message) => message.role === "tool")
    .flatMap((message) => message.content)
    .filter((part) => part.type === "tool_result")
    .map((part) => (part as { name: string }).name);
}

describe("parallel tool calls", () => {
  it("runs the batch concurrently instead of waiting for each call in turn", async () => {
    // slow is called first and takes far longer, so a serial loop would finish
    // fast only after slow had already completed.
    const { actor, timings, sessionId } = await setup(["slow.tool", "fast.tool"], { "slow.tool": 150, "fast.tool": 5 });
    await prompt(actor, sessionId, "local");

    const slow = timings.get("slow.tool");
    const fast = timings.get("fast.tool");
    expect(slow).toBeDefined();
    expect(fast).toBeDefined();
    // Both started before either finished: the executions overlapped.
    expect(fast!.startedAt).toBeLessThan(slow!.finishedAt);
    expect(slow!.startedAt).toBeLessThan(fast!.finishedAt);
    // And the quick one really did finish first — which is what makes the
    // ordering assertion below meaningful.
    expect(fast!.finishedAt).toBeLessThan(slow!.finishedAt);
  });

  it("records the results in the order the model asked for, not the order they finished", async () => {
    const { actor, timings, sessionId } = await setup(["slow.tool", "fast.tool"], { "slow.tool": 150, "fast.tool": 5 });
    await prompt(actor, sessionId, "local");

    // Precondition for the claim: completion order really was the reverse.
    expect(timings.get("fast.tool")!.finishedAt).toBeLessThan(timings.get("slow.tool")!.finishedAt);
    expect(recordedToolNames(actor)).toEqual(["slow.tool", "fast.tool"]);
  });

  it("one failing tool does not abort its siblings", async () => {
    const { actor, timings, sessionId } = await setup(["broken.tool", "slow.tool"], { "broken.tool": 5, "slow.tool": 80 }, "broken.tool");
    await prompt(actor, sessionId, "local");

    expect(timings.has("slow.tool")).toBe(true);
    const results = actor.state.messages
      .filter((message) => message.role === "tool")
      .flatMap((message) => message.content)
      .filter((part) => part.type === "tool_result") as Array<{ name: string; isError: boolean }>;
    const broken = results.find((item) => item.name === "broken.tool");
    const slow = results.find((item) => item.name === "slow.tool");
    expect(broken?.isError).toBe(true);
    expect(slow?.isError).toBe(false);
    // Still in call order despite the failure.
    expect(results.map((item) => item.name)).toEqual(["broken.tool", "slow.tool"]);
  });

  it("a single tool call still works", async () => {
    const { actor, timings, sessionId } = await setup(["slow.tool"], { "slow.tool": 5 });
    await prompt(actor, sessionId, "local");
    expect(timings.has("slow.tool")).toBe(true);
    expect(recordedToolNames(actor)).toEqual(["slow.tool"]);
  });
});
