/**
 * P2 — per-stage model routing.
 *
 * The goal is that Aurora does not depend on one model being good at everything.
 * Understanding, planning, execution, verification, criticism and vision are
 * different jobs with different failure modes, and a model that is excellent at
 * one can be poor at another:
 *
 *   UNDERSTAND → model A     PLAN → model B     CODING → model C
 *   VISION     → model D     VERIFY → model E   CRITIC → model F
 *
 * What existed before this was per-service injection — `UnderstandingModel` and
 * `PlanningModel` interfaces, each service taking whatever model it was handed.
 * That lets a caller wire two stages to two models, but there was no single
 * place that *decided* it, so nothing could answer "which model ran the
 * verification step, and why that one?". Selection and policy were the same
 * thing, tangled in each call site.
 *
 * This separates them. A policy is data; resolving it is a pure function; the
 * engine still does the selecting.
 *
 * Two rules carry the honesty:
 *
 *   - A route must be a canonical `provider:model` (P1.3). A policy naming
 *     `"bonsai"` alone would look configured and then send work to a model that
 *     does not exist, which is worse than no policy at all.
 *   - A stage with no entry falls back to the default, and with no default
 *     resolves to `none`. The caller then keeps the route it already had. An
 *     absent preference is not a licence to invent one.
 */
import { isModelRoute, parseModelRoute } from "./model-route.js";

/** The stages that may be routed to their own model. */
export const MODEL_STAGES = [
  "understanding",
  "planning",
  "execution",
  "verification",
  "critic",
  "vision",
] as const;

export type ModelStage = (typeof MODEL_STAGES)[number];

export interface StageRoute {
  /** Canonical `provider:model`. */
  readonly route: string;
  /** Routes to try if the preferred one is unavailable, in order. */
  readonly fallbackRoutes?: readonly string[];
  /** Why this stage got this model — recorded so the choice is explainable. */
  readonly reason?: string;
}

export interface StageModelPolicy {
  readonly stages: Readonly<Partial<Record<ModelStage, StageRoute>>>;
  /** Used for any stage the policy does not name. */
  readonly defaultRoute?: string;
}

export type StageRouteResolution =
  | { readonly route: string; readonly source: "stage" | "default"; readonly fallbackRoutes: readonly string[]; readonly reason: string }
  | { readonly route: undefined; readonly source: "none"; readonly fallbackRoutes: readonly string[]; readonly reason: string };

export function isModelStage(value: string): value is ModelStage {
  return (MODEL_STAGES as readonly string[]).includes(value);
}

/**
 * Validates a policy, returning the list of problems rather than throwing.
 *
 * A policy is usually loaded from configuration, so the useful answer is "these
 * three entries are wrong", not a stack trace on the first one.
 */
export function validateStageModelPolicy(policy: StageModelPolicy): string[] {
  const problems: string[] = [];
  for (const [stage, entry] of Object.entries(policy.stages)) {
    if (!isModelStage(stage)) {
      problems.push(`unknown stage "${stage}"; expected one of: ${MODEL_STAGES.join(", ")}`);
      continue;
    }
    if (entry === undefined) continue;
    if (!isModelRoute(entry.route)) {
      problems.push(`stage "${stage}": "${entry.route}" is not a canonical provider:model route`);
    }
    for (const fallback of entry.fallbackRoutes ?? []) {
      if (!isModelRoute(fallback)) {
        problems.push(`stage "${stage}": fallback "${fallback}" is not a canonical provider:model route`);
      }
    }
  }
  if (policy.defaultRoute !== undefined && !isModelRoute(policy.defaultRoute)) {
    problems.push(`defaultRoute "${policy.defaultRoute}" is not a canonical provider:model route`);
  }
  return problems;
}

/**
 * Resolves which route a stage should use.
 *
 * Never throws and never invents: an unconfigured stage with no default yields
 * `source: "none"` and the caller keeps the route it already had.
 */
export function resolveStageRoute(policy: StageModelPolicy, stage: ModelStage): StageRouteResolution {
  const entry = policy.stages[stage];
  if (entry !== undefined && isModelRoute(entry.route)) {
    return {
      route: entry.route,
      source: "stage",
      fallbackRoutes: entry.fallbackRoutes ?? [],
      reason: entry.reason ?? `policy routes ${stage} to ${entry.route}`,
    };
  }
  if (policy.defaultRoute !== undefined && isModelRoute(policy.defaultRoute)) {
    return {
      route: policy.defaultRoute,
      source: "default",
      fallbackRoutes: [],
      reason: `no ${stage} entry; using the policy default ${policy.defaultRoute}`,
    };
  }
  return {
    route: undefined,
    source: "none",
    fallbackRoutes: [],
    reason: `no ${stage} entry and no default route; keeping the current route`,
  };
}

/**
 * The distinct models a policy actually names.
 *
 * Useful for the honest report: a policy that routes all six stages to the same
 * model is not per-stage routing, and this makes that visible instead of leaving
 * six identical entries to look like a configuration.
 */
export function distinctRoutes(policy: StageModelPolicy): string[] {
  const routes = new Set<string>();
  for (const entry of Object.values(policy.stages)) {
    if (entry !== undefined) routes.add(entry.route);
  }
  if (policy.defaultRoute !== undefined) routes.add(policy.defaultRoute);
  return [...routes].sort();
}

/** Provider of a route, for locality/privacy checks against the model router. */
export function providerOfRoute(route: string): string | undefined {
  return parseModelRoute(route)?.provider;
}

/**
 * Convenience for call sites: the route a policy names for a stage, or
 * `undefined` when it names none. An absent policy is a valid input — most
 * engines run without one, and that must not be an error.
 */
export function stageRouteOf(policy: StageModelPolicy | undefined, stage: ModelStage): string | undefined {
  return resolveStageRoute(policy ?? { stages: {} }, stage).route;
}

/**
 * The same, shaped for callers that take an options object. Returns `{}` rather
 * than `{ modelRoute: undefined }` so an absent preference stays absent instead
 * of becoming an explicit "no model" that a reader could mistake for a decision.
 */
export function stageRouteOptions(
  policy: StageModelPolicy | undefined,
  stage: ModelStage,
): { modelRoute?: string | undefined } {
  const route = stageRouteOf(policy, stage);
  return route === undefined ? {} : { modelRoute: route };
}
