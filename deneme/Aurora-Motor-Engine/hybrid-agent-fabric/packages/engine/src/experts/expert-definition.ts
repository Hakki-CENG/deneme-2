/**
 * P4 — Expert Fabric: what an expert *is*.
 *
 * The plan's requirement is that an expert is not a prompt. So every facet here
 * binds to something that already exists in the engine and can be checked,
 * rather than to a free-text field that only reads like a capability:
 *
 *   tools         capability ids, checked against a real inventory
 *   modelPolicy   StageModelPolicy, checked by the existing P2 validator
 *   strategies    TaskStrategy from P3, fed to the existing P3 selector
 *   safety        a ceiling on the closed CapabilityRisk ladder
 *   evaluator     the domains this expert is scored on
 *
 * Two facets stay strings and are marked as such below: `domain` and
 * `knowledge`. The eval harness types domains as `string[]` with no closed
 * enum, so inventing one here would create a second, disagreeing list. When
 * eval grows a real domain registry these should bind to it.
 */

import type { CapabilityRisk } from "../types.js";
import { RISK_ORDER } from "../aurora/role-authority-service.js";
import {
  validateStageModelPolicy,
  type StageModelPolicy,
} from "../models/stage-model-policy.js";
import type { StrategySelectionCriteria, TaskStrategy } from "../aurora/strategy-generator.js";
import {
  DEFAULT_PLAN_CONSTRAINTS,
  type PlanConstraints,
} from "../aurora/task-planner.js";

/** The risk ceiling an expert operates under. */
export interface ExpertSafetyPolicy {
  /**
   * Highest `CapabilityRisk` this expert may use. Tools above it are refused,
   * not merely discouraged — see `toolsOverRiskCeiling`.
   */
  readonly maxCapabilityRisk: CapabilityRisk;
  /**
   * Capabilities at exactly the ceiling still need approval. Defaults to false.
   * Set it for an expert whose ceiling is one it should not sit on routinely.
   */
  readonly requireApprovalAtCeiling?: boolean | undefined;
}

/**
 * How this expert plans.
 *
 * Deliberately only what has a real consumer. `constraints` plugs straight into
 * `TaskPlannerDeps.constraints`, which `TaskPlanner` already merges over
 * `DEFAULT_PLAN_CONSTRAINTS`. A prompt-addition facet is NOT here: the planner's
 * system prompt is module-private, so such a field would have nowhere to go and
 * would only read like an influence it does not have.
 */
export interface ExpertPlanner {
  /** Merged over the engine defaults. Tightening is allowed; see `plannerConstraintsFor`. */
  readonly constraints?: Partial<PlanConstraints> | undefined;
  /**
   * Ids from `strategies` this expert may actually plan with. Omit to allow all
   * of them. Naming one that is not declared is a problem, not a no-op.
   */
  readonly allowedStrategies?: readonly string[] | undefined;
}

export interface ExpertDefinition {
  readonly id: string;
  /**
   * Free string by necessity: `packages/eval` types task domains as `string[]`
   * with no closed enum. Deliberately not validated against a list invented
   * here — see the module comment.
   */
  readonly domain: string;
  /** Retrieval namespaces or knowledge refs. Free string, same reason as `domain`. */
  readonly knowledge?: readonly string[] | undefined;
  /** Named skills. Descriptive; nothing in the engine enumerates skills yet. */
  readonly skills?: readonly string[] | undefined;
  /**
   * The capability requirements this expert serves, e.g. `"code_change"`.
   *
   * This is what FAZ 5's router matches against, so task-to-expert selection is
   * data declared here rather than a mapping hardcoded in the router. Adding an
   * expert must not require editing routing code.
   */
  readonly servesCapabilities?: readonly string[] | undefined;
  /** Capability ids this expert may call, e.g. `agent.spawn`. */
  readonly tools: readonly string[];
  /** Approaches this expert prefers. Fed to the P3 strategy selector. */
  readonly strategies?: readonly TaskStrategy[] | undefined;
  readonly modelPolicy?: StageModelPolicy | undefined;
  readonly planner?: ExpertPlanner | undefined;
  /**
   * The eval categories this expert is scored on.
   *
   * Typed as strings here because `packages/eval` depends on this package, not
   * the reverse — importing `EvalCategory` would be a cycle. The closed list is
   * enforced on the side that owns it, by
   * `packages/eval/src/experts/expert-eval-binding.ts`.
   */
  readonly evaluatorCategories?: readonly string[] | undefined;
  readonly safety: ExpertSafetyPolicy;
  /** Memory is partitioned per expert so one domain's recall cannot leak into another's. */
  readonly memoryNamespace: string;
  readonly benchmarkSuite?: string | undefined;
}

