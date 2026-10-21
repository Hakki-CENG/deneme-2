/**
 * Row-level security must actually bind, and the tenant must be set before the
 * write happens.
 *
 * What was measured before this change:
 *   - `withTenant` and `withSystemBypass` were both defined in
 *     `postgres/database.ts` and **neither was called anywhere** in `src`.
 *   - `enableRls` defaulted to `false`, so the policies were not even created.
 *   - Even when enabled there was **no `FORCE ROW LEVEL SECURITY`**, and the
 *     application connects as the role that owns the tables — which bypasses
 *     RLS by default. So the policies were inert twice over: not created, and
 *     not binding.
 *   - `PostgresEventStore.read(sessionId, …)` carries no tenant at all, so
 *     isolation depended entirely on the caller.
 *
 * There is no PostgreSQL in this environment, so these tests drive a fake pool
 * and assert the *order* of statements: the tenant has to be set before the
 * INSERT reaches the server, otherwise the policy evaluates against nothing.
 * That ordering is the property `withTenant` exists to guarantee, and it is
 * checkable without a database.
 */
import { describe, expect, it } from "vitest";
import { PostgresDatabase, type PgClientLike, type PgPoolLike } from "../src/persistence/postgres/database.js";
import { PostgresEventStore } from "../src/persistence/postgres/event-store.js";
import type { EventEnvelope } from "../src/types.js";

interface Recorded {
  text: string;
  values?: unknown[];
}

/** Records every statement, in order, on both the pool and the leased client. */
function fakePool(log: Recorded[]): { pool: PgPoolLike } {
  const ok = { rows: [], rowCount: 1 } as never;
  const client: PgClientLike = {
    query: async (text: string, values?: unknown[]) => {
      log.push({ text, values });
      return ok;
    },
    release: () => undefined,
  };
  const pool: PgPoolLike = {
    query: async (text: string, values?: unknown[]) => {
      log.push({ text, values });
      return ok;
    },
    connect: async () => client,
  };
  return { pool };
}

function event(tenantId: string): EventEnvelope {
  return {
    schemaVersion: 1,
    eventId: `evt-${tenantId}`,
    tenantId,
    sessionId: "s1",
    familyId: "f1",
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

describe("row-level security wiring", () => {
  it("FORCE ROW LEVEL SECURITY is applied to every protected table", async () => {
    const log: Recorded[] = [];
    const database = new PostgresDatabase({ ...fakePool(log), enableRls: true });
    await database.ensureSchema();
    const forced = log.filter((entry) => /FORCE ROW LEVEL SECURITY/.test(entry.text));
    // events, snapshots, command_journal, effect_journal, agent_inbox
    expect(forced).toHaveLength(5);
    for (const table of ["events", "snapshots", "command_journal", "effect_journal", "agent_inbox"]) {
      expect(forced.some((entry) => entry.text.includes(`"${table}"`))).toBe(true);
    }
  });

  it("without enableRls no policy is created — the documented default", async () => {
    const log: Recorded[] = [];
    const database = new PostgresDatabase({ ...fakePool(log), enableRls: false });
    await database.ensureSchema();
    expect(log.some((entry) => /ROW LEVEL SECURITY/.test(entry.text))).toBe(false);
  });

  it("appending an event sets the tenant before the INSERT reaches the server", async () => {
    const log: Recorded[] = [];
    const database = new PostgresDatabase({ ...fakePool(log), enableRls: true, enableNotify: false });
    await database.ensureSchema();
    log.length = 0; // only what the append itself issues

    const store = new PostgresEventStore(database);
    await store.append(event("tenant-b"));

    const tenantSet = log.findIndex((entry) => /set_config\('haf\.tenant_id'/.test(entry.text));
    const bypassOff = log.findIndex((entry) => /set_config\('haf\.system_bypass','off'/.test(entry.text));
    const insert = log.findIndex((entry) => /INSERT INTO "haf"\."events"/.test(entry.text));

    expect(tenantSet).toBeGreaterThanOrEqual(0);
    expect(bypassOff).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(tenantSet);
    expect(insert).toBeGreaterThan(bypassOff);
    expect(log[tenantSet]!.values).toEqual(["tenant-b"]);
  });

  it("the append is committed inside the tenant transaction", async () => {
    const log: Recorded[] = [];
    const database = new PostgresDatabase({ ...fakePool(log), enableRls: true, enableNotify: false });
    await database.ensureSchema();
    log.length = 0;

    const store = new PostgresEventStore(database);
    await store.append(event("tenant-c"));

    const begin = log.findIndex((entry) => entry.text === "BEGIN");
    const commit = log.findIndex((entry) => entry.text === "COMMIT");
    const insert = log.findIndex((entry) => /INSERT INTO/.test(entry.text));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(begin);
    expect(commit).toBeGreaterThan(insert);
  });

  it("an invalid tenant is refused before anything is written", async () => {
    const log: Recorded[] = [];
    const database = new PostgresDatabase({ ...fakePool(log), enableRls: true, enableNotify: false });
    await database.ensureSchema();
    log.length = 0;

    const store = new PostgresEventStore(database);
    await expect(store.append(event(""))).rejects.toThrow(/Tenant context is invalid/);
    expect(log.some((entry) => /INSERT INTO/.test(entry.text))).toBe(false);
  });
});

describe("rls ratchet", () => {
  // Every statement against an RLS-protected table must run inside
  // withTenant/withSystemBypass. A bare pool.query against one of them would
  // evaluate the policy with `haf.tenant_id` unset and, now that FORCE is on,
  // be denied outright — or, if FORCE were ever dropped, silently bypass
  // isolation. Either way it is a bug, so it fails here instead.
  const PROTECTED = ["events", "snapshots", "command_journal", "effect_journal", "agent_inbox"] as const;

  it("no direct pool.query touches an RLS-protected table", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { dirname, join, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const pgDir = resolve(here, "../src/persistence/postgres");
    const files = [
      ...readdirSync(pgDir).filter((n) => n.endsWith(".ts")).map((n) => join(pgDir, n)),
      resolve(here, "../src/runtime/agent-inbox.ts"),
    ];

    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith("database.ts")) continue; // migrations/DDL are not tenant-scoped
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(/this\.database\.pool\.query[\s\S]{0,300}?table\("([a-z_]+)"\)/g)) {
        const table = match[1]!;
        if ((PROTECTED as readonly string[]).includes(table)) {
          offenders.push(`${file.split("/").pop()} -> ${table}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
