/**
 * P4 — Expert Fabric: checking an expert's evaluation claims.
 *
 * This lives in `packages/eval` rather than in the engine because the data it
 * checks against lives here. `@haf/eval` depends on `@haf/engine`, so the engine
 * importing `EvalCategory` would be a cycle, and copying the category list into
 * the engine would be a second list that could drift from this one. Checking on
 * the side that owns the data keeps one source of truth.
 *
 * An `ExpertDefinition` declares `evaluatorCategories` and `benchmarkSuite` as
 * strings. Left unchecked, those strings are only claims. These functions turn
 * them into something that can be wrong in a way somebody notices.
 */

import type { ExpertDefinition } from "@haf/engine";

import { EVAL_CATEGORIES, type EvalCategory, type EvalSuite } from "../tasks/types.js";

/** True when `value` is one of the real categories, narrowing it if so. */
export function isEvalCategory(value: string): value is EvalCategory {
  return (EVAL_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Whether an expert's evaluation claims hold up against real suites.
 *
 * Returns problems rather than throwing, matching `validateExpertDefinition` on
 * the engine side: a wrong claim is a configuration bug and should be reported
 * to whoever made it, not raised through a benchmark run.
 */
export function validateExpertEvalBinding(expert: ExpertDefinition, suites: readonly EvalSuite[]): string[] {
  const problems: string[] = [];

  for (const claimed of expert.evaluatorCategories ?? []) {
    if (!isEvalCategory(claimed)) {
      problems.push(
        `expert "${expert.id}": evaluatorCategories names "${claimed}", which is not an eval category (expected one of: ${EVAL_CATEGORIES.join(", ")})`,
      );
    }
  }

  const suiteIds = suites.map((suite) => suite.id);
  if (expert.benchmarkSuite !== undefined) {
    if (suiteIds.length === 0) {
      // Not "the suite does not exist" — nothing was supplied to check against.
      problems.push(
        `expert "${expert.id}": benchmarkSuite "${expert.benchmarkSuite}" cannot be checked, no suites were supplied`,
      );
    } else if (!suiteIds.includes(expert.benchmarkSuite)) {
      problems.push(
        `expert "${expert.id}": benchmarkSuite "${expert.benchmarkSuite}" is not a known suite (known: ${suiteIds.join(", ")})`,
      );
    }
  }

  return problems;
}

/**
 * The categories an expert claims to be scored on that no supplied suite
 * actually exercises.
 *
 * This is the failure the other checks cannot catch: every category can be
 * perfectly valid and the expert can still be unmeasured. An expert whose whole
 * domain has no tasks reports a clean binding and a benchmark score that says
 * nothing about it.
 */
export function unmeasuredCategories(expert: ExpertDefinition, suites: readonly EvalSuite[]): string[] {
  const exercised = new Set<string>();
  for (const suite of suites) {
    for (const task of suite.tasks) exercised.add(task.category);
  }
  return (expert.evaluatorCategories ?? []).filter(
    (claimed) => isEvalCategory(claimed) && !exercised.has(claimed),
  );
}
