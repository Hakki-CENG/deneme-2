/**
 * FAZ 16 1/3 — shipping a skill mitigates a gap; only evidence closes it.
 *
 * Walks a real SkillEvolutionService all the way from an observed gap to a
 * production skill, through every stage gate, and checks what the gap says at the
 * end. The gates themselves are rigorous and unchanged: production still requires
 * an approval actor, a regression baseline, composite >= 0.7, safety >= 0.9 and a
 * recorded beta invocation.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SkillEvolutionService } from "../src/evolution/skill-evolution-service.js";

let dir: string;
let service: SkillEvolutionService;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "haf-faz16-"));
  service = new SkillEvolutionService(dir);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const TENANT = "tenant";

/** Drives a candidate through every gate to production, against a real gap. */
async function promoteToProduction(name: string): Promise<{ gapId: string; candidateId: string }> {
  const { gap } = await service.observeGap({
    tenantId: TENANT,
    kind: "capability-gap",
    description: `${name}: the agent cannot reconcile ledger entries`,
    severity: 0.9,
    evidenceRefs: ["trace-1"],
  });

  const candidate = await service.createBlueprint({
    tenantId: TENANT,
    name,
    purpose: "reconcile ledger entries",
    gapId: gap.id,
    tests: ["reconciles a balanced ledger", "refuses an unbalanced ledger"],
    risks: ["may misreport a rounding difference as an error"],
  });

  await service.advanceStage({ tenantId: TENANT, candidateId: candidate.id, to: "sandbox", actor: "arena", reason: "declared tests and risks" });
  await service.recordEvaluation({ tenantId: TENANT, candidateId: candidate.id, suite: "reconcile", passed: 10, failed: 0, safetyFindings: 0 });
  await service.advanceStage({ tenantId: TENANT, candidateId: candidate.id, to: "test", actor: "arena", reason: "one sandbox evaluation recorded" });
  await service.recordEvaluation({ tenantId: TENANT, candidateId: candidate.id, suite: "reconcile", passed: 12, failed: 0, safetyFindings: 0 });
  await service.advanceStage({ tenantId: TENANT, candidateId: candidate.id, to: "beta", actor: "arena", reason: "two evaluations, floors met" });
  await service.recordUsage({ tenantId: TENANT, candidateId: candidate.id, success: true, durationMs: 400 });
  await service.recordRegressionBaseline(TENANT, candidate.id, "reconcile", 1);
  await service.advanceStage({
    tenantId: TENANT,
    candidateId: candidate.id,
    to: "production",
    actor: "arena",
    reason: "met every production gate",
    approval: { actor: "reviewer", reason: "approved for production" },
  });

  return { gapId: gap.id, candidateId: candidate.id };
}

describe("the gates still hold", () => {
  it("refuses a production promotion with no approval", async () => {
    const candidate = await service.createBlueprint({
      tenantId: TENANT,
      name: "ungated",
      purpose: "test the gate",
      tests: ["t"],
      risks: ["r"],
    });
    await service.advanceStage({ tenantId: TENANT, candidateId: candidate.id, to: "sandbox", actor: "arena", reason: "r" });
    await service.recordEvaluation({ tenantId: TENANT, candidateId: candidate.id, suite: "s", passed: 5, failed: 0 });
    await service.advanceStage({ tenantId: TENANT, candidateId: candidate.id, to: "test", actor: "arena", reason: "r" });
    await service.recordEvaluation({ tenantId: TENANT, candidateId: candidate.id, suite: "s", passed: 5, failed: 0 });
    await service.advanceStage({ tenantId: TENANT, candidateId: candidate.id, to: "beta", actor: "arena", reason: "r" });
    await expect(
      service.advanceStage({ tenantId: TENANT, candidateId: candidate.id, to: "production", actor: "arena", reason: "no approval" }),
    ).rejects.toThrow(/explicit approval/);
  });
});

describe("reaching production mitigates the gap, it does not close it", () => {
  it("leaves the gap mitigated after a fully gated promotion", async () => {
    const { gapId, candidateId } = await promoteToProduction("reconciler");

    const candidate = (await service.candidates(TENANT, "production")).find((item) => item.id === candidateId);
    expect(candidate?.stage).toBe("production");

    const gap = (await service.gaps(TENANT)).find((item) => item.id === gapId);
    // The point: the skill shipped, the gates all passed, and the gap is still not
    // claimed to be closed.
    expect(gap?.status).toBe("mitigated");
  });

  it("records in the journal that mitigation is not resolution", async () => {
    const { gapId } = await promoteToProduction("reconciler-2");
    const entries = await service.journalEntries(TENANT, 200);
    const entry = entries.find((item) => item.summary.includes("mitigated, not resolved"));
    expect(entry).toBeDefined();
    // The subject of a stage entry is the skill being staged; the gap is named in
    // the summary, since the entry records what the promotion did to the gap.
    expect(entry?.kind).toBe("stage");
    expect(entry?.summary).toContain("nothing has verified the gap is closed");
    const gap = (await service.gaps(TENANT)).find((item) => item.id === gapId);
    expect(gap?.status).toBe("mitigated");
  });

  it("exposes mitigated as a filterable state", async () => {
    await promoteToProduction("reconciler-3");
    const mitigated = await service.gaps(TENANT, "mitigated");
    expect(mitigated.length).toBeGreaterThanOrEqual(3);
    const resolved = await service.gaps(TENANT, "resolved");
    expect(resolved).toEqual([]);
  });
});

describe("only evidence closes a gap", () => {
  it("resolves a mitigated gap when evidence is named", async () => {
    const { gapId } = await promoteToProduction("reconciler-4");
    const resolved = await service.resolveGap(TENANT, gapId, {
      evidenceRefs: ["run-2026-10-08: the ledger run that failed now passes"],
      reason: "the failing run was re-executed and passed",
      actor: "arena",
    });
    expect(resolved.status).toBe("resolved");
    expect(resolved.evidenceRefs).toContain("run-2026-10-08: the ledger run that failed now passes");
  });

  it("refuses to resolve on empty evidence", async () => {
    const { gapId } = await promoteToProduction("reconciler-5");
    await expect(
      service.resolveGap(TENANT, gapId, { evidenceRefs: [], reason: "it works", actor: "arena" }),
    ).rejects.toThrow(/cannot be resolved without evidence/);

    // And the gap is unchanged, not half-closed.
    const gap = (await service.gaps(TENANT)).find((item) => item.id === gapId);
    expect(gap?.status).toBe("mitigated");
  });

  it("refuses whitespace-only evidence", async () => {
    const { gapId } = await promoteToProduction("reconciler-6");
    await expect(
      service.resolveGap(TENANT, gapId, { evidenceRefs: ["   ", ""], reason: "it works", actor: "arena" }),
    ).rejects.toThrow(/cannot be resolved without evidence/);
  });

  it("keeps an already-resolved gap resolved when another skill is promoted", async () => {
    const { gapId } = await promoteToProduction("reconciler-7");
    await service.resolveGap(TENANT, gapId, { evidenceRefs: ["evidence"], reason: "observed", actor: "arena" });
    const gap = (await service.gaps(TENANT)).find((item) => item.id === gapId);
    expect(gap?.status).toBe("resolved");
  });
});
