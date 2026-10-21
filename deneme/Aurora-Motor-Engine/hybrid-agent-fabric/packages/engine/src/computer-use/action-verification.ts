/**
 * FAZ 10 1/3 — an automation action is verified by looking, not by having been sent.
 *
 * Measured first. `computer-use/computer-use-service.ts` (367 lines) already has
 * screenshots, visual grounding, form fill, task lifecycle and rollback. What it
 * does not have is verification: the words mouse, keyboard, clipboard, window,
 * accessibility and "verif" appear **zero** times in it. A step's status becomes
 * `completed` when the action was issued, and nothing looks afterwards to see
 * whether anything happened.
 *
 * That is the same defect FAZ 6 closed for code and FAZ 9 for numbers, in a third
 * place: a system that treats "I did the thing" as "the thing worked". This is
 * the check that closes it here.
 *
 * The environment this runs in has no display — `DISPLAY` and `WAYLAND_DISPLAY`
 * are both unset, and there is no xdotool, wmctrl, clipboard tool or
 * accessibility bus — so no real automation can be performed or observed here.
 * What this provides is the rule and the mechanism; it takes an observation
 * function rather than inventing one, which is also what makes it testable.
 *
 * Five rules:
 *
 *   1. A completed step with no expectation is `not-checked`, never verified.
 *      `completed` records that the action was issued; it is not evidence about
 *      the world.
 *   2. A check that throws is `could-not-observe`, not a failure. Not being able
 *      to look is not the same as looking and finding it wrong.
 *   3. A step that did not complete is never verified, even when its check
 *      passes. A passing check on an action that did not run is a contradiction,
 *      and it is reported as one rather than scored as a win.
 *   4. Success is never inferred from the absence of an error.
 *   5. A task is verified only when every step is. One unchecked step makes the
 *      task unverified, which is the rule the research audit already follows.
 */

import { empiricalVerifier, type Verifier, type VerifierScope } from "../execution/verification-factory.js";
import type { AutomationStep, AutomationTask } from "./computer-use-service.js";

export type ActionVerificationOutcome = "verified" | "failed" | "not-checked" | "could-not-observe";

/**
 * What must hold afterwards.
 *
 * The check returns `true` or a reason it did not hold — a reason, not a
 * boolean, because "the dialog is still open" is what makes a failed
 * verification actionable.
 */
export interface ActionExpectation {
  readonly description: string;
  readonly check: () => Promise<true | string>;
}

export interface StepVerification {
  readonly stepId: string;
  readonly stepType: AutomationStep["type"];
  readonly stepStatus: AutomationStep["status"];
  readonly outcome: ActionVerificationOutcome;
  /** What was found. Absent when nothing was checked. */
  readonly detail?: string;
}

export interface TaskVerification {
  readonly taskId: string;
  readonly steps: readonly StepVerification[];
  readonly verified: number;
  readonly failed: number;
  readonly notChecked: number;
  readonly couldNotObserve: number;
  /** `verified` only when every step was checked and every check held. */
  readonly verdict: "verified" | "unverified";
  readonly summary: string;
}

/**
 * Verifies one automation step against an expectation.
 *
 * Takes the expectation as an argument rather than deriving one, because what
 * "worked" means depends on the action and guessing it would be a claim about
 * intent.
 */
