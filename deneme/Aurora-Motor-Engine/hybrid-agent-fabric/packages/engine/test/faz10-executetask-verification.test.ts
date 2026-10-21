/**
 * FAZ 10 2/3 — a real run records what was observed, not just what was sent.
 *
 * Drives `ComputerUseService.executeTask` for real rather than through a mock,
 * using `wait` steps: `executeStep` honours `wait` because waiting needs no
 * backend, and throws "not implemented" for everything else — this sandbox has
 * no display, so a click or a keypress cannot genuinely be performed here and
 * this test does not pretend otherwise.
 *
 * What it proves is the wiring: an executed task now carries a verification, and
 * a completed run with nothing observed says so instead of reading as a pass.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ActionExpectation } from "../src/computer-use/action-verification.js";
import { ComputerUseService } from "../src/computer-use/computer-use-service.js";

let dir: string;
let service: ComputerUseService;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "haf-faz10-"));
  service = new ComputerUseService(dir);
  await service.init();
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const holds: ActionExpectation = { description: "the timer elapsed", check: async () => true };

async function makeTask(name: string, stepCount: number): Promise<string> {
  const task = await service.createTask(
    "tenant",
    name,
    "desktop",
    Array.from({ length: stepCount }, (_, i) => ({ type: "wait" as const, value: 1, selector: `wait-${i}` })),
  );
  return task.id;
}

describe("a completed run says what was observed", () => {
  it("records a verification on every step of an executed task", async () => {
    const id = await makeTask("observed", 2);
    const expectations: Record<string, ActionExpectation> = {};
    for (const step of (await service.getTask(id))!.steps) expectations[step.id] = holds;

    const executed = await service.executeTask(id, expectations);
    expect(executed.steps.every((step) => step.verification !== undefined)).toBe(true);
    expect(executed.verification?.verdict).toBe("verified");
  });

  it("reports a run with no expectations as unverified, not as a pass", async () => {
    const id = await makeTask("unobserved", 2);
    const executed = await service.executeTask(id);

    // The run really did complete — that is a fact about execution.
    expect(executed.status).toBe("completed");
    expect(executed.steps.every((step) => step.status === "completed")).toBe(true);

    // And it proves nothing about the world — that is a separate fact.
    expect(executed.verification?.verdict).toBe("unverified");
    expect(executed.verification?.notChecked).toBe(2);
    expect(executed.verification?.verified).toBe(0);
    expect(executed.verification?.summary).toContain("had no expectation");
  });

  it("keeps execution status and verification separate when a check fails", async () => {
    const id = await makeTask("failing-check", 1);
    const executed = await service.executeTask(id, {
      [await firstStepId(id)]: { description: "the timer elapsed", check: async () => "the clock did not move" },
    });

    // The action was issued and did not throw: execution completed.
    expect(executed.status).toBe("completed");
    // It was observed not to have worked: verification failed.
    expect(executed.verification?.verdict).toBe("unverified");
    expect(executed.verification?.failed).toBe(1);
    expect(executed.steps[0]!.verification?.detail).toBe("the clock did not move");
  });

  it("verifies a run whose every step was checked and held", async () => {
    const id = await makeTask("all-checked", 2);
    const expectations: Record<string, ActionExpectation> = {};
    const before = await service.getTask(id);
    for (const step of before!.steps) expectations[step.id] = holds;

    const executed = await service.executeTask(id, expectations);
    expect(executed.verification?.verdict).toBe("verified");
    expect(executed.verification?.verified).toBe(2);
  });
});

async function firstStepId(taskId: string): Promise<string> {
  const task = await service.getTask(taskId);
  return task!.steps[0]!.id;
}
