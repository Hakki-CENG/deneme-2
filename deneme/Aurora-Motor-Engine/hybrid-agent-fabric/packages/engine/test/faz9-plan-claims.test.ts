/**
 * FAZ 9 3/3 — a plan can declare a number, and only a command can confirm it.
 *
 * The load-bearing test is the rejection: a step that claims a value with no way
 * to recompute it is refused at validation. Without that rule the declaration
 * would be a number the model asserted and nothing checked — precisely what
 * FAZ 9 forbids, wearing the costume of a plan field.
 */

import { describe, expect, it } from "vitest";

import { validatePlanSteps } from "../src/aurora/task-planner.js";
import {
  declaredNumericClaims,
  numericChecksFromSteps,
  numericClaimsFromSteps,
  verifyPlanNumbers,
} from "../src/science/numeric-claims.js";
import type { StepWithExpectation } from "../src/science/numeric-claims.js";

function rawStep(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "compute",
    description: "compute the mean latency",
    dependencies: [],
    risk: "low",
    estimatedMs: 1000,
    ...fields,
  };
}

describe("plan validation accepts a claim it can check", () => {
  it("keeps a value paired with a command", () => {
    const result = validatePlanSteps([
      rawStep({ numericExpectation: { value: 4, command: "node -e 'console.log((2+4+6)/3)'" } }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0]?.numericExpectation?.value).toBe(4);
    expect(result.steps[0]?.numericExpectation?.command).toContain("console.log");
  });

  it("keeps a stated tolerance", () => {
    const result = validatePlanSteps([
      rawStep({ numericExpectation: { value: 0.3, command: "sum", tolerance: { absolute: 1e-9 } } }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0]?.numericExpectation?.tolerance?.absolute).toBe(1e-9);
  });

  it("accepts a step with no numeric expectation at all", () => {
    // An ordinary plan declares no numbers, and that must stay valid.
    const result = validatePlanSteps([rawStep()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0]?.numericExpectation).toBeUndefined();
  });
});

describe("a number with no way to reproduce it is refused", () => {
  it("rejects a value with no command, and says why", () => {
    const result = validatePlanSteps([rawStep({ numericExpectation: { value: 4 } })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("gives no command to recompute it");
    expect(result.reason).toContain("leaves the model as the only decider");
  });

  it("rejects an empty command as firmly as a missing one", () => {
    const result = validatePlanSteps([rawStep({ numericExpectation: { value: 4, command: "   " } })]);
    expect(result.ok).toBe(false);
  });

  it("rejects a value that is not a finite number", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "4", null]) {
      const result = validatePlanSteps([rawStep({ numericExpectation: { value, command: "c" } })]);
      expect(result.ok, `value ${String(value)}`).toBe(false);
    }
  });

  it("rejects a malformed expectation", () => {
    expect(validatePlanSteps([rawStep({ numericExpectation: 4 })]).ok).toBe(false);
    expect(
      validatePlanSteps([rawStep({ numericExpectation: { value: 4, command: "c", tolerance: 1 } })]).ok,
    ).toBe(false);
    expect(
      validatePlanSteps([rawStep({ numericExpectation: { value: 4, command: "c", tolerance: { absolute: -1 } } })]).ok,
    ).toBe(false);
    expect(
      validatePlanSteps([rawStep({ numericExpectation: { value: 4, command: "c", tolerance: { relative: 5 } } })]).ok,
    ).toBe(false);
  });
});

describe("deriving claims from a plan", () => {
  it("skips steps that declared nothing", () => {
    const steps: StepWithExpectation[] = [
      { name: "fetch", description: "fetch the logs" },
      { name: "compute", description: "compute the mean", numericExpectation: { value: 4, command: "mean" } },
    ];
    const claims = declaredNumericClaims(steps);
    expect(claims.map((claim) => claim.stepId)).toEqual(["compute"]);
    expect(numericClaimsFromSteps(steps)).toHaveLength(1);
    // A step that claimed nothing is not an unchecked finding.
    expect(numericClaimsFromSteps(steps)[0]?.producedBy).toBe("plan declaration");
  });

  it("works for planned steps keyed by name and executed steps keyed by id", () => {
    expect(declaredNumericClaims([{ name: "a", numericExpectation: { value: 1, command: "c" } }])[0]?.stepId).toBe("a");
    expect(declaredNumericClaims([{ id: "b", numericExpectation: { value: 1, command: "c" } }])[0]?.stepId).toBe("b");
    // A step with neither is not usable as a claim key, and is skipped.
    expect(declaredNumericClaims([{ numericExpectation: { value: 1, command: "c" } }])).toEqual([]);
  });

  it("routes each step's command through the runner", async () => {
    const steps: StepWithExpectation[] = [
      { name: "a", description: "a", numericExpectation: { value: 4, command: "cmd-a" } },
    ];
    const ran: string[] = [];
    const checks = numericChecksFromSteps(steps, async (command) => {
      ran.push(command);
      return 4;
    });
    expect(await checks[0]!.recompute()).toBe(4);
    expect(ran).toEqual(["cmd-a"]);
  });
});

describe("verifying a plan's numbers", () => {
  it("verifies a declaration the command reproduces", async () => {
    const steps: StepWithExpectation[] = [
      { name: "compute", description: "the mean is 4", numericExpectation: { value: 4, command: "mean" } },
    ];
    const verification = await verifyPlanNumbers(steps, async () => (2 + 4 + 6) / 3);
    expect(verification.verdict).toBe("pass");
    expect(verification.results[0]?.outcome).toBe("verified");
  });

  it("reports a mismatch when the command disagrees with the plan", async () => {
    // The plan's word does not decide.
    const steps: StepWithExpectation[] = [
      { name: "compute", description: "the mean is 9", numericExpectation: { value: 9, command: "mean" } },
    ];
    const verification = await verifyPlanNumbers(steps, async () => 4);
    expect(verification.verdict).toBe("fail");
    expect(verification.results[0]?.evidence).toContain("claimed 9, recomputed 4");
  });

  it("is uncertain, not a pass, when the plan declared nothing", async () => {
    const verification = await verifyPlanNumbers([{ name: "fetch", description: "fetch the logs" }], async () => 1);
    expect(verification.verdict).toBe("uncertain");
    expect(verification.summary).toContain("nothing was claimed");
  });

  it("honours a declared tolerance", async () => {
    const steps: StepWithExpectation[] = [
      { name: "sum", description: "the sum", numericExpectation: { value: 0.3, command: "sum", tolerance: { absolute: 1e-9 } } },
    ];
    const verification = await verifyPlanNumbers(steps, async () => 0.1 + 0.2);
    expect(verification.results[0]?.outcome).toBe("verified");
  });
});