/** The numeric budget fields an expert may tighten. */
export const PLAN_CONSTRAINT_KEYS = ["maxSteps", "maxTotalMs", "maxStepMs", "modelTimeoutMs"] as const;

/** A capability as far as expert validation is concerned. */
export interface ExpertToolRecord {
  readonly id: string;
  readonly risk?: CapabilityRisk | undefined;
}

/**
 * Validates an expert against the world it claims to live in.
 *
 * Returns problems rather than throwing, for the same reason
 * `validatePlanHierarchy` and `validateStageModelPolicy` do: a malformed
 * definition is a configuration bug and must not take a run down. It is
 * surfaced, and the caller decides.
 *
 * `knownTools` defaults to empty, which means every declared tool is reported
 * unknown. That is intentional — validating an expert without an inventory
 * would report "all clear" about tools nothing was checked against.
 */
export function validateExpertDefinition(
  expert: ExpertDefinition,
  knownTools: readonly ExpertToolRecord[] = [],
): string[] {
  const problems: string[] = [];

  if (expert.id.trim() === "") problems.push("expert id is empty");
  if (expert.domain.trim() === "") problems.push(`expert "${expert.id}": domain is empty`);
  if (expert.memoryNamespace.trim() === "") {
    problems.push(`expert "${expert.id}": memoryNamespace is empty`);
  }
  if (/\s/.test(expert.memoryNamespace)) {
    problems.push(`expert "${expert.id}": memoryNamespace "${expert.memoryNamespace}" contains whitespace`);
  }

  if (expert.tools.length === 0) {
    // An expert with no tools is just a prompt, which is exactly what this
    // layer exists to prevent. Reported, not silently accepted.
    problems.push(`expert "${expert.id}": declares no tools`);
  }

  const known = new Map(knownTools.map((tool) => [tool.id, tool]));
  const seen = new Set<string>();
  for (const toolId of expert.tools) {
    if (seen.has(toolId)) {
      problems.push(`expert "${expert.id}": tool "${toolId}" is declared twice`);
    }
    seen.add(toolId);
    if (!known.has(toolId)) {
      problems.push(`expert "${expert.id}": tool "${toolId}" is not a registered capability`);
    }
  }

  const served = new Set<string>();
  for (const capability of expert.servesCapabilities ?? []) {
    if (capability.trim() === "") {
      problems.push(`expert "${expert.id}": servesCapabilities entry is empty`);
    }
    if (served.has(capability)) {
      problems.push(`expert "${expert.id}": servesCapabilities names "${capability}" twice`);
    }
    served.add(capability);
  }

  if (!RISK_ORDER.includes(expert.safety.maxCapabilityRisk)) {
    problems.push(
      `expert "${expert.id}": maxCapabilityRisk "${String(expert.safety.maxCapabilityRisk)}" is not on the risk ladder (${RISK_ORDER.join(" < ")})`,
    );
  }

  if (expert.modelPolicy !== undefined) {
    for (const problem of validateStageModelPolicy(expert.modelPolicy)) {
      problems.push(`expert "${expert.id}": model policy ${problem}`);
    }
  }

  const strategyIds = new Set<string>();
  for (const strategy of expert.strategies ?? []) {
    if (strategyIds.has(strategy.id)) {
      problems.push(`expert "${expert.id}": strategy "${strategy.id}" is declared twice`);
    }
    strategyIds.add(strategy.id);
  }

  const constraints = expert.planner?.constraints;
  if (constraints !== undefined) {
    for (const key of PLAN_CONSTRAINT_KEYS) {
      const value = constraints[key];
      // Zero or negative is not a tightening, it is a plan that cannot exist.
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        problems.push(
          `expert "${expert.id}": planner constraint ${key} must be a positive number, got ${String(value)}`,
        );
      }
    }
  }

  const declared = new Set((expert.strategies ?? []).map((strategy) => strategy.id));
  for (const allowed of expert.planner?.allowedStrategies ?? []) {
    if (!declared.has(allowed)) {
      problems.push(
        `expert "${expert.id}": allowedStrategies names "${allowed}", which is not a declared strategy`,
      );
    }
  }

  for (const category of expert.evaluatorCategories ?? []) {
    if (category.trim() === "") problems.push(`expert "${expert.id}": evaluatorCategories entry is empty`);
  }

  return problems;
}

