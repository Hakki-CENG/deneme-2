/**
 * FAZ 5 — the engine threads the expert registry into the loop.
 *
 * The loop dep is tested elsewhere; this covers the one line that decides
 * whether a deployment can reach it at all. Without it, `experts` on the engine
 * config would be accepted by the type checker and ignored at runtime.
 *
 * What the mock model can and cannot do is stated rather than papered over: it
 * does not produce a capability analysis, so understanding falls back and the
 * router correctly reports that nothing could be determined. The assertion is
 * that routing *ran* — presence of the field — which is exactly the engine's
 * contribution.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/index.js";
import { ExpertRegistry, type CapabilitySource } from "../src/experts/expert-registry.js";
import type { CapabilityDescriptor } from "../src/types.js";

const engines: HybridAgentEngine[] = [];

afterAll(async () => {
  for (const engine of engines.splice(0)) await engine.shutdown().catch(() => undefined);
});

function source(...ids: string[]): CapabilitySource {
  const descriptors: CapabilityDescriptor[] = ids.map((id) => ({
    id,
    version: "1.0.0",
    description: id,
    risk: "pure",
    sideEffect: false,
    inputSchema: {},
    source: "core",
  }));
  return { list: () => descriptors };
}

async function engineWith(experts?: ExpertRegistry) {
  const engine = new HybridAgentEngine({
    homePath: await mkdtemp(join(tmpdir(), "haf-faz5-")),
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
    ...(experts === undefined ? {} : { experts }),
  });
  engines.push(engine);
  return engine;
}

describe("the engine passes its expert registry to the loop", () => {
  it("routes when a registry was configured", async () => {
    const registry = new ExpertRegistry(source("agent.list"));
    registry.register({
      id: "swe",
      domain: "software-engineering",
      tools: ["agent.list"],
      safety: { maxCapabilityRisk: "workspace_read" },
      memoryNamespace: "expert.swe",
      servesCapabilities: ["code_change"],
    });

    const report = await (await engineWith(registry)).execute({
      tenantId: "local",
      goal: "Create hello.txt containing Hi",
    });

    // Presence is the engine's whole contribution here: the dep reached the loop.
    expect(report.routing, "the engine did not pass its registry to the loop").toBeDefined();
    expect(report.routing?.source).toBe("none");
    expect(report.routing?.reason).toContain("no capability analysis was available");
  });

  it("omits routing when no registry was configured", async () => {
    const report = await (await engineWith()).execute({
      tenantId: "local",
      goal: "Create hello.txt containing Hi",
    });

    // Absent means nobody was asked to route — not a routing that found nobody.
    expect(report.routing).toBeUndefined();
  });
});
