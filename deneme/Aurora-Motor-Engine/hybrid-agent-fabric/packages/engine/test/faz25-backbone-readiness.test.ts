/**
 * FAZ 25 1/3 — which backbone a deployment is on, measured from what is wired.
 *
 * Two load-bearing cases: a file-backed event store is reported as file-backed
 * rather than as a satisfied requirement, and a Postgres options object carrying
 * neither a connection string nor a pool is `unconnected` rather than connected.
 */

import { describe, expect, it } from "vitest";

import {
  assessBackboneReadiness,
  isOnProductionBackbone,
  type DeclaredWiring,
} from "../src/persistence/backbone-readiness.js";

const FULL: DeclaredWiring = {
  database: { connectionString: "postgres://aurora@localhost/aurora" },
  eventStore: "postgres",
  snapshot: "postgres",
  lease: "postgres",
  worker: "present",
  messageBus: "nats",
};

function backingOf(readiness: ReturnType<typeof assessBackboneReadiness>, component: string): string {
  return readiness.components.find((c) => c.component === component)!.backing;
}

describe("a deployment on the backbone is recognised as one", () => {
  it("passes all six components", () => {
    const readiness = assessBackboneReadiness(FULL);
    expect(readiness.verdict).toBe("production-backbone");
    expect(readiness.blocking).toEqual([]);
    expect(isOnProductionBackbone(readiness)).toBe(true);
    expect(readiness.detail).toContain("not a probe of a running system");
  });

  it("accepts a supplied pool instead of a connection string", () => {
    const readiness = assessBackboneReadiness({ ...FULL, database: { pool: {} } });
    expect(backingOf(readiness, "database")).toBe("postgres");
    expect(readiness.verdict).toBe("production-backbone");
  });
});

describe("rule 2 — a file-backed store is not a satisfied requirement", () => {
  it("names a file event store as file-backed and blocks", () => {
    const readiness = assessBackboneReadiness({ ...FULL, eventStore: "file" });

    expect(readiness.verdict).toBe("not-production-backbone");
    expect(backingOf(readiness, "eventStore")).toBe("file");
    expect(readiness.blocking).toContain("eventStore");
    expect(readiness.components.find((c) => c.component === "eventStore")!.detail).toContain(
      "JSON is for config, local cache and export",
    );
  });

  it("blocks for a file lease too, which is what the engine defaults to", () => {
    const readiness = assessBackboneReadiness({ ...FULL, lease: "file" });
    expect(readiness.blocking).toEqual(["lease"]);
  });

  it("reports an in-memory store as not durable at all", () => {
    const readiness = assessBackboneReadiness({ ...FULL, snapshot: "in-memory" });
    expect(backingOf(readiness, "snapshot")).toBe("in-memory");
    expect(readiness.components.find((c) => c.component === "snapshot")!.detail).toContain("does not survive a restart");
  });
});

describe("rule 3 — an empty Postgres declaration is not a connection", () => {
  it("reports unconnected when neither a connection string nor a pool is present", () => {
    const readiness = assessBackboneReadiness({ ...FULL, database: {} });

    expect(readiness.verdict).toBe("not-production-backbone");
    expect(backingOf(readiness, "database")).toBe("unconnected");
    expect(readiness.components.find((c) => c.component === "database")!.detail).toContain(
      "a declaration rather than a connection",
    );
  });
});

describe("an absent component is absent, never satisfied", () => {
  it("assesses an empty wiring as six absent components", () => {
    const readiness = assessBackboneReadiness({});
    expect(readiness.verdict).toBe("not-production-backbone");
    expect(readiness.blocking).toHaveLength(6);
    expect(readiness.components.every((c) => c.backing === "absent")).toBe(true);
  });

  it("explains what each absence costs", () => {
    const readiness = assessBackboneReadiness({});
    const details = new Map(readiness.components.map((c) => [c.component, c.detail]));
    expect(details.get("snapshot")).toContain("without them every restore replays the whole log");
    expect(details.get("lease")).toContain("two runtimes from running the same scheduler");
    expect(details.get("worker")).toContain("nothing is consuming work off a queue");
  });

  it("treats an in-process bus as not a bus", () => {
    const readiness = assessBackboneReadiness({ ...FULL, messageBus: "in-process" });
    expect(backingOf(readiness, "messageBus")).toBe("in-memory");
    expect(readiness.components.find((c) => c.component === "messageBus")!.detail).toContain(
      "only delivered within one runtime",
    );
  });
});

describe("rule 4 — the verdict names everything blocking it", () => {
  it("lists every component, not just the first", () => {
    const readiness = assessBackboneReadiness({
      database: { connectionString: "postgres://x" },
      eventStore: "file",
      snapshot: "file",
      lease: "file",
      worker: "absent",
      messageBus: "in-process",
    });
    expect(readiness.blocking).toEqual(["eventStore", "snapshot", "lease", "worker", "messageBus"]);
    expect(readiness.detail).toContain("5 of 6 component(s) are not on the backbone");
    expect(readiness.detail).toContain("eventStore is file");
    expect(readiness.detail).toContain("messageBus is in-memory");
  });
});

describe("rule 5 — this is an assessment, not a migration", () => {
  it("carries no connection and no side effect to act on", () => {
    const readiness = assessBackboneReadiness(FULL);
    expect("connection" in readiness).toBe(false);
    expect("migrate" in readiness).toBe(false);
    // Assessed twice, same answer: nothing was changed by asking.
    expect(assessBackboneReadiness(FULL)).toEqual(readiness);
  });
});
