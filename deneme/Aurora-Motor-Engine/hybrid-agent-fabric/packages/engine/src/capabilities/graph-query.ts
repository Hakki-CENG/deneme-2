/**
 * data.graph.query — answer a relational question over an edge list, and check the answer with a plain BFS.
 *
 * Kuzu 0.11.3, MIT — checked against the repository's LICENSE file rather than
 * only the package metadata, which carries a bare "MIT" with no text.
 *
 * Measured before this was written: `knowledge.search` is BM25/vector
 * similarity over session messages, memories, skills and artifacts, and a grep
 * for `adjacency|neighbours|traverseGraph|knowledgeGraph` across the engine
 * returned nothing. Aurora could find things that are *similar* and could not
 * answer what is *connected* to what. That is the gap this closes.
 *
 * What it is not: a knowledge graph over Aurora's own memories. Building that
 * needs entity and relation extraction, which needs a model, and there are no
 * API keys in this environment. Claiming a knowledge graph on the strength of
 * an edge list the caller supplied would be the "added a class, called it
 * expertise" failure the plan warns against. This answers graph questions over
 * a graph the caller provides, and says so.
 *
 * The reason this is not Kuzu behind an endpoint is the check. Every answer is
 * recomputed by a breadth-first search written in the worker over a
 * dict-of-lists built from the same file with Python's stdlib csv module, and
 * the two are compared. Two routes to the same answer is evidence; one library
 * restating its own output is not.
 *
 * That check earned its place twice, on the first runs:
 *
 *   1. A self-loop (X,X) queried `reachable` from X. Kuzu returned ['X','Y'];
 *      the BFS returned ['Y'] because it dropped the start node from the
 *      result. The check reported the disagreement and the BFS was wrong: a
 *      self-loop means there really is a path of length >= 1 from the start
 *      back to itself, and hiding that hides the one fact most worth knowing
 *      about the graph — that it has a cycle.
 *   2. The same graph queried `shortest_path` from X to X. Kuzu returned
 *      nothing; the BFS said 1. Measured directly: Kuzu's `SHORTEST` pattern
 *      returns no rows when the start and end bind to the same node, while the
 *      plain variable-length pattern finds the length-1 path. Same-node
 *      questions are therefore answered by enumeration, and the worker says
 *      that branch costs more.
 *
 * A parameter naming quirk is also recorded in the worker, because it cost a
 * diagnosis: `$end` raises a Parser exception in Kuzu, `end` being reserved in
 * the query grammar, and the message points at the query text instead of naming
 * the reserved word.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { defineCapability } from "./schema.js";
import type { CapabilityManifest } from "./manifest.js";
import { runSubprocessCapability } from "./external/subprocess-adapter.js";
import { resolveWithinWorkspace } from "./document-parse.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const GRAPH_QUERY_WORKER_PATH = resolve(HERE, "../../external-workers/graph_query.py");

export const KUZU_PINNED_VERSION = "0.11.3";

export const GRAPH_OPERATIONS = ["reachable", "shortest_path", "degrees"] as const;
export type GraphOperation = (typeof GRAPH_OPERATIONS)[number];

export const GRAPH_QUERY_MANIFEST: CapabilityManifest = {
  id: "data.graph.query",
  version: "1.0.0",
  domain: ["graph", "data-analysis", "knowledge"],
  description:
    "Answer a relational question over a CSV/TSV edge list: which nodes are reachable within N hops, " +
    "the shortest hop count between two nodes, or out-degree per node. Every answer is re-derived by an " +
    "independent breadth-first search and compared.",
  executionMode: "subprocess",
  requiredPermissions: ["process.spawn", "fs.read"],
  networkPolicy: "none",
  filesystemPolicy: "workspace-only",
  resourceLimits: { timeoutMs: 60_000, memoryMb: 1024 },
  healthCheck: "python3 -c 'import kuzu'",
  verifierIds: ["data.graph.query.independent-bfs"],
  benchmarks: [],
  provenance: {
    repository: "https://github.com/kuzudb/kuzu",
    commit: KUZU_PINNED_VERSION,
    license: "MIT",
  },
  limitations: [
    "this answers questions over an edge list the caller supplies; it is not a knowledge graph built from Aurora's own memories, which would need entity extraction and therefore a model",
    "a third column is read as a weight but is not routed on, so results are unweighted hop counts and not distances",
    "Kuzu's SHORTEST pattern returns no rows when the start and end bind to the same node, so same-node shortest paths are answered by enumerating paths up to maxHops, which costs more",
    "maxHops is capped at 8; reachability beyond that is not answered rather than approximated",
    "the independent BFS confirms the answer, not that the edge list describes what the caller believes it describes",
  ],
  fallbackCapabilityIds: ["data.duckdb.query"],
};

export const GRAPH_QUERY_CAPABILITY_ID = GRAPH_QUERY_MANIFEST.id;

interface GraphCheck {
  agrees: boolean;
  engine: unknown;
  independent: unknown;
}

interface GraphResult {
  operation: string;
  answer: unknown;
  check: GraphCheck;
  graph: Record<string, unknown>;
  verified: boolean;
  weightNote: string;
}

function parseWorkerOutput(
  stdout: string,
): { ok: true; value: GraphResult } | { ok: false; reason: string } {
  const trimmed = stdout.trim();
  if (trimmed === "") return { ok: false, reason: "the graph worker produced no output at all" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, reason: `the graph worker's output is not valid JSON: ${String(err)}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "the graph worker's output is not a JSON object" };
  }
  const c = parsed as Record<string, unknown>;
  if (typeof c.error === "string") return { ok: false, reason: c.error };
  if (typeof c.operation !== "string") return { ok: false, reason: "the worker named no operation" };

  const rawCheck =
    typeof c.check === "object" && c.check !== null ? (c.check as Record<string, unknown>) : {};
  const check: GraphCheck = {
    agrees: rawCheck.agrees === true,
    engine: rawCheck.engine,
    independent: rawCheck.independent,
  };

  return {
    ok: true,
    value: {
      operation: c.operation,
      answer: c.answer,
      check,
      graph: typeof c.graph === "object" && c.graph !== null ? (c.graph as Record<string, unknown>) : {},
      verified: c.verified === true && check.agrees,
      weightNote: typeof c.weightNote === "string" ? c.weightNote : "",
    },
  };
}

export function graphQueryCapabilities() {
  return [
    defineCapability(
      {
        id: GRAPH_QUERY_CAPABILITY_ID,
        version: GRAPH_QUERY_MANIFEST.version,
        description:
          "Query a graph built from a CSV/TSV edge list and independently re-derive the answer with a BFS. " +
          "Returns 'unavailable' if kuzu is not installed.",
        risk: "workspace_read",
        sideEffect: false,
        source: "core",
        idempotency: "inherent",
      },
      z.object({
        edgesPath: z.string().min(1).max(1000),
        operation: z.enum(GRAPH_OPERATIONS),
        from: z.string().min(1).max(1000).optional(),
        to: z.string().min(1).max(1000).optional(),
        maxHops: z.number().int().min(1).max(8).optional(),
      }),
      async ({ edgesPath, operation, from, to, maxHops }, context) => {
        const contained = resolveWithinWorkspace(context.workspacePath, edgesPath);
        if (!contained.ok) {
          return { status: "failed", reason: contained.reason, queried: false };
        }

        const run = await runSubprocessCapability(GRAPH_QUERY_MANIFEST, {
          command: "python3",
          args: [GRAPH_QUERY_WORKER_PATH],
          stdin: JSON.stringify({
            edgesPath: contained.path,
            operation,
            ...(from !== undefined ? { from } : {}),
            ...(to !== undefined ? { to } : {}),
            ...(maxHops !== undefined ? { maxHops } : {}),
          }),
        });

        if (run.status === "unavailable") {
          return {
            status: "unavailable",
            queried: false,
            installed: false,
            reason: run.reason ?? "kuzu could not be started",
          };
        }

        const parsed = parseWorkerOutput(run.stdout);
        if (!parsed.ok) {
          return {
            status: "failed",
            queried: false,
            installed: true,
            reason: parsed.reason,
            stderr: run.stderr.slice(0, 2000),
          };
        }

        const value = parsed.value;
        return {
          status: run.status,
          queried: true,
          installed: true,
          operation: value.operation,
          answer: value.answer,
          check: value.check,
          graph: value.graph,
          nodeCount: value.graph.nodeCount,
          edgeCount: value.graph.edgeCount,
          // Only true when the independent BFS actually agreed.
          verified: value.verified,
          unchecked: !value.verified,
          weightNote: value.weightNote,
          checkDetail: value.verified
            ? "an independent breadth-first search over the same edge list produced the same answer"
            : "the independent breadth-first search disagreed with the query engine",
          durationMs: run.durationMs,
        };
      },
      {
        idempotency: "inherent",
        output: z.object({
          status: z.string(),
          queried: z.boolean(),
          installed: z.boolean().optional(),
          operation: z.string().optional(),
          answer: z.unknown().optional(),
          check: z.record(z.string(), z.unknown()).optional(),
          graph: z.record(z.string(), z.unknown()).optional(),
          nodeCount: z.unknown().optional(),
          edgeCount: z.unknown().optional(),
          verified: z.boolean().optional(),
          unchecked: z.boolean().optional(),
          weightNote: z.string().optional(),
          checkDetail: z.string().optional(),
          reason: z.string().optional(),
          stderr: z.string().optional(),
          durationMs: z.number().optional(),
        }),
        /**
         * Fails when the independent BFS disagreed, which is the only thing here
         * that can establish the answer is wrong.
         *
         * A refusal — bad path, unknown node, malformed file — is returned as a
         * reason rather than failed, because "this question could not be asked"
         * is not "this answer is wrong".
         */
        verify: async (output) => {
          const value = output as Record<string, unknown>;
          const status = String(value.status ?? "");
          if (status === "unavailable") {
            return { ok: true, reason: String(value.reason ?? "kuzu is not installed") };
          }
          if (value.queried !== true) {
            return {
              ok: true,
              reason: String(value.reason ?? value.stderr ?? "no query ran") || "no query ran",
            };
          }
          const check = value.check as { agrees?: unknown } | undefined;
          if (check !== undefined && check.agrees === false) {
            return {
              ok: false,
              reason:
                "the query engine and an independent breadth-first search disagreed: " +
                `engine=${JSON.stringify((check as Record<string, unknown>).engine)} ` +
                `independent=${JSON.stringify((check as Record<string, unknown>).independent)}`.slice(0, 400),
            };
          }
          return {
            ok: true,
            reason: String(value.checkDetail ?? "the independent check agreed"),
          };
        },
      },
    ),
  ];
}
