/**
 * The rollback backup map was shared across sessions, and that corrupts files.
 *
 * Reported by an independent audit run against a live server, then confirmed by
 * reading the code. `filesystemCapabilities()` is called once, in the engine
 * constructor (engine.ts:1798), and one engine serves every session. Inside it,
 * `writeBackups` was keyed by the raw input path — `writeBackups.set(path, ...)`,
 * not the resolved absolute path — so two sessions writing the same relative
 * path in different workspaces shared one entry.
 *
 * How a rollback is reached, because the tests depend on it: the broker calls
 * `capability.rollback` when execution throws, and `filesystem.write`'s verify
 * throws when the file on disk does not contain what was asked for. Reusing an
 * idempotency key with different content produces exactly that — the effect
 * journal returns the cached result without writing, verify compares against
 * the new content, and it fails. That is the same sequence the audit measured
 * live as "same key, different payload, target file gone".
 *
 * Two consequences, both pinned here:
 *
 *   reuse a key and the rollback deletes the target file, because the backup
 *   recorded for a fresh file is null and null means "it did not exist, remove
 *   it" — even though the earlier, successful write did create it.
 *
 *   with two sessions on the same relative path, the rollback restores the
 *   *other* session's backup into this session's file.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";

let homePath: string;
let workspaceA: string;
let workspaceB: string;
let engine: HybridAgentEngine;

beforeEach(async () => {
  homePath = await mkdtemp(join(tmpdir(), "haf-xsession-home-"));
  workspaceA = await mkdtemp(join(tmpdir(), "haf-xsession-a-"));
  workspaceB = await mkdtemp(join(tmpdir(), "haf-xsession-b-"));
  engine = new HybridAgentEngine({
    homePath,
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
  } as never);
  await engine.initialize();
  // filesystem.write is risk "workspace_write"; without a reviewer the broker
  // waits for an approval that never comes.
  engine.approvals.bindReviewer(async () => ({ autoApproved: true, rationale: "test" }));
});

afterEach(async () => {
  await engine.shutdown();
  await rm(homePath, { recursive: true, force: true });
  await rm(workspaceA, { recursive: true, force: true });
  await rm(workspaceB, { recursive: true, force: true });
});

function contextFor(workspace: string, id: string, idempotencyKey: string) {
  return {
    tenantId: "tenant-a",
    sessionId: id,
    familyId: "00000000-0000-0000-0000-00000000000f",
    turnId: id,
    toolCallId: id,
    source: "user",
    workspacePath: workspace,
    idempotencyKey,
  } as never;
}

async function write(
  workspace: string,
  id: string,
  idempotencyKey: string,
  path: string,
  content: string,
): Promise<{ threw: boolean; message: string }> {
  try {
    await engine.capabilities.execute(
      "filesystem.write",
      { path, content },
      contextFor(workspace, id, idempotencyKey),
    );
    return { threw: false, message: "" };
  } catch (error) {
    return { threw: true, message: (error as Error).message };
  }
}

async function exists(path: string): Promise<boolean> {
  return readFile(path, "utf8").then(
    () => true,
    () => false,
  );
}

describe("a failed write must not destroy data it did not create", () => {
  it("reusing an idempotency key with different content does not delete the file", async () => {
    const SESSION = "00000000-0000-0000-0000-0000000000a1";
    const KEY = "key-reuse-1";
    const target = join(workspaceA, "idem.txt");

    // A successful write. The file is new, so the backup recorded is null.
    const first = await write(workspaceA, SESSION, KEY, "idem.txt", "A-created");
    expect(first.threw).toBe(false);
    expect(await readFile(target, "utf8")).toBe("A-created");

    // The same key with different content. The journal replays the cached
    // result, verify sees content that does not match, and the broker rolls back.
    const second = await write(workspaceA, SESSION, KEY, "idem.txt", "A-different");
    expect(second.threw).toBe(true);
    expect(second.message).toContain("post-execution verification");

    // The audit measured the file gone from disk here. The successful write
    // must survive a conflict on its own key.
    expect(await exists(target)).toBe(true);
    expect(await readFile(target, "utf8")).toBe("A-created");
  }, 180_000);

  it("a rollback in one workspace does not restore another workspace's backup", async () => {
    const SESSION_A = "00000000-0000-0000-0000-0000000000a2";
    const SESSION_B = "00000000-0000-0000-0000-0000000000b2";

    // Both workspaces start with the same relative path, different content.
    await writeFile(join(workspaceA, "shared.txt"), "A-original");
    await writeFile(join(workspaceB, "shared.txt"), "B-original");

    // A writes: backup["shared.txt"] = "A-original".
    const a1 = await write(workspaceA, SESSION_A, "key-a", "shared.txt", "A-first-write");
    expect(a1.threw).toBe(false);

    // B writes the same relative path: before the fix this replaced A's backup
    // with "B-original".
    const b1 = await write(workspaceB, SESSION_B, "key-b", "shared.txt", "B-write");
    expect(b1.threw).toBe(false);

    // Force A's write to roll back by reusing its key with different content.
    const a2 = await write(workspaceA, SESSION_A, "key-a", "shared.txt", "A-second-write");
    expect(a2.threw).toBe(true);

    // A's file must contain A's own history, never B's content.
    const restored = await readFile(join(workspaceA, "shared.txt"), "utf8");
    expect(restored).not.toBe("B-original");
    expect(restored).not.toBe("B-write");
    expect(["A-original", "A-first-write"]).toContain(restored);

    // And B's file is untouched by A's rollback.
    expect(await readFile(join(workspaceB, "shared.txt"), "utf8")).toBe("B-write");
  }, 180_000);

  it("two sessions writing the same relative path keep independent content", async () => {
    const a = await write(
      workspaceA,
      "00000000-0000-0000-0000-0000000000a3",
      "key-a3",
      "data.txt",
      "A-content",
    );
    const b = await write(
      workspaceB,
      "00000000-0000-0000-0000-0000000000b3",
      "key-b3",
      "data.txt",
      "B-content",
    );

    expect(a.threw).toBe(false);
    expect(b.threw).toBe(false);
    expect(await readFile(join(workspaceA, "data.txt"), "utf8")).toBe("A-content");
    expect(await readFile(join(workspaceB, "data.txt"), "utf8")).toBe("B-content");
  }, 180_000);
});
