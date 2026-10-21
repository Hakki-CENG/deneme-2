/**
 * Only one runtime may run the durable scheduler's timer.
 *
 * What was measured before this change:
 *   - The scheduler was well built for a single instance: `tick()` advances a
 *     job durably *before* dispatch, and `commandId` is derived from job +
 *     occurrence so the command journal absorbs a duplicate delivery.
 *   - But every instance called `start()`, which is an unconditional
 *     `setInterval` + `tick()`. The journal protects the *prompt*; it does not
 *     protect the read-modify-write on `jobs.json`. Each scheduler holds `jobs`
 *     in memory behind a `loaded` flag and `save()` is `atomicWrite`, i.e.
 *     last-writer-wins — so concurrent ticks silently lose each other's
 *     `runCount`, `nextRunAt` and `status` updates.
 *   - `fireExternal` had `duplicate`/`stale` detection; the in-process path had
 *     no equivalent.
 *
 * The lease reuses `SessionLeaseManager`, so it gets the file lock, pid
 * liveness and the B2 fencing token for free.
 */
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DurableScheduler } from "../src/scheduler/scheduler.js";
import { SessionLeaseManager } from "../src/persistence/session-lease.js";
import type { Supervisor } from "../src/runtime/supervisor.js";

/** Only `dispatch` is used by the scheduler; everything else is noise here. */
function supervisorStub(log: string[]) {
  return {
    dispatch: async (command: { commandId: string }) => {
      log.push(command.commandId);
      return { commandId: command.commandId, status: "completed" as const };
    },
  } as unknown as Supervisor;
}

async function dir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "haf-sched-"));
}

/** A due job written straight to disk, so both schedulers see the same file. */
async function seedDueJob(root: string, jobId = "job-1"): Promise<void> {
  const path = join(root, "scheduler", "jobs.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify([
      {
        id: jobId,
        tenantId: "local",
        sessionId: "s1",
        prompt: "tick",
        schedule: { kind: "once", at: new Date(Date.now() - 1000).toISOString() },
        status: "active",
        nextRunAt: new Date(Date.now() - 1000).toISOString(),
        runCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]),
    "utf8",
  );
}

async function dispatched(root: string): Promise<number> {
  const parsed = JSON.parse(await readFile(join(root, "scheduler", "jobs.json"), "utf8")) as Array<{ runCount: number }>;
  return parsed[0]!.runCount;
}

describe("durable scheduler lease", () => {
  it("without a lease the scheduler behaves exactly as before", async () => {
    const root = await dir();
    await seedDueJob(root);
    const log: string[] = [];
    const scheduler = new DurableScheduler(root, supervisorStub(log));
    expect(await scheduler.claim()).toBe(true);
    await scheduler.tick();
    expect(log).toHaveLength(1);
    expect(await dispatched(root)).toBe(1);
    await scheduler.close();
  });

  it("only one of two runtimes sharing a data root wins the lease", async () => {
    const root = await dir();
    const winner = new DurableScheduler(root, supervisorStub([]), undefined, new SessionLeaseManager(root));
    const standby = new DurableScheduler(root, supervisorStub([]), undefined, new SessionLeaseManager(root));
    expect(await winner.claim()).toBe(true);
    expect(await standby.claim()).toBe(false);
    await winner.close();
    await standby.close();
  });

  it("the standby ticks without firing or mutating the shared file", async () => {
    const root = await dir();
    await seedDueJob(root);
    const standbyLog: string[] = [];
    const winner = new DurableScheduler(root, supervisorStub([]), undefined, new SessionLeaseManager(root));
    const standby = new DurableScheduler(root, supervisorStub(standbyLog), undefined, new SessionLeaseManager(root));
    await winner.claim();
    await standby.claim(); // loses

    await standby.tick();
    expect(standbyLog).toHaveLength(0);
    expect(await dispatched(root)).toBe(0); // not advanced by the standby

    await winner.tick();
    expect(await dispatched(root)).toBe(1);
    await winner.close();
    await standby.close();
  });

  it("the lease is handed over once the holder closes", async () => {
    const root = await dir();
    const first = new DurableScheduler(root, supervisorStub([]), undefined, new SessionLeaseManager(root));
    expect(await first.claim()).toBe(true);
    await first.close();
    const second = new DurableScheduler(root, supervisorStub([]), undefined, new SessionLeaseManager(root));
    expect(await second.claim()).toBe(true);
    await second.close();
  });

  it("a runtime whose lease was taken over stops ticking instead of writing alongside the new owner", async () => {
    const root = await dir();
    await seedDueJob(root);
    const staleLog: string[] = [];
    const stale = new DurableScheduler(root, supervisorStub(staleLog), undefined, new SessionLeaseManager(root));
    await stale.claim();

    // Another runtime takes the lease over while `stale` is stalled: same key,
    // newer fencing token on disk.
    const leaseDir = join(root, "leases");
    await mkdir(leaseDir, { recursive: true });
    await writeFile(
      join(leaseDir, "durable-scheduler.lock"),
      JSON.stringify({ token: "new-owner", pid: process.pid, acquiredAt: new Date().toISOString(), epoch: 99 }),
      "utf8",
    );

    await stale.tick();
    expect(staleLog).toHaveLength(0);
    expect(await dispatched(root)).toBe(0);
    await stale.close();
  });

  it("a lease holder re-reads the job file each tick, so a job added elsewhere is picked up", async () => {
    const root = await dir();
    const log: string[] = [];
    const scheduler = new DurableScheduler(root, supervisorStub(log), undefined, new SessionLeaseManager(root));
    await scheduler.claim();

    await seedDueJob(root, "job-a");
    await scheduler.tick();
    // Written by "another runtime" while this one holds the lease. Without the
    // per-tick re-read the cached view would never see it.
    await seedDueJob(root, "job-b");
    await scheduler.tick();

    expect(log.some((id) => id.includes("job-b"))).toBe(true);
    await scheduler.close();
  });
});
