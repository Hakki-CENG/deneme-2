/**
 * FAZ 24 1/3 — node selection that does not widen its own requirement.
 *
 * FAZ 24 asks for `task → node selection → remote execution → result → verification`,
 * and marks the whole phase "İlk aşamada yapma". Remote execution is genuinely not
 * available here: one machine, no peer nodes, no network to third parties, and
 * `runInference` already throws rather than returning a placeholder. So the chain is
 * not built.
 *
 * But the second link is a pure function over records, and measuring it found three
 * real defects in `FederatedService.selectNode`:
 *
 *   ```ts
 *   nodes.find(n => n.status === "online" && n.models.includes(modelId))
 *     ?? nodes.find(n => n.status === "online")
 *   ```
 *
 *   1. The fallback returns **any** online node — including one that does not have
 *      the model. That turns "no node can run this" into "this node will fail",
 *      which is a worse answer because it arrives looking like a selection.
 *   2. `capabilities` is never consulted at all. `NodeCapabilities` declares cpu,
 *      memory, gpu, storage, network and `supportedFormats`, and a node advertising
 *      1 MB of free storage is selected exactly like one with 64 GB.
 *   3. `registerNode` writes `status: "online"` at registration with
 *      `lastHeartbeat` undefined. `heartbeat()` is the only writer of
 *      `lastHeartbeat`, so **a node registered and never contacted again is online
 *      forever**, and `selectNode` trusts it.
 *
 * Defect 3 is this project's recurring one in federated form: a status declared once
 * is treated as a measurement that keeps being taken.
 *
 * Five rules:
 *
 *   1. A node that does not have the model is not a candidate. There is no fallback
 *      that silently widens the requirement.
 *   2. `status: "online"` is a claim made at registration, not evidence of contact.
 *      A node with no heartbeat, or one older than the stated staleness window, is
 *      not selectable.
 *   3. Declared capabilities are claims, so they are checked against what the model
 *      actually needs — size against free storage, and `supportedFormats` against
 *      the model's format — and a node that fails is refused *with the constraint
 *      named*.
 *   4. Selecting nothing is a valid, reportable result. `no-suitable-node` carries
 *      the reason for every node considered; it never picks a wrong node to avoid
 *      being empty.
 *   5. This is selection only. Nothing here executes remotely, and this module does
 *      not make `federated` stable: there is still no parameter aggregation across
 *      nodes and no gradient exchange.
 */

import type { EdgeNode, LocalModel, ModelFormat, NodeCapabilities } from "./federated-service.js";

export type NodeRejection =
  | "model-not-present"
  | "never-contacted"
  | "stale-heartbeat"
  | "status-not-online"
  | "format-unsupported"
  | "insufficient-storage"
  | "insufficient-memory";

export interface NodeAssessment {
  readonly nodeId: string;
  readonly nodeName: string;
  readonly suitable: boolean;
  readonly rejections: readonly NodeRejection[];
  /** Declared free storage in MB, when the node declares any. */
  readonly freeStorageMb?: number;
  readonly detail: string;
}

export type SelectionVerdict = "selected" | "no-suitable-node";

export interface NodeSelection {
  readonly verdict: SelectionVerdict;
  readonly nodeId?: string;
  readonly nodeName?: string;
  /** Every node considered, with why it was or was not suitable. */
  readonly assessed: readonly NodeAssessment[];
  readonly detail: string;
}

/** A heartbeat older than this is stale. Stated, not assumed. */
export const NODE_HEARTBEAT_STALE_MS = 60_000;

/** Head-room required over the model size, as a fraction, for storage. */
export const STORAGE_HEADROOM = 0.25;

const MB = 1_048_576;

/**
 * Selects a node for a model, or says why none can be used.
 *
 * `now` is supplied so staleness is testable and so an answer does not change under
 * a caller mid-flight.
 */
