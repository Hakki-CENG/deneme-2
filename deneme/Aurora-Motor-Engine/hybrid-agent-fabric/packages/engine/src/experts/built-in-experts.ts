/**
 * FAZ 6 3/4 — making the built-in experts reachable.
 *
 * FAZ 6 1/4 defined `codingExpert()` and 2/4 made the code-work rule fire, but
 * nothing ever constructed the expert: a deployment had to hand-write a
 * definition to get one. That is the same defect as a field nothing populates,
 * only one level up.
 *
 * This is the one-line path. It does **not** auto-register anything into the
 * engine — an engine that silently gained experts would be an engine whose
 * behaviour depended on a list nobody chose. It builds a registry a caller can
 * hand to `EngineConfig.experts`, and says plainly which built-ins that host
 * cannot actually support.
 *
 * A note on what was *not* added. FAZ 6's list names a profiler, a debugger and
 * code review as a capability. None of those exists in `src/capabilities/`, and
 * adding them as declarations would be inert breadth — a capability id that
 * runs nothing is worse than an admitted gap, because the id reads like
 * coverage. They are recorded as gaps instead.
 */

import { ExpertRegistry, type CapabilitySource } from "./expert-registry.js";
import { codingExpert } from "./coding-expert.js";
import type { ExpertDefinition, ExpertToolRecord } from "./expert-definition.js";

/** Factories for the experts the engine ships with. Add one here, not at call sites. */
export const BUILT_IN_EXPERT_FACTORIES: readonly (() => ExpertDefinition)[] = [codingExpert];

export interface BuiltInExpertStanding {
  readonly expertId: string;
  /** Empty means this host can run the expert as declared. */
  readonly problems: readonly string[];
}

export interface BuiltInExpertRegistry {
  readonly registry: ExpertRegistry;
  /**
   * Every built-in, with what is wrong with it on this host.
   *
   * Reported rather than filtered out: an expert the host cannot support is a
   * gap a caller needs to see, not something to hide by quietly not
   * registering it.
   */
  readonly standing: readonly BuiltInExpertStanding[];
  /** The ids that validate clean against this host's capabilities. */
  readonly usable: readonly string[];
}

/**
 * Builds a registry of the engine's built-in experts against a host's real
 * capability inventory.
 *
 * Every factory is registered even when it does not validate, so `standing` can
 * explain why. `ExpertRegistry.usable()` still refuses to hand out a broken
 * one — registering it is what makes the gap reportable.
 */
export function builtInExpertRegistry(source: CapabilitySource): BuiltInExpertRegistry {
  const registry = new ExpertRegistry(source);
  const standing: BuiltInExpertStanding[] = [];

  for (const factory of BUILT_IN_EXPERT_FACTORIES) {
    const expert = factory();
    registry.register(expert);
    standing.push({ expertId: expert.id, problems: registry.problemsFor(expert.id) });
  }

  return {
    registry,
    standing,
    usable: standing.filter((entry) => entry.problems.length === 0).map((entry) => entry.expertId),
  };
}

/**
 * Which capabilities the built-in experts need that this host does not register.
 *
 * The shortest answer to "why is my coding expert not working". Returns ids,
 * deduplicated, in the order the experts declare them.
 */
export function missingCapabilitiesForBuiltIns(source: CapabilitySource): string[] {
  const known = new Set<string>(source.list().map((descriptor) => descriptor.id));
  const missing: string[] = [];
  for (const factory of BUILT_IN_EXPERT_FACTORIES) {
    for (const tool of factory().tools) {
      if (!known.has(tool) && !missing.includes(tool)) missing.push(tool);
    }
  }
  return missing;
}

/**
 * The built-in experts as plain records, for hosts that need to inspect or
 * serialise them without constructing a registry.
 */
export function builtInExperts(): ExpertDefinition[] {
  return BUILT_IN_EXPERT_FACTORIES.map((factory) => factory());
}

/** Convenience for callers that only want the tool records, e.g. to validate by hand. */
export function builtInExpertToolRecords(): ExpertToolRecord[] {
  const records: ExpertToolRecord[] = [];
  for (const expert of builtInExperts()) {
    for (const id of expert.tools) records.push({ id });
  }
  return records;
}
