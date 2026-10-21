import type { SessionSnapshot } from "../../types.js";
import type { SnapshotStore } from "../snapshot-store.js";
import { PostgresDatabase } from "./database.js";

export class PostgresSnapshotStore implements SnapshotStore {
  constructor(private readonly database: PostgresDatabase) {}

  async save(snapshot: SessionSnapshot): Promise<void> {
    await this.database.ensureSchema();
    // Scoped to the snapshot's tenant so the row-level policy admits the write
    // rather than the connecting role's ownership of the table.
    await this.database.withTenant(snapshot.tenantId, (client) =>
      client.query(
      `INSERT INTO ${this.database.table("snapshots")} (
        session_id, tenant_id, generation, last_sequence, snapshot, updated_at
      ) VALUES ($1,$2,$3,$4,$5::jsonb,now())
      ON CONFLICT (session_id) DO UPDATE SET
        tenant_id=EXCLUDED.tenant_id,
        generation=EXCLUDED.generation,
        last_sequence=EXCLUDED.last_sequence,
        snapshot=EXCLUDED.snapshot,
        updated_at=now()
      WHERE ${this.database.table("snapshots")}.generation <= EXCLUDED.generation
        AND ${this.database.table("snapshots")}.last_sequence <= EXCLUDED.last_sequence`,
      [snapshot.sessionId, snapshot.tenantId, snapshot.generation, snapshot.lastSequence, JSON.stringify(snapshot)],
      ),
    );
  }

  async load(sessionId: string): Promise<SessionSnapshot | undefined> {
    await this.database.ensureSchema();
    // `load` is keyed by session id and carries no tenant, and the callers are
    // internal recovery paths that must work across tenants. The bypass is now
    // an explicit, greppable decision instead of an accident of the connecting
    // role owning the table — which is what made the policy inert before FORCE.
    const result = await this.database.withSystemBypass((client) =>
      client.query<{ snapshot: SessionSnapshot }>(
        `SELECT snapshot FROM ${this.database.table("snapshots")} WHERE session_id=$1`,
        [sessionId],
      ),
    );
    return result.rows[0]?.snapshot ? structuredClone(result.rows[0].snapshot) : undefined;
  }
}
