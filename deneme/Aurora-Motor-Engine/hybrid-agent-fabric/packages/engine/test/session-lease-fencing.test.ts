/**
 * Session leases must carry a fencing token, not just a lock.
 *
 * What was measured before this change:
 *   - `SessionLeaseManager` was well built — `wx` creation, a random token, a
 *     pid liveness check, stale takeover, and a token-checked release.
 *   - `PostgresSessionLeaseManager` had TTL, renewal, expiry-based takeover,
 *     and `renewAll` noticed a lost lease by dropping the session from `owned`.
 *   - Neither had a **monotonically increasing token**, and neither told
 *     anybody. `renewAll` silently forgot the session while the actor kept
 *     running.
 *   - The write path had nothing to compare against: `events` and `snapshots`
 *     carry no owner or epoch column, and only `session_leases`'s DELETE
 *     checked ownership.
 *
 * So a runtime that stalled, lost its lease to a takeover, and then woke up
 * would keep appending to the same session's journal alongside the new owner.
 * That is the split-brain the DoD item is about. The epoch is what makes the
 * loss checkable; `supervisor.assertLeaseHeld` is what acts on it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionLeaseManager } from "../src/persistence/session-lease.js";
import { SessionLeaseLostError } from "../src/runtime/session-errors.js";

async function root(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "haf-lease-"));
}

/** A lease file left behind by a process that is definitely not running. */
async function staleLease(dir: string, sessionId: string, epoch: number): Promise<void> {
  const leaseDir = join(dir, "leases");
  await mkdir(leaseDir, { recursive: true });
  await writeFile(
    join(leaseDir, `${sessionId}.lock`),
    JSON.stringify({ token: "dead-owner", pid: 2_000_000_000, acquiredAt: new Date(0).toISOString(), epoch }),
    "utf8",
  );
}

describe("session lease fencing", () => {
  it("hands out epoch 1 on the first acquire and honours it", async () => {
    const leases = new SessionLeaseManager(await root());
    await leases.acquire("s1");
    expect(await leases.fence("s1")).toBe(1);
    expect(await leases.holds("s1", 1)).toBe(true);
    await leases.releaseAll();
  });

  it("bumps the epoch on takeover, so the token is never reused", async () => {
    const dir = await root();
    await staleLease(dir, "s1", 1); // previous owner died holding epoch 1
    const leases = new SessionLeaseManager(dir);
    await leases.acquire("s1");
    expect(await leases.fence("s1")).toBe(2);
    // The old owner's token must no longer be accepted.
    expect(await leases.holds("s1", 1)).toBe(false);
    expect(await leases.holds("s1", 2)).toBe(true);
    await leases.releaseAll();
  });

  it("the epoch keeps climbing across repeated takeovers", async () => {
    const dir = await root();
    for (const expected of [3, 4, 5]) {
      await staleLease(dir, "s1", expected - 1);
      const leases = new SessionLeaseManager(dir);
      await leases.acquire("s1");
      expect(await leases.fence("s1")).toBe(expected);
      expect(await leases.holds("s1", expected - 1)).toBe(false);
      await leases.releaseAll();
    }
  });

  it("a stalled owner can see that it lost, instead of carrying on", async () => {
    const dir = await root();
    const first = new SessionLeaseManager(dir);
    await first.acquire("s1");
    const epoch = await first.fence("s1");
    expect(epoch).toBe(1);

    // Another runtime takes the lease over while `first` is stalled.
    await staleLease(dir, "s1", 1);
    const second = new SessionLeaseManager(dir);
    await second.acquire("s1");
    expect(await second.fence("s1")).toBe(2);

    // The decisive property: the old owner's next check reports the loss
    // rather than returning a token it no longer holds.
    expect(await first.fence("s1")).toBeUndefined();
    expect(await first.holds("s1", epoch!)).toBe(false);
    await second.releaseAll();
  });

  it("fence is undefined for a session this manager never owned", async () => {
    const leases = new SessionLeaseManager(await root());
    expect(await leases.fence("never-acquired")).toBeUndefined();
    // No lease on record means nothing has superseded the token. Refusing here
    // would break a legitimate final persist that runs after release.
    expect(await leases.holds("never-acquired", 1)).toBe(true);
  });

  it("release clears ownership but is not treated as a takeover", async () => {
    const leases = new SessionLeaseManager(await root());
    await leases.acquire("s1");
    await leases.release("s1");
    expect(await leases.fence("s1")).toBeUndefined();
    // The lease is gone, not superseded: holds must not report a loss.
    expect(await leases.holds("s1", 1)).toBe(true);
  });

  it("only a newer epoch on record counts as a loss", async () => {
    const dir = await root();
    const first = new SessionLeaseManager(dir);
    await first.acquire("s1");
    expect(await first.holds("s1", 1)).toBe(true);
    // A takeover writes epoch 2 over the same path.
    await staleLease(dir, "s1", 2);
    expect(await first.holds("s1", 1)).toBe(false);
    expect(await first.holds("s1", 2)).toBe(true);
  });

  it("a lease written before fencing existed starts the next owner at 1, not at NaN", async () => {
    const dir = await root();
    const leaseDir = join(dir, "leases");
    await mkdir(leaseDir, { recursive: true });
    // Pre-fencing format: no epoch field at all.
    await writeFile(
      join(leaseDir, "legacy.lock"),
      JSON.stringify({ token: "old", pid: 2_000_000_000, acquiredAt: new Date(0).toISOString() }),
      "utf8",
    );
    const leases = new SessionLeaseManager(dir);
    await leases.acquire("legacy");
    expect(await leases.fence("legacy")).toBe(1);
    await leases.releaseAll();
  });
});

describe("SessionLeaseLostError", () => {
  it("carries the epochs as fields, so an HTTP layer need not parse prose", () => {
    const behind = new SessionLeaseLostError("s1", 1, 2);
    expect(behind.name).toBe("SessionLeaseLostError");
    expect(behind.sessionId).toBe("s1");
    expect(behind.epoch).toBe(1);
    expect(behind.currentEpoch).toBe(2);
    expect(behind).toBeInstanceOf(Error);

    const gone = new SessionLeaseLostError("s1", 1, undefined);
    expect(gone.currentEpoch).toBeUndefined();
    expect(gone.message).toContain("no longer leased");
  });
});
