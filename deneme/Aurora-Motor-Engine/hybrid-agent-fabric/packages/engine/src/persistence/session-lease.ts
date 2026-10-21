import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface SessionLeaseManagerLike {
  acquire(sessionId: string): Promise<void>;
  release(sessionId: string): Promise<void>;
  releaseAll(): Promise<void>;
  /**
   * The fencing token for a session this manager currently owns.
   *
   * A lease alone cannot stop a stalled owner from writing after somebody else
   * took the lease over: the stalled process has no idea it lost. A
   * monotonically increasing token does — every takeover bumps it, so storage
   * can compare and refuse the older writer. `undefined` means "not owned
   * here".
   */
  fence(sessionId: string): Promise<number | undefined>;
  /**
   * Whether `epoch` has been superseded.
   *
   * Deliberately not the same question as {@link fence}. `fence` answers "what
   * do I hold"; this answers "has somebody recorded a newer token". A lease
   * that is simply gone — released by us, or never taken — is *no evidence* of
   * a takeover, and treating it as one made a legitimate final persist after
   * `release` fail. Only a newer epoch on record proves the loss.
   */
  holds(sessionId: string, epoch: number): Promise<boolean>;
}

interface LeaseFile {
  token: string;
  pid: number;
  acquiredAt: string;
  /** Fencing token: bumped on every takeover, never reused. */
  epoch: number;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export class SessionLeaseManager implements SessionLeaseManagerLike {
  private readonly owned = new Map<string, { token: string; epoch: number }>();

  constructor(private readonly rootPath: string) {}

  private pathFor(sessionId: string): string {
    return join(this.rootPath, "leases", `${sessionId}.lock`);
  }

  async acquire(sessionId: string): Promise<void> {
    if (this.owned.has(sessionId)) return;
    const path = this.pathFor(sessionId);
    await mkdir(dirname(path), { recursive: true });
    // Read the epoch once, before the retry loop. Recomputing it inside the
    // loop would read 0 after the stale file is removed and hand the new owner
    // the *same* token the dead one held — the exact collision fencing exists
    // to prevent.
    let epoch = (await this.epochOnDisk(path)) + 1;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = randomUUID();
      try {
        const handle = await open(path, "wx", 0o600);
        await handle.writeFile(JSON.stringify({ token, pid: process.pid, acquiredAt: new Date().toISOString(), epoch } satisfies LeaseFile));
        await handle.close();
        this.owned.set(sessionId, { token, epoch });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let existing: LeaseFile | undefined;
        try {
          existing = JSON.parse(await readFile(path, "utf8")) as LeaseFile;
        } catch {
          // Corrupt lock is treated as stale; removal still races safely with wx creation.
        }
        if (existing && processAlive(existing.pid)) {
          throw new Error(`Session ${sessionId} is already active in process ${existing.pid}.`);
        }
        // Another owner may have written a newer epoch between our first read
        // and now; never go backwards.
        if (existing && typeof existing.epoch === "number") epoch = Math.max(epoch, existing.epoch + 1);
        await rm(path, { force: true });
      }
    }
    throw new Error(`Could not acquire session lease for ${sessionId}.`);
  }

  /** The epoch recorded on disk, or 0 when there is no readable lease. */
  private async epochOnDisk(path: string): Promise<number> {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<LeaseFile>;
      return typeof parsed.epoch === "number" ? parsed.epoch : 0;
    } catch {
      // No lease yet, or one that cannot be parsed: the next owner starts at 1.
      return 0;
    }
  }

  async fence(sessionId: string): Promise<number | undefined> {
    const current = this.owned.get(sessionId);
    if (!current) return undefined;
    // Read back from disk so a takeover by another process is visible here, not
    // only in the other process's memory.
    const onDisk = await this.epochOnDisk(this.pathFor(sessionId));
    if (onDisk !== current.epoch) {
      this.owned.delete(sessionId);
      return undefined;
    }
    return current.epoch;
  }

  async holds(sessionId: string, epoch: number): Promise<boolean> {
    const onDisk = await this.epochOnDisk(this.pathFor(sessionId));
    // No readable lease: nothing has superseded this token, so do not refuse.
    if (onDisk === 0) return true;
    return onDisk === epoch;
  }

  async release(sessionId: string): Promise<void> {
    const held = this.owned.get(sessionId);
    if (!held) return;
    const path = this.pathFor(sessionId);
    try {
      const current = JSON.parse(await readFile(path, "utf8")) as LeaseFile;
      if (current.token === held.token) await rm(path, { force: true });
    } catch {
      // A missing/replaced lease is already no longer ours.
    }
    this.owned.delete(sessionId);
  }

  async releaseAll(): Promise<void> {
    await Promise.all([...this.owned.keys()].map((sessionId) => this.release(sessionId)));
  }
}