/**
 * The tools this expert declares that sit above its own risk ceiling.
 *
 * Kept separate from `validateExpertDefinition` because the two answer
 * different questions: that one asks whether the definition is well formed,
 * this one asks whether it is *safe*. A well-formed expert can still be
 * configured to reach past its ceiling.
 */
export function toolsOverRiskCeiling(
  expert: ExpertDefinition,
  knownTools: readonly ExpertToolRecord[],
): string[] {
  const ceiling = RISK_ORDER.indexOf(expert.safety.maxCapabilityRisk);
  if (ceiling < 0) return []; // not on the ladder; validateExpertDefinition reports that
  const over: string[] = [];
  for (const toolId of expert.tools) {
    const risk = knownTools.find((tool) => tool.id === toolId)?.risk;
    // An unknown risk is treated as over the ceiling. Guessing "safe" here is
    // how an expert ends up holding a privileged tool it was never granted.
    if (risk === undefined) {
      over.push(toolId);
      continue;
    }
    if (RISK_ORDER.indexOf(risk) > ceiling) over.push(toolId);
  }
  return over;
}

/**
 * Turns an expert's safety ceiling into criteria the P3 strategy selector
 * already understands, so the definition constrains real planning instead of
 * only describing it.
 *
 * The mapping is a judgement and is stated rather than hidden: the first three
 * rungs touch nothing outside the workspace, so they are `low`; `process` and
 * `network` can escape it, so `medium`; `external_side_effect` and `privileged`
 * change things the engine cannot undo, so `high`.
 */
export function strategyCriteriaForExpert(expert: ExpertDefinition): StrategySelectionCriteria {
  const index = RISK_ORDER.indexOf(expert.safety.maxCapabilityRisk);
  const maxRisk: "low" | "medium" | "high" =
    index < 0 ? "low" : index <= 2 ? "low" : index <= 4 ? "medium" : "high";
  return { maxRisk };
}

/**
 * The planning budgets this expert operates under.
 *
 * An expert may tighten the engine's defaults but not loosen them: the defaults
 * are what keeps a runaway decomposition from becoming a plan, and a domain
 * definition is not a reason to lift that. A value above the default is clamped
 * and reported in `loosened`, so the attempt stays visible instead of being
 * silently absorbed.
 */
export function plannerConstraintsFor(expert: ExpertDefinition): {
  constraints: PlanConstraints;
  loosened: readonly string[];
} {
  const requested = expert.planner?.constraints ?? {};
  const loosened: string[] = [];
  const constraints = { ...DEFAULT_PLAN_CONSTRAINTS };
  for (const key of PLAN_CONSTRAINT_KEYS) {
    const value = requested[key];
    if (value === undefined) continue;
    const limit = DEFAULT_PLAN_CONSTRAINTS[key];
    if (value > limit) {
      loosened.push(`${key} ${value} exceeds the engine default of ${limit}; clamped`);
      continue;
    }
    constraints[key] = value;
  }
  return { constraints, loosened };
}

/**
 * The strategies this expert may plan with, after its own allow-list.
 *
 * An allow-list naming an undeclared strategy is reported by
 * `validateExpertDefinition` rather than filtered away here, because dropping it
 * silently would hide a definition that does not say what it means.
 */
export function strategiesFor(expert: ExpertDefinition): TaskStrategy[] {
  const declared = expert.strategies ?? [];
  const allowed = expert.planner?.allowedStrategies;
  if (allowed === undefined) return [...declared];
  const keep = new Set(allowed);
  return declared.filter((strategy) => keep.has(strategy.id));
}
