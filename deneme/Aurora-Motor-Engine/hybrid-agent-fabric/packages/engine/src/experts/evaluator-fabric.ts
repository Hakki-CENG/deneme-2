/**
 * FAZ 18 1/3 — an expert without an evaluator is a generator with nobody checking it.
 *
 * Measured first, and the measurement says the pieces exist but are not joined.
 * `ExpertDefinition` carries `evaluatorCategories?: readonly string[]` — optional,
 * and it is a list of eval *category names* the expert is scored on by
 * `packages/eval` offline. It is not an evaluator: nothing in it checks a piece of
 * work.
 *
 * Meanwhile four domain evaluators were built across earlier phases and none of
 * them is bound to an expert:
 *
 *   - coding:    `acceptCodeWork` (FAZ 6)
 *   - research:  `auditResearchReport` (FAZ 8)
 *   - math/data: `verifyNumericClaims` (FAZ 9)
 *   - vision:    `verifyMultimodalAnalysis` (FAZ 12)
 *
 * So the fabric FAZ 18 describes — every expert owns an evaluator — does not
 * exist yet even though four fifths of its evaluators do. This joins them.
 *
 * Five rules:
 *
 *   1. Evaluating work for an expert with no evaluator returns `unverified`, never
 *      `pass`. The absence of a checker is not a result about the work.
 *   2. An evaluator that cannot fail is not an evaluator, and is refused at
 *      registration. Registration runs a probe the evaluator must reject; an
 *      evaluator that passes everything would report coverage while checking
 *      nothing, which is worse than having no evaluator because it looks covered.
 *   3. An evaluator must declare the domain it evaluates. A coding evaluator bound
 *      to a research expert is worse than none for the same reason.
 *   4. Coverage is reported, including which experts have no evaluator. A fabric
 *      that cannot say what it does not cover cannot be relied on for what it does.
 *   5. An evaluator that throws yields `uncertain`, not `pass` and not `fail`. Not
 *      being able to check is not a verdict either way.
 */

export interface ExpertEvaluationOutcome {
  readonly verdict: "pass" | "fail" | "uncertain";
  readonly detail: string;
}

export interface ExpertEvaluator {
  /** The expert this evaluator belongs to. */
  readonly expertId: string;
  /** The domain it evaluates. Must match the expert's, by rule 3. */
  readonly domain: string;
  readonly name: string;
  readonly evaluate: (work: unknown) => Promise<ExpertEvaluationOutcome>;
  /**
   * Something this evaluator must reject.
   *
   * Required, because an evaluator's value is entirely in what it refuses. Without
   * a probe there is no way to tell an evaluator from a function that returns pass.
   */
  readonly probe: { work: unknown; why: string };
}

export interface EvaluationFabricCoverage {
  readonly total: number;
  readonly covered: readonly string[];
  readonly uncovered: readonly string[];
  readonly summary: string;
}

export class EvaluatorRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluatorRegistrationError";
  }
}

/**
 * Binds experts to their evaluators and reports what is not bound.
 *
 * Registration is synchronous and refuses eagerly, because an evaluator that
 * cannot fail is a defect in the fabric rather than a runtime condition — it should
 * stop the registration, not quietly sit in the registry.
 */
export class EvaluatorFabric {
  private readonly evaluators = new Map<string, ExpertEvaluator>();

  /**
   * Registers an evaluator after proving it can refuse.
   *
   * `expertDomain` is passed in rather than looked up so the fabric does not depend
   * on an expert registry; the caller owns that.
   */
  async register(evaluator: ExpertEvaluator, expertDomain: string): Promise<void> {
    if (this.evaluators.has(evaluator.expertId)) {
      throw new EvaluatorRegistrationError(
        `expert "${evaluator.expertId}" already has an evaluator; replacing it would silently discard the previous one`,
      );
    }
    // Rule 3: the evaluator has to be for this expert's domain.
    if (evaluator.domain !== expertDomain) {
      throw new EvaluatorRegistrationError(
        `evaluator "${evaluator.name}" evaluates "${evaluator.domain}" but expert "${evaluator.expertId}" is "${expertDomain}"; ` +
          `an evaluator for the wrong domain reports coverage it does not have`,
      );
    }

    // Rule 2: prove it can refuse, before trusting it to check anything.
    let probe: ExpertEvaluationOutcome;
    try {
      probe = await evaluator.evaluate(evaluator.probe.work);
    } catch {
      throw new EvaluatorRegistrationError(
        `evaluator "${evaluator.name}" threw on its own probe, so it cannot be relied on to evaluate real work`,
      );
    }
    if (probe.verdict === "pass") {
      throw new EvaluatorRegistrationError(
        `evaluator "${evaluator.name}" passed a probe it must reject (${evaluator.probe.why}); ` +
          `an evaluator that cannot fail reports coverage while checking nothing`,
      );
    }

    this.evaluators.set(evaluator.expertId, evaluator);
  }

  /**
   * Evaluates work for an expert.
   *
   * Rule 1: no evaluator means `unverified`. Rule 5: a throwing evaluator means
   * `uncertain`. Neither is a pass.
   */
  async evaluate(expertId: string, work: unknown): Promise<ExpertEvaluationOutcome & { evaluated: boolean }> {
    const evaluator = this.evaluators.get(expertId);
    if (evaluator === undefined) {
      return {
        verdict: "uncertain",
        detail: `expert "${expertId}" has no evaluator registered, so nothing checked this work`,
        evaluated: false,
      };
    }
    try {
      const outcome = await evaluator.evaluate(work);
      return { ...outcome, evaluated: true };
    } catch (error) {
      return {
        verdict: "uncertain",
        detail: `evaluator "${evaluator.name}" could not run: ${error instanceof Error ? error.message : String(error)}`,
        evaluated: true,
      };
    }
  }

  /** Rule 4: what the fabric covers, and what it does not. */
  coverage(expertIds: readonly string[]): EvaluationFabricCoverage {
    const covered = expertIds.filter((id) => this.evaluators.has(id));
    const uncovered = expertIds.filter((id) => !this.evaluators.has(id));
    return {
      total: expertIds.length,
      covered,
      uncovered,
      summary:
        uncovered.length === 0
          ? `every one of the ${expertIds.length} expert(s) has an evaluator`
          : `${covered.length}/${expertIds.length} expert(s) have an evaluator; ${uncovered.length} do not: ${uncovered.join(", ")}`,
    };
  }

  /** Which evaluator is bound to an expert, when one is. */
  evaluatorFor(expertId: string): ExpertEvaluator | undefined {
    return this.evaluators.get(expertId);
  }
}
