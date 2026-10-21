/**
 * A turn that was in flight when the process died must be reported, not dropped.
 *
 * An audit killed the process mid-turn and found the session came back `idle`
 * with the user's message unanswered and no error anywhere — indistinguishable
 * from a turn that had finished normally. The recovery path already existed; what
 * was missing is that it threw away the one fact that mattered, the id of the
 * turn it was retiring.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HybridAgentEngine } from "../src/engine.js";

interface SnapshotLike {
  messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
  status: string;
}

function boot(homePath: string): HybridAgentEngine {
  return new HybridAgentEngine({
    homePath,
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
  });
}

/** Reach the supervisor's snapshot store the way the engine itself does. */
function snapshotStoreOf(engine: HybridAgentEngine): {
  load: (id: string) => Promise<Record<string, unknown> | undefined>;
  // `save` takes the snapshot itself, not an id: the id comes off the object.
  save: (snapshot: Record<string, unknown>) => Promise<void>;
} {
  return (engine.supervisor as unknown as { options: { snapshotStore: never } }).options.snapshotStore;
}

describe("a restart that interrupts a turn says so", () => {
  it("records the interruption instead of returning the session to idle silently", async () => {
    const homePath = await mkdtemp(join(tmpdir(), "haf-restart-"));

    const first = boot(homePath);
    await first.initialize();
    const session = await first.createSession({ tenantId: "local", name: "interrupted" });

    // Give the session a persisted snapshot, then mark it as having been mid-turn
    // — the state a process leaves behind when it is killed.
    await first.command({
      protocolVersion: 1,
      commandId: randomUUID(),
      clientId: "test",
      tenantId: "local",
      sessionId: session.sessionId,
      kind: "session.prompt",
      source: "user",
      issuedAt: new Date().toISOString(),
      payload: { text: "Say hello." },
    });

    const store = snapshotStoreOf(first);
    const persisted = await store.load(session.sessionId);
    expect(persisted, "the session has no persisted snapshot to recover from").toBeDefined();
    const fakeTurn = randomUUID();
    await store.save({ ...persisted!, activeTurnId: fakeTurn });
    // Guard the fixture rather than assuming it: the whole recovery case depends
    // on this field actually being on disk.
    expect((await store.load(session.sessionId))?.activeTurnId).toBe(fakeTurn);
    await first.shutdown();

    // A second engine on the same home directory is the closest thing to a
    // restart: nothing is inherited in memory.
    const second = boot(homePath);
    await second.initialize();
    try {
      const recovered = (await second.session(session.sessionId)) as unknown as SnapshotLike;

      const texts = recovered.messages.flatMap((message) =>
        message.content.filter((part) => part.type === "text").map((part) => part.text ?? ""),
      );
      const notice = texts.find((text) => text.includes("interrupted by a restart"));
      expect(notice, "the recovered session does not mention the interruption").toBeDefined();
      // The notice must not claim the work was done, and must not claim it was
      // checked either: nobody verified anything across the restart.
      expect(notice).toContain("Nothing was verified");

      // The status *reason* is not a snapshot field — `setStatus` emits it on
      // `session.status.changed` and stores nothing — so it is the notice above
      // that carries this to a reader of the session, and the event that carries
      // it to a machine.
      expect(recovered.status).toBe("idle");
    } finally {
      await second.shutdown();
    }
  });

  it("leaves an ordinary recovery alone when no turn was in flight", async () => {
    const homePath = await mkdtemp(join(tmpdir(), "haf-restart-clean-"));
    const first = boot(homePath);
    await first.initialize();
    const session = await first.createSession({ tenantId: "local", name: "clean" });
    await first.shutdown();

    const second = boot(homePath);
    await second.initialize();
    try {
      const recovered = (await second.session(session.sessionId)) as unknown as SnapshotLike & {
        statusReason?: string;
      };
      // Inventing an interruption that did not happen would be the same defect in
      // the other direction: a reader could no longer trust the notice.
      expect(recovered.status).toBe("idle");
      const texts = recovered.messages.flatMap((message) =>
        message.content.filter((part) => part.type === "text").map((part) => part.text ?? ""),
      );
      expect(texts.some((text) => text.includes("interrupted by a restart"))).toBe(false);
    } finally {
      await second.shutdown();
    }
  });
});
