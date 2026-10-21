/**
 * FAZ 10 1/3 — an automation action is verified by looking.
 *
 * The rules, plus the measured environment: this machine has no display, so the
 * honest answer for real automation here is "could not observe", and one test
 * asserts that as a measurement rather than a comment.
 */

import { describe, expect, it } from "vitest";

import {
  automationVerifier,
  displayAvailable,
  verifyAutomationStep,
  verifyAutomationTask,
} from "../src/computer-use/action-verification.js";
import type { ActionExpectation } from "../src/computer-use/action-verification.js";
import type { AutomationStep, AutomationTask } from "../src/computer-use/computer-use-service.js";
import { acceptCodeWork } from "../src/experts/coding-expert.js";
import type { VerificationReport } from "../src/execution/verification-factory.js";

function step(fields: Partial<AutomationStep> = {}): AutomationStep {
  return { id: "s1", type: "click", status: "completed", ...fields };
}

function task(steps: AutomationStep[]): AutomationTask {
  return {
    id: "t1",
    tenantId: "tenant",
    name: "fill the form",
    target: "browser",
    steps,
    status: "completed",
    currentStepIndex: steps.length,
    rollbackSteps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const holds: ActionExpectation = { description: "the dialog closed", check: async () => true };
const notHeld: ActionExpectation = { description: "the dialog closed", check: async () => "the dialog is still open" };

describe("rule 1 — issued is not evidence about the world", () => {
  it("reports not-checked for a completed step with no expectation", async () => {
    const result = await verifyAutomationStep(step(), undefined);
    expect(result.outcome).toBe("not-checked");
    expect(result.detail).toContain("nothing was observed afterwards");
  });

  it("does not infer success from the absence of an error", async () => {
    // The step completed cleanly and recorded no error. That still proves nothing.
    const result = await verifyAutomationStep(step({ error: undefined }), undefined);
    expect(result.outcome).toBe("not-checked");
  });
});

describe("a check that holds verifies the step", () => {
  it("reports verified with what was observed", async () => {
    const result = await verifyAutomationStep(step(), holds);
    expect(result.outcome).toBe("verified");
    expect(result.detail).toBe("the dialog closed");
  });

  it("reports a failed check with the reason, not just a boolean", async () => {
    const result = await verifyAutomationStep(step(), notHeld);
    expect(result.outcome).toBe("failed");
    expect(result.detail).toBe("the dialog is still open");
  });
});

describe("rule 2 — could not look is not looked and found wrong", () => {
  it("reports could-not-observe when the check throws", async () => {
    const result = await verifyAutomationStep(step(), {
      description: "the dialog closed",
      check: async () => {
        throw new Error("no display to read");
      },
    });
    expect(result.outcome).toBe("could-not-observe");
    expect(result.detail).toContain("no display to read");
  });
});

describe("rule 3 — an action that did not run cannot be verified by its effects", () => {
  it("refuses a passing check on a step that never completed", async () => {
    for (const status of ["pending", "running", "failed", "rolled_back"] as const) {
      const result = await verifyAutomationStep(step({ status, error: "click missed" }), holds);
      expect(result.outcome, status).toBe("could-not-observe");
      expect(result.detail, status).toContain(`the step ended "${status}"`);
    }
  });

  it("carries the step's error into the detail", async () => {
    const result = await verifyAutomationStep(step({ status: "failed", error: "element not found" }), holds);
    expect(result.detail).toContain("element not found");
  });
});

describe("rule 5 — one unchecked step un-verifies the task", () => {
  it("is unverified when a step had no expectation", async () => {
    const verification = await verifyAutomationTask(task([step(), step({ id: "s2", type: "type" })]), {
      s1: holds,
    });
    expect(verification.verdict).toBe("unverified");
    expect(verification.verified).toBe(1);
    expect(verification.notChecked).toBe(1);
    expect(verification.summary).toContain("had no expectation");
  });

  it("is verified only when every step was checked and held", async () => {
    const verification = await verifyAutomationTask(task([step(), step({ id: "s2", type: "type" })]), {
      s1: holds,
      s2: holds,
    });
    expect(verification.verdict).toBe("verified");
    expect(verification.verified).toBe(2);
  });

  it("reports an empty task as unverified, not as a pass", async () => {
    const verification = await verifyAutomationTask(task([]), {});
    expect(verification.verdict).toBe("unverified");
    expect(verification.summary).toContain("no steps");
  });
});

describe("the measured environment", () => {
  it("reports that this sandbox has no screen to observe", () => {
    // A measurement, not an assumption: if a display ever appears this fails,
    // which is correct because the honest answer would then change.
    const display = displayAvailable();
    expect(display.available).toBe(false);
    expect(display.reason).toContain("no screen to observe");
  });

  it("reports a display when one is present", () => {
    expect(displayAvailable({ DISPLAY: ":0" }).available).toBe(true);
    expect(displayAvailable({ WAYLAND_DISPLAY: "wayland-0" }).available).toBe(true);
  });
});

describe("the wrapper is external evidence", () => {
  it("is a V2 empirical verifier", () => {
    const verifier = automationVerifier("automation", task([step()]), { s1: holds });
    expect(verifier.tier).toBe("V2_empirical");
  });

  it("counts an unobservable step as a failure to verify, not a pass", async () => {
    const verifier = automationVerifier("automation", task([step()]), {});
    const outcome = await verifier.run({} as never, {} as never);
    // `not-checked` is neither passed nor failed: it is an absence of evidence.
    expect(outcome.evidence).toContain("0/1 steps verified");
    expect(outcome.evidence).toContain("had no expectation");
  });

  it("carries a claim FAZ 6 refuses on consensus alone", async () => {
    const verifier = automationVerifier("automation", task([step()]), { s1: holds });
    const outcome = await verifier.run({} as never, {} as never);
    const report: VerificationReport = {
      verdict: "pass",
      results: [{ ...outcome, tier: verifier.tier, verifier: verifier.name, scope: verifier.scope ?? "goal" }],
      strongestTier: "V2_empirical",
      autonomy: "high",
      status: "succeeded",
      summary: outcome.evidence,
    };
    expect(acceptCodeWork(report).accepted).toBe(true);
  });
});
