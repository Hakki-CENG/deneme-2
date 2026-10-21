/**
 * Row-level security, against a real PostgreSQL.
 *
 * `postgres-rls-wiring.test.ts` drives a fake pool and asserts statement order.
 * That is worth having, but it cannot answer the only question that matters:
 * does the isolation actually hold? A policy can be created, forced and
 * correctly preceded by `set_config` and still admit rows it should not.
 *
 * The setup detail that makes this test meaningful: RLS never applies to a
 * superuser, even with FORCE. So the role must own the tables *and* not be a
 * superuser — which is exactly the configuration `FORCE ROW LEVEL SECURITY`
 * was added for, and exactly the one the codebase never exercised.
 *
 * Requires a live server; skipped when `HAF_TEST_PG_URL` is unset, so a CI job
 * without PostgreSQL is not broken by it.
 *
 *   createdb -O haf_app haf_test   (role must be NOSUPERUSER)
 *   HAF_TEST_PG_URL=postgres://haf_app:haf_pw@127.0.0.1/haf_test
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { PostgresDatabase } from "../src/persistence/postgres/database.js";
import { PostgresEventStore } from "../src/persistence/postgres/event-store.js";
import { PostgresSnapshotStore } from "../src/persistence/postgres/snapshot-store.js";
import type { EventEnvelope, SessionSnapshot } from "../src/types.js";

const URL = process.env.HAF_TEST_PG_URL;

function event(tenantId: string, sessionId: string): EventEnvelope {
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    tenantId,
    sessionId,
    familyId: sessionId,
    generation: 1,
    sequence: 1,
    traceId: "t1",
    type: "test",
    timestamp: new Date().toISOString(),
    visibility: "internal",
    redactionClass: "none",
    payload: {},
  };
}

function snapshot(tenantId: string, sessionId: string): SessionSnapshot {
  const now = new Date().toISOString();
  return {
    sessionId,
    familyId: sessionId,
    tenantId,
    generation: 1,
    lastSequence: 0,
    status: "idle",
    name: "t",
    workspacePath: "/tmp/w",
    createdAt: now,
    updatedAt: now,
    messages: [],
    totalUsage: { inputTokens: 0, outputTokens: 0 },
  } as SessionSnapshot;
}

describe.skipIf(!URL)("row-level security against real PostgreSQL", () => {
  let database: PostgresDatabase;
  let schema: string;

  beforeAll(async () => {
    schema = `haf_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    database = new PostgresDatabase({ connectionString: URL, schema, enableRls: true, enableNotify: false });
    await database.ensureSchema();
  });

  afterAll(async () => {
    const admin = new pg.Pool({ connectionString: URL });
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  });

  it("the connecting role is not a superuser, or this test would prove nothing", async () => {
    // RLS is bypassed for superusers regardless of FORCE, so on a superuser
    // connection every assertion below would pass vacuously.
    const result = await database.pool.query<{ rolsuper: boolean; current_user: string }>(
      "SELECT current_user, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS rolsuper",
    );
    expect(result.rows[0]!.rolsuper).toBe(false);
  });

  it("FORCE ROW LEVEL SECURITY is actually applied to the five protected tables", async () => {
    const result = await database.pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname IN ('events','snapshots','command_journal','effect_journal','agent_inbox')`,
      [schema],
    );
    expect(result.rows).toHaveLength(5);
    for (const row of result.rows) {
      expect(row.relrowsecurity, `${row.relname} rls enabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} rls forced`).toBe(true);
    }
  });

  it("an event written for one tenant is invisible to another", async () => {
    const store = new PostgresEventStore(database);
    const mine = event("tenant-a", "s-a");
    await store.append(mine);

    const asA = await database.withTenant("tenant-a", (client) =>
      client.query(`SELECT count(*)::int AS n FROM "${schema}"."events" WHERE event_id = $1`, [mine.eventId]),
    );
    expect(asA.rows[0]!.n).toBe(1);

    // The isolation claim. Before FORCE this returned 1 as well, because the
    // owning role bypassed the policy entirely.
    const asB = await database.withTenant("tenant-b", (client) =>
      client.query(`SELECT count(*)::int AS n FROM "${schema}"."events" WHERE event_id = $1`, [mine.eventId]),
    );
    expect(asB.rows[0]!.n).toBe(0);
  });

  it("a mislabelled event is refused by WITH CHECK, not silently written", async () => {
    // Scoped to tenant-a but claiming tenant-b: the policy's WITH CHECK clause
    // must reject the row rather than let it land in somebody else's tenant.
    const store = new PostgresEventStore(database);
    const spoofed = event("tenant-b", "s-a");
    await expect(
      database.withTenant("tenant-a", (client) =>
        client.query(
          `INSERT INTO "${schema}"."events" (
            event_id, tenant_id, session_id, family_id, generation, sequence, turn_id,
            trace_id, type, timestamp, visibility, redaction_class, payload
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
          [
            spoofed.eventId, spoofed.tenantId, spoofed.sessionId, spoofed.familyId, spoofed.generation,
            spoofed.sequence, null, spoofed.traceId, spoofed.type, spoofed.timestamp,
            spoofed.visibility, spoofed.redactionClass, JSON.stringify(spoofed.payload),
          ],
        ),
      ),
    ).rejects.toThrow(/row-level security policy/i);
    expect(store).toBeDefined();
  });

  it("a read with no tenant context sees no rows at all", async () => {
    // Measured against a real server, and it corrected the assumption this test
    // was written on: RLS does not make a filtered SELECT fail, it silently
    // returns nothing. Only a WITH CHECK violation on a write raises. With
    // `haf.tenant_id` unset the predicate is NULL, which PostgreSQL treats as
    // false — so every row is filtered out. Before FORCE the owning role was
    // exempt and this returned the full table.
    const bare = await database.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${schema}"."events"`);
    expect(bare.rows[0]!.n).toBe(0);
  });

  it("a write with no tenant context is refused, not silently dropped", async () => {
    // Writes are the other half: there is no "filtered to nothing" for an
    // INSERT, so the WITH CHECK clause raises instead.
    const row = event("tenant-a", "s-orphan");
    await expect(
      database.pool.query(
        `INSERT INTO "${schema}"."events" (
          event_id, tenant_id, session_id, family_id, generation, sequence, turn_id,
          trace_id, type, timestamp, visibility, redaction_class, payload
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
        [
          row.eventId, row.tenantId, row.sessionId, row.familyId, row.generation,
          row.sequence, null, row.traceId, row.type, row.timestamp,
          row.visibility, row.redactionClass, JSON.stringify(row.payload),
        ],
      ),
    ).rejects.toThrow(/row-level security policy/i);
  });

  it("snapshots are isolated the same way", async () => {
    const store = new PostgresSnapshotStore(database);
    const sessionId = randomUUID();
    await store.save(snapshot("tenant-a", sessionId));

    const asA = await database.withTenant("tenant-a", (client) =>
      client.query(`SELECT count(*)::int AS n FROM "${schema}"."snapshots" WHERE session_id = $1`, [sessionId]),
    );
    expect(asA.rows[0]!.n).toBe(1);

    const asB = await database.withTenant("tenant-b", (client) =>
      client.query(`SELECT count(*)::int AS n FROM "${schema}"."snapshots" WHERE session_id = $1`, [sessionId]),
    );
    expect(asB.rows[0]!.n).toBe(0);
  });
});
