/**
 * FAZ 12 1/3 — an analysis that describes nothing is not an analysis of
 * something containing nothing.
 *
 * Measured first, and the measurement changed what this step should be. The
 * multimodal layer is *already honest* about what it cannot do: a prior pass made
 * `analyzeImage`, `analyzeVideo`, OCR and transcription throw
 * `MultimodalCapabilityUnavailableError` instead of returning `[OCR placeholder
 * for file.png]`, and the comment there names the failure exactly — a downstream
 * consumer could not tell placeholder text from a real transcript, "so the whole
 * pipeline produced confident nonsense".
 *
 * But that refusal only covers the legacy entry points. The real path — a
 * workspace image projected into a model provider's native payload
 * (`models/multimodal.ts`, 34 lines) — returns whatever the provider returns, and
 * **nothing checks it**. A provider that responds with an empty object list and a
 * confident summary reproduces the same defect through the front door.
 *
 * So this does not add a vision backend. It adds the check that makes any
 * backend's answer usable as evidence.
 *
 * Five rules:
 *
 *   1. An analysis with no observations is `empty`, never "analyzed, contains
 *      nothing". The second is a claim about the world; the first is an absence
 *      of measurement. Collapsing them is the bug this file exists to prevent.
 *   2. An analysis must be bound to the input it claims to describe. A summary
 *      that could be about any image is not evidence about this one.
 *   3. The modality must match. An "image" analysis returned for a video input
 *      is a mismatch, not a partial success.
 *   4. A confidence attached to no observations is not evidence. Confidence is a
 *      property of a measurement; with nothing measured it is a decoration.
 *   5. A summary asserting content while every observation field is empty is
 *      `unsupported-claim` — the summary is the part that reads as a finding.
 *
 * No vision, STT, TTS or video backend is built here. This sandbox runs no model,
 * so any such backend could only be an unverifiable stub — the call FAZ 10 and
 * FAZ 11 both made. What a real backend needs is this underneath it.
 */

import type { AnalysisResult, MultimodalAnalysis, MultimodalInput } from "./multimodal-service.js";

export type AnalysisVerificationOutcome =
  | "supported"
  | "empty"
  | "unbound"
  | "modality-mismatch"
  | "unsupported-claim";

export interface AnalysisVerification {
  readonly analysisId: string;
  readonly inputId: string;
  readonly outcome: AnalysisVerificationOutcome;
  /** How many discrete observations the result actually carries. */
  readonly observations: number;
  readonly detail: string;
}

/**
 * Counts the discrete observations in a result.
 *
 * Every observation field on `AnalysisResult` is optional, so an analysis can
 * arrive with a summary and nothing else — and that is precisely the shape that
 * reads as a finding to anything downstream.
 */
export function countObservations(result: AnalysisResult): number {
  let count = 0;
  if (Array.isArray(result.entities)) count += result.entities.length;
  if (Array.isArray(result.objects)) count += result.objects.length;
  if (Array.isArray(result.timeSeriesPoints)) count += result.timeSeriesPoints.length;
  if (result.text !== undefined && result.text.trim().length > 0) count += 1;
  if (result.structure !== undefined) count += 1;
  if (result.spatialData !== undefined) count += 1;
  return count;
}

/**
 * Verifies a multimodal analysis against the input it claims to describe.
 *
 * Takes the input explicitly rather than looking it up, because the question is
 * whether *this* analysis is about *that* input — and answering it from a store
 * lookup would assume the binding this function exists to check.
 */
export function verifyMultimodalAnalysis(
  analysis: MultimodalAnalysis,
  input: MultimodalInput | undefined,
): AnalysisVerification {
  const base = { analysisId: analysis.id, inputId: analysis.inputId };

  // Rule 2: bound to the input it claims to describe.
  if (input === undefined) {
    return {
      ...base,
      outcome: "unbound",
      observations: countObservations(analysis.result),
      detail: `the analysis claims input "${analysis.inputId}", which was not supplied, so it cannot be tied to anything that was measured`,
    };
  }
  if (input.id !== analysis.inputId) {
    return {
      ...base,
      outcome: "unbound",
      observations: countObservations(analysis.result),
      detail: `the analysis is recorded against input "${analysis.inputId}" but was checked against input "${input.id}"`,
    };
  }

  // Rule 3: the modality has to match, or the answer is about a different kind
  // of thing than the one that was handed over.
  if (input.modality !== analysis.modality) {
    return {
      ...base,
      outcome: "modality-mismatch",
      observations: countObservations(analysis.result),
      detail: `the input is "${input.modality}" but the analysis reports "${analysis.modality}"`,
    };
  }

  const observations = countObservations(analysis.result);

  // Rule 1: nothing observed.
  if (observations === 0) {
    const summary = analysis.result.summary.trim();
    // Rule 5: a summary that reads as a finding, over no observations.
    if (summary.length > 0) {
      return {
        ...base,
        outcome: "unsupported-claim",
        observations: 0,
        detail: `the summary claims "${summary.slice(0, 160)}" but the result carries no entities, objects, text, structure or spatial data`,
      };
    }
    return {
      ...base,
      outcome: "empty",
      observations: 0,
      detail: "nothing was observed, so this is an absence of measurement rather than a finding that the input contains nothing",
    };
  }

  // Rule 4: confidence over nothing would be a decoration; here there is
  // something measured, so the confidence has a referent.
  return {
    ...base,
    outcome: "supported",
    observations,
    detail: `${observations} observation(s) at confidence ${analysis.confidence.toFixed(2)}`,
  };
}

/**
 * Whether an analysis may be used as evidence at all.
 *
 * Only a `supported` analysis is. `empty` is not a failure of the input — it is a
 * failure to measure it, and letting it through as "nothing found" is how an
 * unmeasured file ends up recorded as a clean one.
 */
export function isEvidence(verification: AnalysisVerification): boolean {
  return verification.outcome === "supported";
}