export async function verifyAutomationStep(
  step: AutomationStep,
  expectation: ActionExpectation | undefined,
): Promise<StepVerification> {
  const base = { stepId: step.id, stepType: step.type, stepStatus: step.status };

  if (expectation === undefined) {
    // Rule 1: issued is not evidence about the world.
    return {
      ...base,
      outcome: "not-checked",
      detail: `no expectation was supplied for this ${step.type} step, so nothing was observed afterwards`,
    };
  }

  // Rule 3: an action that did not run cannot have been verified by its effects.
  if (step.status !== "completed") {
    return {
      ...base,
      outcome: "could-not-observe",
      detail: `the step ended "${step.status}", so there is no completed action to observe${step.error === undefined ? "" : `: ${step.error}`}`,
    };
  }

  let result: true | string;
  try {
    result = await expectation.check();
  } catch (error) {
    // Rule 2: could not look is not the same as looked and found it wrong.
    return {
      ...base,
      outcome: "could-not-observe",
      detail: `the check could not run: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (result === true) {
    return { ...base, outcome: "verified", detail: expectation.description };
  }
  return { ...base, outcome: "failed", detail: result };
}

/**
 * Verifies every step of an automation task.
 *
 * Steps with no expectation are reported as `not-checked` rather than omitted,
 * so a task that was never looked at cannot read as a task that passed.
 */
export async function verifyAutomationTask(
  task: AutomationTask,
  expectations: Readonly<Record<string, ActionExpectation>>,
): Promise<TaskVerification> {
  const steps: StepVerification[] = [];
  for (const step of task.steps) {
    steps.push(await verifyAutomationStep(step, expectations[step.id]));
  }

  const verified = steps.filter((s) => s.outcome === "verified").length;
  const failed = steps.filter((s) => s.outcome === "failed").length;
  const notChecked = steps.filter((s) => s.outcome === "not-checked").length;
  const couldNotObserve = steps.filter((s) => s.outcome === "could-not-observe").length;

  // Rule 5: one unchecked step un-verifies the task.
  const verdict = verified === steps.length && steps.length > 0 ? "verified" : "unverified";

  const parts = [`${verified}/${steps.length} steps verified`];
  if (failed > 0) parts.push(`${failed} observed to have failed`);
  if (notChecked > 0) parts.push(`${notChecked} had no expectation, so nothing was observed`);
  if (couldNotObserve > 0) parts.push(`${couldNotObserve} could not be observed`);
  if (steps.length === 0) parts.push("the task has no steps, so nothing was verified");

  return { taskId: task.id, steps, verified, failed, notChecked, couldNotObserve, verdict, summary: parts.join("; ") };
}

/**
 * Wraps task verification as a `V2_empirical` verifier.
 *
 * V2 is external evidence to FAZ 6's `acceptCodeWork`: an observation of the
 * world counts, an agreement between models does not. An automation run whose
 * steps were never observed therefore cannot be carried by consensus either.
 */
export function automationVerifier(
  name: string,
  task: AutomationTask,
  expectations: Readonly<Record<string, ActionExpectation>>,
  scope: VerifierScope = "goal",
): Verifier {
  return empiricalVerifier(
    name,
    async () => {
      const verification = await verifyAutomationTask(task, expectations);
      return {
        passed: verification.verified,
        failed: verification.failed + verification.couldNotObserve,
        output: `${verification.summary}. ${verification.steps
          .filter((step) => step.outcome !== "verified")
          .map((step) => `${step.stepId}: ${step.detail ?? step.outcome}`)
          .join(" | ")
          .slice(0, 1200)}`,
      };
    },
    scope,
  );
}

/**
 * Can this environment be observed at all?
 *
 * A real filesystem/environment check rather than a comment. In a sandbox with
 * no display every automation step is `could-not-observe`, and saying so is more
 * useful than reporting a task as verified on the strength of actions nobody
 * could watch.
 */
export function displayAvailable(env: NodeJS.ProcessEnv = process.env): { available: boolean; reason: string } {
  if (env["DISPLAY"] !== undefined && env["DISPLAY"].length > 0) {
    return { available: true, reason: `DISPLAY=${env["DISPLAY"]}` };
  }
  if (env["WAYLAND_DISPLAY"] !== undefined && env["WAYLAND_DISPLAY"].length > 0) {
    return { available: true, reason: `WAYLAND_DISPLAY=${env["WAYLAND_DISPLAY"]}` };
  }
  return {
    available: false,
    reason: "neither DISPLAY nor WAYLAND_DISPLAY is set, so there is no screen to observe",
  };
}
