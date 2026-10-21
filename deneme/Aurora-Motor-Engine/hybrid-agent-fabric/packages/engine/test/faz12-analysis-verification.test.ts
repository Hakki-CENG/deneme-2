/**
 * FAZ 12 1/3 — an analysis is checked against the input it claims to describe.
 *
 * The load-bearing distinction is between `unsupported-claim` (a summary that
 * reads as a finding over nothing measured) and `empty` (no summary and nothing
 * measured). Both are absences of evidence, but only one of them looks like a
 * finding to a downstream consumer.
 */

import { describe, expect, it } from "vitest";

import { countObservations, isEvidence, verifyMultimodalAnalysis } from "../src/multimodal/analysis-verification.js";
import type { AnalysisResult, MultimodalAnalysis, MultimodalInput } from "../src/multimodal/multimodal-service.js";

function input(fields: Partial<MultimodalInput> = {}): MultimodalInput {
  return {
    id: "in-1",
    tenantId: "tenant",
    modality: "image",
    source: "screenshot.png",
    mimeType: "image/png",
    metadata: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  };
}

function analysis(result: AnalysisResult, fields: Partial<MultimodalAnalysis> = {}): MultimodalAnalysis {
  return {
    id: "an-1",
    inputId: "in-1",
    tenantId: "tenant",
    modality: "image",
    result,
    confidence: 0.9,
    processingMs: 120,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  };
}

describe("counting observations", () => {
  it("counts across every observation field", () => {
    expect(
      countObservations({
        summary: "s",
        details: {},
        entities: [{ label: "person", value: "Ada", confidence: 1 }],
        objects: [{ label: "chair", confidence: 0.8, bbox: { x: 0, y: 0, width: 1, height: 1 } }],
      }),
    ).toBe(2);
  });

  it("does not count whitespace text as an observation", () => {
    // A provider returning "   " has transcribed nothing.
    expect(countObservations({ summary: "s", details: {}, text: "   " })).toBe(0);
    expect(countObservations({ summary: "s", details: {}, text: "Invoice 4021" })).toBe(1);
  });

  it("treats a summary as no observation at all", () => {
    expect(countObservations({ summary: "a full description of the scene", details: {} })).toBe(0);
  });
});

describe("rule 5 — a summary over nothing is a claim, not a finding", () => {
  it("flags the confident-empty response", () => {
    const verification = verifyMultimodalAnalysis(
      analysis({ summary: "The image shows an empty office with no people.", details: {} }),
      input(),
    );
    expect(verification.outcome).toBe("unsupported-claim");
    expect(verification.detail).toContain("no entities, objects, text, structure or spatial data");
    expect(isEvidence(verification)).toBe(false);
  });

  it("keeps that distinct from a genuinely empty result", () => {
    const verification = verifyMultimodalAnalysis(analysis({ summary: "", details: {} }), input());
    expect(verification.outcome).toBe("empty");
    expect(verification.detail).toContain("absence of measurement");
    expect(isEvidence(verification)).toBe(false);
  });
});

describe("an analysis with observations is supported", () => {
  it("reports the count and confidence", () => {
    const verification = verifyMultimodalAnalysis(
      analysis({
        summary: "two people at a desk",
        details: {},
        objects: [
          { label: "person", confidence: 0.9, bbox: { x: 0, y: 0, width: 1, height: 1 } },
          { label: "person", confidence: 0.7, bbox: { x: 2, y: 0, width: 1, height: 1 } },
        ],
      }),
      input(),
    );
    expect(verification.outcome).toBe("supported");
    expect(verification.observations).toBe(2);
    expect(isEvidence(verification)).toBe(true);
  });

  it("supports an OCR result on its own", () => {
    const verification = verifyMultimodalAnalysis(
      analysis({ summary: "", details: {}, text: "Invoice 4021" }, { modality: "ocr" }),
      input({ modality: "ocr" }),
    );
    expect(verification.outcome).toBe("supported");
    expect(verification.observations).toBe(1);
  });
});

describe("rule 2 — bound to the input it claims to describe", () => {
  it("refuses an analysis with no input supplied", () => {
    const verification = verifyMultimodalAnalysis(analysis({ summary: "s", details: {}, text: "x" }), undefined);
    expect(verification.outcome).toBe("unbound");
    expect(verification.detail).toContain("cannot be tied to anything that was measured");
  });

  it("refuses an analysis recorded against a different input", () => {
    const verification = verifyMultimodalAnalysis(
      analysis({ summary: "s", details: {}, text: "x" }),
      input({ id: "in-2" }),
    );
    expect(verification.outcome).toBe("unbound");
    expect(verification.detail).toContain("in-1");
    expect(verification.detail).toContain("in-2");
  });
});

describe("rule 3 — the modality has to match", () => {
  it("refuses an image analysis for a video input", () => {
    const verification = verifyMultimodalAnalysis(
      analysis({ summary: "s", details: {}, objects: [{ label: "car", confidence: 1, bbox: { x: 0, y: 0, width: 1, height: 1 } }] }),
      input({ modality: "video" }),
    );
    expect(verification.outcome).toBe("modality-mismatch");
    expect(verification.detail).toContain("video");
    expect(verification.detail).toContain("image");
    expect(isEvidence(verification)).toBe(false);
  });
});

describe("only a supported analysis is evidence", () => {
  it("rejects every other outcome", () => {
    const outcomes = [
      verifyMultimodalAnalysis(analysis({ summary: "s", details: {} }), input()),
      verifyMultimodalAnalysis(analysis({ summary: "", details: {} }), input()),
      verifyMultimodalAnalysis(analysis({ summary: "s", details: {} }), undefined),
      verifyMultimodalAnalysis(analysis({ summary: "s", details: {} }), input({ modality: "audio" })),
    ];
    expect(outcomes.map(isEvidence)).toEqual([false, false, false, false]);
  });
});
