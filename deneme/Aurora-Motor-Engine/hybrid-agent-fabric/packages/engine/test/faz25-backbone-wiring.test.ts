/**
 * FAZ 25 closed: the engine reports which backbone it is on, and a file-backed
 * deployment says so.
 *
 * Boots a real engine rather than a stub. The existing control-api health test
 * registers its own `/v1/system/health` handler, so it cannot see this — which is
 * why the assertion is made on the engine method the endpoint calls.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";
import { assessBackboneReadiness, isOnProductionBackbone } from "../src/persistence/backbone-readiness.js";
import { SessionLeaseManager } from "../src/persistence/session-lease.js";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function bootEngine(over: Record<string, unknown> = {}): Promise<HybridAgentEngine> {
  root = await mkdtemp(join(tmpdir(), "haf-backbone-"));
  const engine = new HybridAgentEngine({
    homePath: root,
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
    ...over,
  } as never);
  await engine.initialize();
  return engine;
}

describe("a default engine reports that it is on files, not on the backbone", () => {
  it("names every component that keeps it off the backbone", async () => {
    const engine = await bootEngine();
    const wiring = engine.backboneWiring();

    expect(wiring.eventStore).toBe("file");
    expect(wiring.snapshot).toBe("file");
    expect(wiring.lease).toBe("absent");
    expect(wiring.worker).toBe("absent");
    expect(wiring.messageBus).toBe("in-process");
    expect(wiring.database).toBeUndefined();

    const readiness = assessBackboneReadiness(wiring);
    expect(readiness.verdict).toBe("not-production-backbone");
    expect(isOnProductionBackbone(readiness)).toBe(false);
    // Not a bare verdict: an operator gets the list.
    expect(readiness.blocking).toEqual(["database", "eventStore", "snapshot", "lease", "worker", "messageBus"]);
    expect(readiness.detail).toContain("6 of 6 component(s) are not on the backbone");
  });
});

describe("the Postgres branch cannot be booted here, and that is recorded", () => {
  // initialize() really connects: pg-pool raises an AggregateError when nothing is
  // listening, and `postgres: {}` throws "PostgreSQL connectionString or pool is
  // required" before that. So the engine's Postgres branch of backboneWiring() has
  // no booted-engine coverage in a sandbox with no PostgreSQL installed — the pure
  // assessment of a Postgres wiring is covered in faz25-backbone-readiness.test.ts
  // instead. Stated rather than papered over with a fake pool.
  it("covers the file-backed branch end to end and leaves the Postgres branch to the unit tests", async () => {
    const engine = await bootEngine();
    expect(assessBackboneReadiness(engine.backboneWiring()).verdict).toBe("not-production-backbone");
    expect(assessBackboneReadiness({
      database: { connectionString: "postgres://aurora@localhost/aurora" },
      eventStore: "postgres",
      snapshot: "postgres",
      lease: "postgres",
      worker: "present",
      messageBus: "nats",
    }).verdict).toBe("production-backbone");
  });
});

describe("a supplied file lease is reported as a file lease", () => {
  it("distinguishes 'a lease exists on files' from 'no lease at all'", async () => {
    const plain = await bootEngine();
    expect(plain.backboneWiring().lease).toBe("absent");

    const engine = await bootEngine({ schedulerLease: new SessionLeaseManager() });
    const wiring = engine.backboneWiring();
    expect(wiring.lease).toBe("file");
    expect(assessBackboneReadiness(wiring).components.find((c) => c.component === "lease")!.detail).toContain(
      "file-backed",
    );
  });
});
