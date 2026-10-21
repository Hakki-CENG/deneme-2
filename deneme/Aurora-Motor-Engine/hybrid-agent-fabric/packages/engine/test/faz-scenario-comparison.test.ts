/**
 * The renamed scenario ledger says what its ranking is built from.
 *
 * `recommend` ranks numbers the scenario's own author supplied — the defect FAZ 19
 * found in `selectStrategy`. The ranking is unchanged here; what changed is that the
 * reasoning states it and reports the tenant's measured calibration error, so the
 * recommendation does not read as a measurement.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ScenarioComparisonService } from "../src/aurora/scenario-comparison.js";

let root = "";
let service: ScenarioComparisonService;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "scenario-"));
  service = new ScenarioComparisonService(root);
  await service.init();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function scenario(name: string, over: Partial<Parameters<ScenarioComparisonService["addScenario"]>[1]> = {}) {
  return {
    name,
    description: `${name} described`,
    assumptions: [],
    parameters: {},
    estimatedEffort: 50,
    estimatedRisk: 0.5,
    estimatedCost: 50,
    estimatedQuality: 0.5,
    pros: [],
    cons: [],
    confidence: 0.5,
    ...over,
  };
}

describe("recommend states that its inputs are declared, not observed", () => {
  it("says so in the reasoning it returns", async () => {
    const sim = await service.createSimulation("t1", "which approach?", "context");
    await service.addScenario(sim.id, scenario("fast", { estimatedRisk: 0.1 }));
    await service.addScenario(sim.id, scenario("careful", { estimatedRisk: 0.9 }));

    const { scenarioId, reasoning } = await service.recommend(sim.id);

    expect(scenarioId).not.toBe("");
    expect(reasoning).toContain("Scored from the scenarios' own declared estimates, not from observed outcomes");
  });

  it("says there is no evidence yet rather than implying accuracy", async () => {
    const sim = await service.createSimulation("t1", "which approach?", "context");
    await service.addScenario(sim.id, scenario("only"));

    const { reasoning } = await service.recommend(sim.id);
    expect(reasoning).toContain("No completed outcomes recorded for this tenant yet");
    expect(reasoning).toContain("no evidence about how accurate such estimates have been");
  });

  it("reports the measured estimate error once outcomes exist", async () => {
    const sim = await service.createSimulation("t1", "which approach?", "context");
    const chosen = await service.addScenario(
      sim.id,
      scenario("picked", { estimatedEffort: 20, estimatedRisk: 0.2, estimatedCost: 20, estimatedQuality: 0.9 }),
    );
    await service.recordOutcome(sim.id, chosen.id, "it overran", { effort: 80, risk: 0.7, cost: 60, quality: 0.4 });

    const { reasoning } = await service.recommend(sim.id);
    expect(reasoning).toContain("Across 1 completed outcome(s) for this tenant the estimates were off by");
    // The estimate said effort 20 and it was 80 — the reasoning has to carry that.
    expect(reasoning).toContain("effort 60");
  });
});

describe("the ranking itself is unchanged by the rename", () => {
  it("still picks the highest weighted score", async () => {
    const sim = await service.createSimulation("t1", "which approach?", "context");
    const low = await service.addScenario(sim.id, scenario("low", { estimatedRisk: 0.1, estimatedQuality: 0.9 }));
    await service.addScenario(sim.id, scenario("high", { estimatedRisk: 0.9, estimatedQuality: 0.1 }));

    expect((await service.recommend(sim.id)).scenarioId).toBe(low.id);
  });

  it("returns an empty recommendation when there are no scenarios", async () => {
    const sim = await service.createSimulation("t1", "which approach?", "context");
    const result = await service.recommend(sim.id);
    expect(result.scenarioId).toBe("");
    expect(result.reasoning).toBe("No scenarios");
  });
});
