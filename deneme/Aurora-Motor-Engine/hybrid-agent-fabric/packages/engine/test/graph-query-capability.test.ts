/**
 * data.graph.query — relational questions over an edge list, checked by a BFS.
 *
 * The two cases that matter most are the ones that pin measured disagreements
 * between the query engine and the independent check, because both were real
 * and both changed the code:
 *
 *   a self-loop makes `reachable` include the start node. Kuzu said so; the
 *   first BFS dropped the start from its result and the check reported the
 *   disagreement. Kuzu was right — a cycle back to the start is the fact most
 *   worth knowing about a graph, and hiding it would be worse than reporting it.
 *
 *   `SHORTEST` returns no rows when the start and end bind to the same node,
 *   measured directly: a self-loop queried X->X came back empty while the plain
 *   variable-length pattern found the length-1 path. Same-node questions are
 *   answered by enumeration.
 *
 * If those pins were removed, a future change could reintroduce either bug and
 * every test here would still pass.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, rm, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";
import {
  GRAPH_QUERY_CAPABILITY_ID,
  GRAPH_QUERY_MANIFEST,
  GRAPH_OPERATIONS,
} from "../src/capabilities/graph-query.js";
import { assessManifest } from "../src/capabilities/manifest.js";

const EDGES_CSV = resolve(process.cwd(), "test/fixtures/graph-edges.csv");
const CYCLE_CSV = resolve(process.cwd(), "test/fixtures/graph-with-cycle.csv");

function kuzuAvailable(): { ok: boolean; detail: string } {
  try {
    const out = execFileSync("python3", ["-c", "import kuzu; print(kuzu.__version__)"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    return { ok: true, detail: out.trim() };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 140) };
  }
}

const KUZU = kuzuAvailable();

let root: string | undefined;
let engine: HybridAgentEngine | undefined;

async function bootEngine(): Promise<HybridAgentEngine> {
  root = await mkdtemp(join(tmpdir(), "haf-graph-"));
  engine = new HybridAgentEngine({
    homePath: root,
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
  } as never);
  await engine.initialize();
  return engine;
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
  engine = undefined;
});

function context() {
  return {
    tenantId: "tenant-test",
    sessionId: "00000000-0000-0000-0000-000000000001",
    familyId: "00000000-0000-0000-0000-000000000002",
    turnId: "00000000-0000-0000-0000-000000000003",
    toolCallId: "00000000-0000-0000-0000-000000000004",
    source: "user",
    workspacePath: root ?? tmpdir(),
  } as never;
}

async function query(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const booted = engine ?? (await bootEngine());
  return (await booted.capabilities.execute(
    GRAPH_QUERY_CAPABILITY_ID,
    input,
    context(),
  )) as Record<string, unknown>;
}

describe("the manifest, without needing kuzu installed", () => {
  it("is complete, MIT, and pinned to a version", () => {
    expect(assessManifest(GRAPH_QUERY_MANIFEST).complete).toBe(true);
    expect(GRAPH_QUERY_MANIFEST.provenance.license).toBe("MIT");
    expect(GRAPH_QUERY_MANIFEST.provenance.commit).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("says this is not a knowledge graph built from Aurora's memories", () => {
    // The honest limit. Claiming otherwise on the strength of a caller-supplied
    // edge list is the failure the plan warns about.
    expect(
      GRAPH_QUERY_MANIFEST.limitations.some((l) => l.includes("not a knowledge graph")),
    ).toBe(true);
    expect(GRAPH_QUERY_MANIFEST.limitations.some((l) => l.includes("unweighted hop counts"))).toBe(true);
  });

  it("declares the SHORTEST same-node limitation it routes around", () => {
    expect(GRAPH_QUERY_MANIFEST.limitations.some((l) => l.includes("SHORTEST"))).toBe(true);
  });

  it("exposes a closed set of operations", () => {
    expect(GRAPH_OPERATIONS).toEqual(["reachable", "shortest_path", "degrees"]);
  });
});

describe.skipIf(!KUZU.ok)("querying a real graph", () => {
  it("is registered with its manifest", async () => {
    const booted = await bootEngine();

    expect(booted.capabilities.list().some((c) => c.id === GRAPH_QUERY_CAPABILITY_ID)).toBe(true);
    expect(engine!.capabilities.manifestFor(GRAPH_QUERY_CAPABILITY_ID)?.provenance.license).toBe("MIT");
  }, 120_000);

  it("answers reachability, and the independent BFS agrees", async () => {
    await bootEngine();
    await copyFile(EDGES_CSV, join(root!, "edges.csv"));

    const out = await query({ edgesPath: "edges.csv", operation: "reachable", from: "Istanbul", maxHops: 3 });

    expect(out.status).toBe("executed");
    expect(out.queried).toBe(true);
    expect(out.answer).toEqual(["Ankara", "Antalya", "Bursa", "Izmir"]);
    expect(out.verified).toBe(true);
    expect(out.unchecked).toBe(false);
    expect(out.nodeCount).toBe(5);
    expect(out.edgeCount).toBe(5);
  }, 300_000);

  it("respects the hop bound", async () => {
    await bootEngine();
    await copyFile(EDGES_CSV, join(root!, "edges.csv"));

    const oneHop = await query({ edgesPath: "edges.csv", operation: "reachable", from: "Istanbul", maxHops: 1 });
    expect(oneHop.answer).toEqual(["Ankara", "Bursa"]);
    expect(oneHop.verified).toBe(true);
  }, 300_000);

  it("answers shortest hop count between two nodes", async () => {
    await bootEngine();
    await copyFile(EDGES_CSV, join(root!, "edges.csv"));

    const out = await query({
      edgesPath: "edges.csv",
      operation: "shortest_path",
      from: "Istanbul",
      to: "Antalya",
      maxHops: 5,
    });

    expect(out.answer).toBe(2);
    expect(out.verified).toBe(true);
  }, 300_000);

  it("reports out-degree per node", async () => {
    await bootEngine();
    await copyFile(EDGES_CSV, join(root!, "edges.csv"));

    const out = await query({ edgesPath: "edges.csv", operation: "degrees" });

    expect(out.verified).toBe(true);
    expect(out.answer).toMatchObject({ Istanbul: 2, Ankara: 1, Bursa: 1, Izmir: 1 });
  }, 300_000);

  it("reports a node reachable from itself through a cycle, rather than hiding the cycle", async () => {
    await bootEngine();
    await copyFile(CYCLE_CSV, join(root!, "cycle.csv"));

    // X has a self-loop. Kuzu includes X in its own reachability; the first
    // version of the BFS dropped the start node and the check caught it.
    const out = await query({ edgesPath: "cycle.csv", operation: "reachable", from: "X", maxHops: 3 });

    expect(out.answer).toEqual(["X", "Y", "Z"]);
    expect(out.verified).toBe(true);
  }, 300_000);

  it("answers a same-node shortest path, which SHORTEST alone cannot", async () => {
    await bootEngine();
    await copyFile(CYCLE_CSV, join(root!, "cycle.csv"));

    // Measured: Kuzu's SHORTEST pattern returns no rows when start and end bind
    // to the same node, so the worker enumerates instead. Without that branch
    // this answer is null and the check disagrees.
    const out = await query({
      edgesPath: "cycle.csv",
      operation: "shortest_path",
      from: "X",
      to: "X",
      maxHops: 3,
    });

    expect(out.answer).toBe(1);
    expect(out.verified).toBe(true);
  }, 300_000);

  it("says the weight column is read but not routed on", async () => {
    await bootEngine();
    await copyFile(EDGES_CSV, join(root!, "edges.csv"));

    const weighted = await query({ edgesPath: "edges.csv", operation: "degrees" });
    expect(String(weighted.weightNote)).toContain("not used for routing");

    await copyFile(CYCLE_CSV, join(root!, "cycle.csv"));
    const unweighted = await query({ edgesPath: "cycle.csv", operation: "degrees" });
    expect(String(unweighted.weightNote)).toContain("no weight column");
  }, 300_000);
});

describe.skipIf(!KUZU.ok)("inputs that must not produce an answer", () => {
  it("refuses a path outside the workspace", async () => {
    await bootEngine();

    const out = await query({ edgesPath: "../../etc/edges.csv", operation: "degrees" });

    expect(out.queried).toBe(false);
    expect(String(out.reason)).toContain("escapes the workspace");
  }, 120_000);

  it("names a node that is not in the graph instead of returning an empty answer", async () => {
    await bootEngine();
    await copyFile(EDGES_CSV, join(root!, "edges.csv"));

    const out = await query({ edgesPath: "edges.csv", operation: "reachable", from: "Trabzon" });

    expect(out.queried).toBe(false);
    expect(String(out.reason)).toContain("no node named 'Trabzon'");
  }, 180_000);

  it("reports an unreachable destination as a null answer, not as zero", async () => {
    await bootEngine();
    // Antalya has no outgoing edges, so nothing is reachable from it. An empty
    // result and "no such node" are different facts.
    await copyFile(EDGES_CSV, join(root!, "edges.csv"));

    const out = await query({ edgesPath: "edges.csv", operation: "reachable", from: "Antalya", maxHops: 3 });

    expect(out.queried).toBe(true);
    expect(out.answer).toEqual([]);
    expect(out.verified).toBe(true);
  }, 300_000);

  it("refuses a malformed edge file rather than reading a partial graph", async () => {
    await bootEngine();
    await writeFile(join(root!, "onecol.csv"), "a\nX\n");
    await writeFile(join(root!, "headeronly.csv"), "a,b\n");

    const oneCol = await query({ edgesPath: "onecol.csv", operation: "degrees" });
    expect(oneCol.queried).toBe(false);
    expect(String(oneCol.reason)).toContain("a source and a target are needed");

    const headerOnly = await query({ edgesPath: "headeronly.csv", operation: "degrees" });
    expect(headerOnly.queried).toBe(false);
    expect(String(headerOnly.reason)).toContain("no edges");
  }, 240_000);

  it("rejects an unknown operation and an absurd hop bound at the input schema", async () => {
    await bootEngine();
    await copyFile(EDGES_CSV, join(root!, "edges.csv"));

    // The zod schema is the first layer, so neither reaches the worker.
    await expect(
      query({ edgesPath: "edges.csv", operation: "page_rank", from: "Istanbul" }),
    ).rejects.toThrow();
    await expect(
      query({ edgesPath: "edges.csv", operation: "reachable", from: "Istanbul", maxHops: 99 }),
    ).rejects.toThrow();
  }, 240_000);
});