export function selectNodeForModel(
  nodes: readonly EdgeNode[],
  model: Pick<LocalModel, "id" | "format" | "sizeBytes">,
  now: Date,
  options: { staleAfterMs?: number } = {},
): NodeSelection {
  const staleAfterMs = options.staleAfterMs ?? NODE_HEARTBEAT_STALE_MS;
  const assessed = nodes.map((node) => assessNode(node, model, now, staleAfterMs));
  const suitable = assessed.filter((candidate) => candidate.suitable);

  if (suitable.length === 0) {
    return {
      verdict: "no-suitable-node",
      assessed,
      detail:
        nodes.length === 0
          ? "no nodes are registered at all"
          : `none of ${nodes.length} node(s) can run model "${model.id}": ${assessed
              .map((candidate) => `${candidate.nodeName} (${candidate.rejections.join(", ")})`)
              .join("; ")}`,
    };
  }

  // Among suitable nodes, prefer the one with the most free storage. A declared
  // number is still a claim, but preferring the larger claim costs nothing and
  // refusing to rank at all would discard the only signal available.
  const best = [...suitable].sort(
    (a, b) => (b.freeStorageMb ?? -1) - (a.freeStorageMb ?? -1) || a.nodeName.localeCompare(b.nodeName),
  )[0]!;

  return {
    verdict: "selected",
    nodeId: best.nodeId,
    nodeName: best.nodeName,
    assessed,
    detail: `"${best.nodeName}" selected from ${suitable.length} suitable of ${nodes.length} registered`,
  };
}

function assessNode(
  node: EdgeNode,
  model: Pick<LocalModel, "id" | "format" | "sizeBytes">,
  now: Date,
  staleAfterMs: number,
): NodeAssessment {
  const rejections: NodeRejection[] = [];
  const base = { nodeId: node.id, nodeName: node.name };

  // Rule 1: the model must be on the node. There is no fallback past this.
  if (!node.models.includes(model.id)) rejections.push("model-not-present");

  // Rule 2: "online" is a claim made at registration.
  if (node.status !== "online") {
    rejections.push("status-not-online");
  } else if (node.lastHeartbeat === undefined) {
    rejections.push("never-contacted");
  } else {
    const age = now.getTime() - new Date(node.lastHeartbeat).getTime();
    if (!(age <= staleAfterMs)) rejections.push("stale-heartbeat");
  }

  // Rule 3: declared capabilities are claims, checked against what is needed.
  if (!node.capabilities.supportedFormats.includes(model.format)) rejections.push("format-unsupported");

  const requiredMb = (model.sizeBytes / MB) * (1 + STORAGE_HEADROOM);
  const freeStorageMb = node.capabilities.storage.availableMb;
  if (freeStorageMb < requiredMb) rejections.push("insufficient-storage");
  if (node.capabilities.memory.availableMb < model.sizeBytes / MB) rejections.push("insufficient-memory");

  return {
    ...base,
    suitable: rejections.length === 0,
    rejections,
    freeStorageMb,
    detail:
      rejections.length === 0
        ? `has the model, heartbeat ${describeHeartbeat(node.lastHeartbeat, now)}, supports ${model.format}, ${freeStorageMb} MB free against ${Math.round(requiredMb)} MB needed`
        : rejections
            .map((rejection) =>
              rejection === "insufficient-storage"
                ? `declares ${freeStorageMb} MB free but the model needs ${Math.round(requiredMb)} MB including ${STORAGE_HEADROOM * 100}% head-room`
                : rejection === "never-contacted"
                  ? 'status is "online" but no heartbeat was ever received — the status was written at registration'
                  : rejection === "stale-heartbeat"
                    ? `last heartbeat was ${describeHeartbeat(node.lastHeartbeat, now)}, older than ${staleAfterMs} ms`
                    : rejection,
            )
            .join("; "),
  };
}

function describeHeartbeat(lastHeartbeat: string | undefined, now: Date): string {
  if (lastHeartbeat === undefined) return "never";
  const ageMs = now.getTime() - new Date(lastHeartbeat).getTime();
  return `${Math.round(ageMs / 1000)}s ago`;
}

/** Whether a declared format is one this registry could ever run. */
export function isSupportedFormat(format: ModelFormat, capabilities: NodeCapabilities): boolean {
  return capabilities.supportedFormats.includes(format);
}
