/**
 * P4 — Expert Fabric: the registry that holds expert definitions.
 *
 * A definition nothing consults is decoration, so this registry answers the two
 * questions the rest of the engine actually asks, and delegates both to code
 * that already existed rather than deciding them again:
 *
 *   "which model does this expert use for this stage?"  -> P2 resolveStageRoute
 *   "what strategies may this expert plan with?"         -> P3 selection criteria
 *
 * Validation is not a one-off gate at registration. Capabilities arrive after
 * startup — the broker registers MCP and plugin tools at runtime — so an expert
 * that was fine at boot can become wrong later, and one that looked wrong can
 * become fine. Every read therefore re-checks against the inventory as it is
 * now, and `problemsFor` says why. Registration still reports problems
 * immediately, because the caller who just added a broken expert deserves to
 * hear it then.
 */

import type { CapabilityDescriptor } from "../types.js";
import { resolveStageRoute, type ModelStage, type StageRouteResolution } from "../models/stage-model-policy.js";
import type { StrategySelectionCriteria } from "../aurora/strategy-generator.js";
import {
  plannerConstraintsFor,
  strategiesFor,
  strategyCriteriaForExpert,
  toolsOverRiskCeiling,
  validateExpertDefinition,
  type ExpertDefinition,
  type ExpertToolRecord,
} from "./expert-definition.js";
import type { PlanConstraints } from "../aurora/task-planner.js";
import type { TaskStrategy } from "../aurora/strategy-generator.js";

/**
 * The capabilities currently registered, with their declared risks.
 *
 * Structural, matching how `role-authority-service.ts` already accepts a
 * capability source: the broker satisfies it, and so does a test double.
 */
export interface CapabilitySource {
  list(): readonly CapabilityDescriptor[];
}

export interface ExpertRegistration {
  readonly expert: ExpertDefinition;
  /** Problems as of the moment of registration. See the module comment. */
  readonly problems: readonly string[];
  readonly usable: boolean;
  /** True when this replaced an earlier definition under the same id. */
  readonly replaced: boolean;
}

export class ExpertRegistry {
  readonly #source: CapabilitySource;
  readonly #experts = new Map<string, ExpertDefinition>();

  /**
   * The inventory is required, not defaulted to empty. A registry built without
   * one would report every expert's tools as unknown — which is the honest
   * answer, but it is an answer about the registry's blindness, not about the
   * expert, and it should not be reachable by accident.
   */
  constructor(source: CapabilitySource) {
    this.#source = source;
  }

  #tools(): ExpertToolRecord[] {
    return this.#source.list().map((descriptor) => ({ id: descriptor.id, risk: descriptor.risk }));
  }

  register(expert: ExpertDefinition): ExpertRegistration {
    const replaced = this.#experts.has(expert.id);
    this.#experts.set(expert.id, expert);
    const problems = this.problemsFor(expert.id);
    return { expert, problems, usable: problems.length === 0, replaced };
  }

  /** The definition as declared, usable or not. */
  get(id: string): ExpertDefinition | undefined {
    return this.#experts.get(id);
  }

  /**
   * The definition only if it holds up right now.
   *
   * Returns `undefined` for an expert that is broken, not a broken expert. A
   * caller that cannot tell the two apart would route a task to an expert
   * holding tools it is not allowed to use.
   */
  usable(id: string): ExpertDefinition | undefined {
    const expert = this.#experts.get(id);
    if (expert === undefined) return undefined;
    return this.problemsFor(id).length === 0 ? expert : undefined;
  }

  /**
   * Everything currently wrong with an expert: malformed definition, unknown or
   * duplicated tools, and tools reaching past its own risk ceiling.
   *
   * Empty for an id that was never registered — there is nothing to be wrong
   * with. Ask `get` if the distinction matters.
   */
  problemsFor(id: string): string[] {
    const expert = this.#experts.get(id);
    if (expert === undefined) return [];
    const tools = this.#tools();
    const problems = validateExpertDefinition(expert, tools);
    for (const toolId of toolsOverRiskCeiling(expert, tools)) {
      problems.push(
        `expert "${expert.id}": tool "${toolId}" is above its risk ceiling of ${expert.safety.maxCapabilityRisk}`,
      );
    }
    return problems;
  }

  /** Every registered expert, with its current standing. */
  list(): ExpertRegistration[] {
    return [...this.#experts.values()].map((expert) => {
      const problems = this.problemsFor(expert.id);
      return { expert, problems, usable: problems.length === 0, replaced: false };
    });
  }

  /**
   * The route this expert's own model policy gives for a stage.
   *
   * Delegates to P2's `resolveStageRoute`, so the expert layer cannot drift from
   * how the rest of the engine resolves routes. An unknown or unusable expert
   * resolves to `source: "none"` and the caller keeps the route it already had —
   * never an invented one.
   */
  resolveRoute(id: string, stage: ModelStage): StageRouteResolution {
    const expert = this.usable(id);
    if (expert === undefined) {
      const known = this.#experts.has(id);
      return {
        route: undefined,
        source: "none",
        fallbackRoutes: [],
        reason: known
          ? `expert "${id}" is registered but unusable: ${this.problemsFor(id).join("; ")}`
          : `no expert "${id}" is registered`,
      };
    }
    if (expert.modelPolicy === undefined) {
      return {
        route: undefined,
        source: "none",
        fallbackRoutes: [],
        reason: `expert "${id}" declares no model policy`,
      };
    }
    return resolveStageRoute(expert.modelPolicy, stage);
  }

  /**
   * The strategy constraints this expert plans under, ready for the P3
   * selector. `undefined` for an expert that is not usable — a broken expert
   * should not get to loosen anyone's strategy limits.
   */
  strategyCriteria(id: string): StrategySelectionCriteria | undefined {
    const expert = this.usable(id);
    return expert === undefined ? undefined : strategyCriteriaForExpert(expert);
  }

  /**
   * The planning budgets for this expert, ready for `TaskPlannerDeps.constraints`.
   *
   * Clamped to the engine defaults — see `plannerConstraintsFor`. An expert may
   * plan more tightly than the engine allows, never more loosely.
   * `undefined` for an unusable expert: it gets no planning configuration at all
   * rather than a permissive one.
   */
  plannerConstraints(id: string): PlanConstraints | undefined {
    const expert = this.usable(id);
    return expert === undefined ? undefined : plannerConstraintsFor(expert).constraints;
  }

  /**
   * The strategies this expert may plan with, after its own allow-list.
   * Empty for an unusable expert.
   */
  strategies(id: string): TaskStrategy[] {
    const expert = this.usable(id);
    return expert === undefined ? [] : strategiesFor(expert);
  }

  /**
   * Memory namespaces claimed by more than one expert.
   *
   * The memory store does not partition by namespace yet — nothing in
   * `packages/engine/src/memory/` has the concept — so this is the part of the
   * contract that *can* be enforced today: two experts sharing a namespace
   * would read and write each other's recall, which is the failure the field
   * exists to prevent. Enforcing the partition itself belongs with memory
   * partitioning, not here.
   */
  memoryNamespaceCollisions(): { namespace: string; experts: string[] }[] {
    const byNamespace = new Map<string, string[]>();
    for (const expert of this.#experts.values()) {
      const claimed = byNamespace.get(expert.memoryNamespace);
      if (claimed === undefined) byNamespace.set(expert.memoryNamespace, [expert.id]);
      else claimed.push(expert.id);
    }
    return [...byNamespace.entries()]
      .filter(([, experts]) => experts.length > 1)
      .map(([namespace, experts]) => ({ namespace, experts }));
  }
}
