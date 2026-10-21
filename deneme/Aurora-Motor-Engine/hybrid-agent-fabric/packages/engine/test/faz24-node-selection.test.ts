/**
 * FAZ 24 1/3 — node selection, with the three defects it replaces reproduced.
 *
 * The load-bearing cases: a node without the model is never selected even though it
 * is online, a node registered and never contacted is never selected even though its
 * status says online, and no suitable node is reported rather than filled with a
 * wrong pick.
 */

import { describe, expect, it } from "vitest";

import type { EdgeNode } from "../src/federated/federated-service.js";
import {
  NODE_HEARTBEAT_STALE_MS,
  selectNodeForModel,
  STORAGE_HEADROOM,
} from "../src/federated/node-selection.js";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const MODEL = { id: "m1", format: "gguf" as const, sizeBytes: 100 * 1_048_576 };

function node(overrides: Partial<EdgeNode> = {}): EdgeNode {
  return {
    id: overrides.id ?? "n1",
    tenantId: "t1",
    name: overrides.name ?? "laptop",
    target: "local",
    status: "online",
    capabilities: {
      cpu: { cores: 8, architecture: "arm64" },
      memory: { totalMb: 32_768, availableMb: 16_384 },
      storage: { totalMb: 512_000, availableMb: 200_000 },
      network: { bandwidthMbps: 100, latencyMs: 5 },
      supportedFormats: ["gguf"],
    },
    models: ["m1"],
    lastHeartbeat: "2026-10-10T11:59:50.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("a node that can actually run the model is selected", () => {
  it("selects it and says why", () => {
    const selection = selectNodeForModel([node()], MODEL, NOW);
    expect(selection.verdict).toBe("selected");
    expect(selection.nodeName).toBe("laptop");
    expect(selection.assessed[0]!.suitable).toBe(true);
    expect(selection.assessed[0]!.detail).toContain("has the model");
  });

  it("prefers the node with more declared free storage", () => {
    const small = node({ id: "small", name: "pi", capabilities: { ...node().capabilities, storage: { totalMb: 64_000, availableMb: 200 } } });
    const large = node({ id: "large", name: "server", capabilities: { ...node().capabilities, storage: { totalMb: 1_000_000, availableMb: 900_000 } } });
    expect(selectNodeForModel([small, large], MODEL, NOW).nodeName).toBe("server");
  });
});

describe("rule 1 — a node without the model is never selected", () => {
  it("refuses rather than falling back to any online node", () => {
    // This is the defect: the old selectNode's `?? nodes.find(n => n.status ===
    // "online")` would have returned this node.
    const withoutModel = node({ models: ["some-other-model"] });
    const selection = selectNodeForModel([withoutModel], MODEL, NOW);

    expect(selection.verdict).toBe("no-suitable-node");
    expect(selection.nodeId).toBeUndefined();
    expect(selection.assessed[0]!.rejections).toContain("model-not-present");
    expect(selection.detail).toContain("model-not-present");
  });

  it("picks the node that has the model over one that merely is online", () => {
    const wrong = node({ id: "wrong", name: "busy-box", models: [] });
    const right = node({ id: "right", name: "laptop" });
    const selection = selectNodeForModel([wrong, right], MODEL, NOW);
    expect(selection.nodeName).toBe("laptop");
    expect(selection.assessed.find((a) => a.nodeName === "busy-box")!.rejections).toContain("model-not-present");
  });
});

describe("rule 2 — status online is a claim made at registration", () => {
  it("refuses a node that was never contacted", () => {
    // registerNode writes status "online" with lastHeartbeat undefined.
    const neverContacted = node({ lastHeartbeat: undefined });
    const selection = selectNodeForModel([neverContacted], MODEL, NOW);

    expect(selection.verdict).toBe("no-suitable-node");
    expect(selection.assessed[0]!.rejections).toContain("never-contacted");
    expect(selection.assessed[0]!.detail).toContain("the status was written at registration");
  });

  it("refuses a stale heartbeat and states the window", () => {
    const stale = node({ lastHeartbeat: "2026-10-10T11:50:00.000Z" });
    const selection = selectNodeForModel([stale], MODEL, NOW);
    expect(selection.assessed[0]!.rejections).toContain("stale-heartbeat");
    expect(selection.assessed[0]!.detail).toContain(`${NODE_HEARTBEAT_STALE_MS} ms`);
  });

  it("accepts a heartbeat inside the window, at the boundary", () => {
    const atBoundary = node({ lastHeartbeat: new Date(NOW.getTime() - NODE_HEARTBEAT_STALE_MS).toISOString() });
    expect(selectNodeForModel([atBoundary], MODEL, NOW).verdict).toBe("selected");
  });

  it("refuses a node whose status is not online", () => {
    const offline = node({ status: "offline" });
    expect(selectNodeForModel([offline], MODEL, NOW).assessed[0]!.rejections).toContain("status-not-online");
  });
});

describe("rule 3 — declared capabilities are checked against what the model needs", () => {
  it("refuses insufficient storage and names the constraint", () => {
    const tiny = node({ capabilities: { ...node().capabilities, storage: { totalMb: 100, availableMb: 50 } } });
    const assessment = selectNodeForModel([tiny], MODEL, NOW).assessed[0]!;
    expect(assessment.rejections).toContain("insufficient-storage");
    expect(assessment.detail).toContain("declares 50 MB free");
    expect(assessment.detail).toContain(`${STORAGE_HEADROOM * 100}% head-room`);
  });

  it("refuses insufficient memory", () => {
    const lowMem = node({ capabilities: { ...node().capabilities, memory: { totalMb: 512, availableMb: 10 } } });
    expect(selectNodeForModel([lowMem], MODEL, NOW).assessed[0]!.rejections).toContain("insufficient-memory");
  });

  it("refuses a node that does not support the model's format", () => {
    const onnxOnly = node({ capabilities: { ...node().capabilities, supportedFormats: ["onnx"] } });
    expect(selectNodeForModel([onnxOnly], MODEL, NOW).assessed[0]!.rejections).toContain("format-unsupported");
  });

  it("accumulates every reason rather than stopping at the first", () => {
    const hopeless = node({
      models: [],
      lastHeartbeat: undefined,
      capabilities: { ...node().capabilities, supportedFormats: ["onnx"], storage: { totalMb: 10, availableMb: 1 } },
    });
    const rejections = selectNodeForModel([hopeless], MODEL, NOW).assessed[0]!.rejections;
    expect(rejections).toEqual(
      expect.arrayContaining(["model-not-present", "never-contacted", "format-unsupported", "insufficient-storage"]),
    );
  });
});

describe("rule 4 — selecting nothing is a report, not a wrong pick", () => {
  it("reports an empty registry as an empty registry", () => {
    const selection = selectNodeForModel([], MODEL, NOW);
    expect(selection.verdict).toBe("no-suitable-node");
    expect(selection.detail).toBe("no nodes are registered at all");
  });

  it("gives a reason for every node considered", () => {
    const selection = selectNodeForModel(
      [node({ id: "a", name: "no-model", models: [] }), node({ id: "b", name: "never-seen", lastHeartbeat: undefined })],
      MODEL,
      NOW,
    );
    expect(selection.assessed).toHaveLength(2);
    expect(selection.detail).toContain("no-model (model-not-present)");
    expect(selection.detail).toContain("never-seen (never-contacted)");
  });
});

describe("rule 5 — this is selection only", () => {
  it("returns no execution result of any kind", () => {
    const selection = selectNodeForModel([node()], MODEL, NOW);
    expect("result" in selection).toBe(false);
    expect("output" in selection).toBe(false);
  });
});
