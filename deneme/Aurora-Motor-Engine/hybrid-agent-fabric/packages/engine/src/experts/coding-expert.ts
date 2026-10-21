/**
 * FAZ 6 — Coding Expert.
 *
 * Two things live here, and the second is the one that matters.
 *
 * The first is the expert definition: the capabilities a coding task may use,
 * the risk ceiling it works under, and the planning budget it gets. Every tool
 * id is one that `src/capabilities/` actually registers, and a test reads that
 * directory to prove it — a rename there breaks the test instead of quietly
 * turning this list into fiction.
 *
 * The second is the rule the whole phase exists for: **Aurora does not decide
 * that its own code works.** A model that wrote the code is not a witness to
 * whether it runs. So accepting code work requires a verdict from something
 * that executed — a compiler, a test, a static analyser, a security scan.
 * Evaluators agreeing with each other is not that, however many agree, and
 * `V3_consensus` cannot carry a code claim on its own.
 */

import type { ExpertDefinition } from "./expert-definition.js";
import type { VerifierOutcome, VerifierTier, VerificationReport } from "../execution/verification-factory.js";

/**
 * The tiers whose verdict comes from something that ran, rather than from a
 * judgement about the code.
 *
 * `V1_formal` is a proof or a check with a defined semantics; `V2_empirical` is
 * a command that was executed and whose output was read. Both leave evidence
 * that does not depend on anyone's opinion of the code.
 */
export const EXTERNAL_VERDICT_TIERS: readonly VerifierTier[] = ["V1_formal", "V2_empirical"];

/** Whether a tier's verdict counts as external execution. */
export function isExternalVerdictTier(tier: VerifierTier): boolean {
  return EXTERNAL_VERDICT_TIERS.includes(tier);
}

export interface CodeWorkAcceptance {
  readonly accepted: boolean;
  /** Why. Names what decided it, or what was missing. */
  readonly reason: string;
  /** The outcomes that actually decided the answer. Empty when nothing did. */
  readonly deciding: readonly VerifierOutcome[];
}

/**
 * Whether a verification report is enough to accept code work.
 *
 * The order of the checks is the point:
 *
 *   1. Nothing external ran -> not accepted. An unverified run is not a pass,
 *      and "no verifier objected" is not evidence.
 *   2. Any external check failed -> not accepted. A pass from a weaker tier
 *      does not outvote a compiler.
 *   3. External checks ran and none failed -> accepted.
 *
 * A report that passes only on `V3_consensus` or `V4_unverifiable` is refused
 * with the reason saying so, because that is the failure mode this phase is
 * about: agreement between evaluators is not an exit code.
 */
export function acceptCodeWork(report: VerificationReport): CodeWorkAcceptance {
  const external = report.results.filter((outcome) => isExternalVerdictTier(outcome.tier));

  if (external.length === 0) {
    const tiers = [...new Set(report.results.map((outcome) => outcome.tier))];
    const onlyOpinions = tiers.length > 0 && tiers.every((tier) => !isExternalVerdictTier(tier));
    return {
      accepted: false,
      deciding: [],
      reason: onlyOpinions
        ? `only non-executed verdicts were offered (${tiers.join(", ")}); agreement between evaluators is not an exit code`
        : "nothing was executed to check this code, so there is no basis to accept it",
    };
  }

  const failed = external.filter((outcome) => outcome.verdict === "fail");
  if (failed.length > 0) {
    return {
      accepted: false,
      deciding: failed,
      reason: `${failed.length} executed check(s) failed: ${failed
        .map((outcome) => `${outcome.verifier} (${outcome.tier})`)
        .join(", ")}`,
    };
  }

  const passed = external.filter((outcome) => outcome.verdict === "pass");
  const uncertain = external.filter((outcome) => outcome.verdict === "uncertain");
  if (passed.length === 0) {
    return {
      accepted: false,
      deciding: uncertain,
      reason: `${uncertain.length} executed check(s) ran but none reached a definite verdict`,
    };
  }

  return {
    accepted: true,
    deciding: passed,
    reason: `${passed.length} executed check(s) passed: ${passed
      .map((outcome) => `${outcome.verifier} (${outcome.tier})`)
      .join(", ")}`,
  };
}

/**
 * The Coding Expert.
 *
 * A factory rather than a constant so a caller can vary the memory namespace or
 * the planner budget per deployment without editing this file, and so the
 * definition is constructed against the caller's capability inventory rather
 * than assumed to fit it.
 */
export function codingExpert(overrides: Partial<ExpertDefinition> = {}): ExpertDefinition {
  return {
    id: "coding",
    domain: "software-engineering",
    knowledge: ["repository-map", "dependency-graph"],
    skills: ["patch-planning", "test-generation", "refactoring"],
    tools: [
      // Repository understanding, through the language server.
      "code.catalog",
      "code.symbols",
      "code.definition",
      "code.references",
      "code.dependencies",
      // Change and check.
      "filesystem.patch",
      "code.patch.generate",
      "code.refactor.verify",
      "code.diagnostics.run",
      "code.diagnostics.evidence",
      // Running the build and the tests is what makes a verdict external.
      "shell.start",
      "shell.output",
      "shell.stop",
      "verify.run",
      "verify.evidence",
      "security.audit.query",
      // Version control, including the way back.
      "git.status",
      "git.diff",
      "git.branch.create",
      "git.branch.switch",
      "git.commit",
      "git.rollback",
      "git.ci.status",
    ],
    safety: {
      // Writing the workspace and running the build; not publishing, not
      // pushing, not touching anything the engine cannot undo.
      maxCapabilityRisk: "process",
      requireApprovalAtCeiling: true,
    },
    memoryNamespace: "expert.coding",
    evaluatorCategories: ["coding"],
    benchmarkSuite: "aurora-core",
    servesCapabilities: ["code_change", "refactor", "test_generation", "debugging"],
    planner: {
      // Tighter than the engine default: a coding plan that needs more than a
      // dozen steps is a decomposition problem, not a plan.
      constraints: { maxSteps: 12 },
    },
    ...overrides,
  };
}
