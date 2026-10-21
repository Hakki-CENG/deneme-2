/**
 * FAZ 26 1/3 — a measured answer to whether engine.ts should be split.
 *
 * FAZ 26 says engine.ts is ~5.5K lines and asks for eight compositions
 * (EngineComposition, ExecutionComposition, MemoryComposition, ModelComposition,
 * SecurityComposition, ResearchComposition, CognitiveComposition,
 * IntegrationComposition) — and then says "**Şimdi sırf güzel dursun diye yapma.**"
 *
 * So the phase is not an instruction to split. It is an instruction to split only if
 * there is a real reason, and this measures whether there is one.
 *
 * The measurement, taken from the file itself:
 *
 *   total                          5584 lines
 *   imports and re-exports         ~689 lines   (249 import statements)
 *   `EngineConfig` plus docs       ~235 lines   (class `HybridAgentEngine` opens at 690)
 *   **the constructor              1602 lines** (925..2526)
 *   the 36 methods                 3058 lines
 *
 * The decisive number is the constructor. **1602 lines of the class is wiring, not
 * behaviour** — it constructs the services the rest of the class uses. A split along
 * the plan's eight categories moves methods, and a method-level split does not touch
 * the constructor at all. The single largest block in the file would survive the
 * refactor unchanged, and the file would still be large.
 *
 * Worse, the wiring is where the coupling actually lives. Eight compositions each
 * need services that other compositions also need — the model router, the memory
 * services, the verifier factory, the observability recorder — so a split either
 * duplicates construction or introduces a container that owns construction and hands
 * each composition its dependencies. That container is a larger change than "split
 * the file", and building it to make a file smaller is the cosmetic work the phase
 * forbids.
 *
 * Five rules:
 *
 *   1. Line count is never a justification. 5584 lines is not a reason to split;
 *      what matters is whether the responsibilities can be separated at all, and
 *      that is measured rather than assumed.
 *   2. The largest block in the file is the constructor, and a method-level split
 *      does not reduce it. Any proposal that claims to fix the file's size by moving
 *      methods is describing a different file than this one.
 *   3. Cross-composition coupling is measured. A composition that would have to
 *      reach into another's services to do its job is reported, because that is the
 *      cost a split would be paying.
 *   4. A cosmetic split is refused, and the refusal carries the measurement that
 *      justifies it rather than an opinion.
 *   5. Nothing is moved by this assessment. It reports; it does not refactor.
 */

export type CompositionName =
  | "EngineComposition"
  | "ExecutionComposition"
  | "MemoryComposition"
  | "ModelComposition"
  | "SecurityComposition"
  | "ResearchComposition"
  | "CognitiveComposition"
  | "IntegrationComposition";

export interface MethodRecord {
  readonly name: string;
  readonly composition: CompositionName;
  /** Services this method touches that another composition owns. */
  readonly foreignServices: readonly string[];
}

export interface StructuralFacts {
  readonly totalLines: number;
  readonly constructorLines: number;
  readonly methodLines: number;
  readonly methodCount: number;
  readonly importStatements: number;
}

/**
 * There is deliberately no `justified` state.
 *
 * Both branches refuse the split as specified, for different reasons: low coupling
 * means the file is not entangled, so moving code separates nothing; high coupling
 * means it is entangled, but the fix is a container that owns construction rather
 * than a file split. Discovering that while writing the test is the point of
 * measuring first.
 */
export type SplitVerdict = "cosmetic" | "entangled-needs-container";

export interface CompositionAssessment {
  readonly composition: CompositionName;
  readonly methods: number;
  /** How many of its methods depend on services another composition owns. */
  readonly coupled: number;
}

export interface SplitAssessment {
  readonly verdict: SplitVerdict;
  readonly compositions: readonly CompositionAssessment[];
  /** Methods that would cross a composition boundary, as a share of all methods. */
  readonly couplingRatio: number;
  /** What a split would leave untouched. */
  readonly notAddressed: readonly string[];
  readonly detail: string;
}

/** Above this share of coupled methods, a split is paying real cost, not decoration. */
export const COUPLING_THRESHOLD = 0.5;

/**
 * Assesses a proposed split.
 *
 * `facts` comes from measuring the file; `methods` is the inventory of what would go
 * where. Both are inputs so the assessment can be re-run when either changes, rather
 * than encoding today's numbers as a conclusion.
 */
export function assessEngineSplit(
  facts: StructuralFacts,
  methods: readonly MethodRecord[],
): SplitAssessment {
  const names: CompositionName[] = [
    "EngineComposition",
    "ExecutionComposition",
    "MemoryComposition",
    "ModelComposition",
    "SecurityComposition",
    "ResearchComposition",
    "CognitiveComposition",
    "IntegrationComposition",
  ];

  const compositions = names.map((composition) => {
    const owned = methods.filter((method) => method.composition === composition);
    return {
      composition,
      methods: owned.length,
      coupled: owned.filter((method) => method.foreignServices.length > 0).length,
    };
  });

  const coupled = methods.filter((method) => method.foreignServices.length > 0).length;
  const couplingRatio = methods.length === 0 ? 0 : coupled / methods.length;

  // Rule 2: what a method-level split cannot touch.
  const notAddressed: string[] = [];
  if (facts.constructorLines > 0) {
    notAddressed.push(
      `the constructor, which is ${facts.constructorLines} of ${facts.totalLines} lines and is wiring rather than behaviour`,
    );
  }
  if (facts.importStatements > 0) {
    notAddressed.push(
      `${facts.importStatements} import statements, which follow the services rather than the methods and would be redistributed, not removed`,
    );
  }
  const emptyCompositions = compositions.filter((composition) => composition.methods === 0).map((c) => c.composition);
  if (emptyCompositions.length > 0) {
    notAddressed.push(
      `${emptyCompositions.length} of the 8 proposed compositions would receive no methods at all: ${emptyCompositions.join(", ")}`,
    );
  }

  // Rules 1 and 4: line count alone never justifies a split, and neither does
  // coupling — it changes which reason applies.
  const cosmetic = couplingRatio < COUPLING_THRESHOLD || emptyCompositions.length > 0;

  return {
    verdict: cosmetic ? "cosmetic" : "entangled-needs-container",
    compositions,
    couplingRatio,
    notAddressed,
    detail: cosmetic
      ? `${Math.round(couplingRatio * 100)}% of ${methods.length} methods depend on services another composition owns, ` +
        `and a method-level split leaves ${facts.constructorLines} constructor lines untouched. ` +
        `Splitting now would move code without separating responsibilities`
      : `${Math.round(couplingRatio * 100)}% of ${methods.length} methods are cross-coupled, high enough that the boundaries are not real yet — ` +
        `separating them requires a container that owns construction first`,
  };
}

/**
 * Whether the measured facts alone would justify a split.
 *
 * Always false here, and deliberately so: **line count is not a reason**. A 5584-line
 * file whose largest block is a constructor is not the same problem as a 5584-line
 * file of entangled logic, and treating the number as the diagnosis is how a
 * codebase gets refactored for its own sake.
 */
export function isSizeAloneJustification(_facts: StructuralFacts): boolean {
  return false;
}
