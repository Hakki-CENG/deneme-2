import { randomUUID } from "node:crypto";
import type { SessionLeaseManagerLike } from "../session-lease.js";
import { PostgresDatabase } from "./database.js";

export interface PostgresSessionLeaseOptions {
  ownerId?: string;
  ttlMs?: number;
  renewIntervalMs?: number;
}

export class PostgresSessionLeaseManager implements SessionLeaseManagerLike {
  private readonly ownerId: string;
  private readonly ttlMs: number;
  private readonly renewIntervalMs: number;
  private readonly owned = new Map<string, number>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly database: PostgresDatabase,
    options: PostgresSessionLeaseOptions = {},
  ) {
    this.ownerId = options.ownerId ?? `${process.pid}:${randomUUID()}`;
    this.ttlMs = Math.max(options.ttlMs ?? 30_000, 5000);
    this.renewIntervalMs = Math.min(options.renewIntervalMs ?? 10_000, Math.floor(this.ttlMs / 2));
  }

  async acquire(sessionId: string): Promise<void> {
    if (this.owned.has(sessionId)) return;
    await this.database.ensureSchema();
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
    const result = await this.database.pool.query<{ owner_id: string; epoch: string }>(
      `INSERT INTO ${this.database.table("session_leases")} (session_id,owner_id,expires_at,updated_at,epoch)
       VALUES ($1,$2,$3,now(),1)
       ON CONFLICT (session_id) DO UPDATE SET
         owner_id=EXCLUDED.owner_id,
         expires_at=EXCLUDED.expires_at,
         updated_at=now(),
         epoch=${this.database.table("session_leases")}.epoch + 1
       WHERE ${this.database.table("session_leases")}.expires_at < now()
          OR ${this.database.table("session_leases")}.owner_id = EXCLUDED.owner_id
       RETURNING owner_id, epoch`,
      [sessionId, this.ownerId, expiresAt],
    );
    if ((result.rowCount ?? 0) !== 1 || result.rows[0]?.owner_id !== this.ownerId) {
      throw new Error(`Session ${sessionId} is already active in another runtime.`);
    }
    // bigint comes back as a string from node-postgres.
    this.owned.set(sessionId, Number(result.rows[0]?.epoch ?? 1));
    this.ensureTimer();
  }

  async fence(sessionId: string): Promise<number | undefined> {
    if (!this.owned.has(sessionId)) return undefined;
    // Read the epoch back rather than trusting memory: another runtime may
    // already have taken the lease over, and this process must be able to see
    // that before it writes anything else.
    const result = await this.database.pool.query<{ owner_id: string; epoch: string }>(
      `SELECT owner_id, epoch FROM ${this.database.table("session_leases")} WHERE session_id=$1`,
      [sessionId],
    );
    const row = result.rows[0];
    if (!row || row.owner_id !== this.ownerId) {
      this.owned.delete(sessionId);
      return undefined;
    }
    const epoch = Number(row.epoch);
    this.owned.set(sessionId, epoch);
    return epoch;
  }

  async holds(sessionId: string, epoch: number): Promise<boolean> {
    // See SessionLeaseManagerLike.holds: a missing row is not evidence of a
    // takeover, only a newer epoch is.
    const result = await this.database.pool.query<{ epoch: string }>(
      `SELECT epoch FROM ${this.database.table("session_leases")} WHERE session_id=$1`,
      [sessionId],
    );
    const row = result.rows[0];
    if (!row) return true;
    return Number(row.epoch) === epoch;
  }

  async release(sessionId: string): Promise<void> {
    if (!this.owned.has(sessionId)) return;
    await this.database.ensureSchema();
    await this.database.pool.query(
      `DELETE FROM ${this.database.table("session_leases")} WHERE session_id=$1 AND owner_id=$2`,
      [sessionId, this.ownerId],
    );
    this.owned.delete(sessionId);
    if (!this.owned.size && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async releaseAll(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await Promise.all([...this.owned.keys()].map((sessionId) => this.release(sessionId)));
  }

  async renewAll(): Promise<void> {
    if (!this.owned.size) return;
    await this.database.ensureSchema();
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
    for (const sessionId of [...this.owned.keys()]) {
      const result = await this.database.pool.query(
        `UPDATE ${this.database.table("session_leases")}
         SET expires_at=$3,updated_at=now() WHERE session_id=$1 AND owner_id=$2`,
        [sessionId, this.ownerId, expiresAt],
      );
      if ((result.rowCount ?? 0) !== 1) this.owned.delete(sessionId);
    }
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.renewAll(), this.renewIntervalMs);
    this.timer.unref();
  }
}
