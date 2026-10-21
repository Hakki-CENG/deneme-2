/**
 * FAZ 18 1/3 — experts are bound to evaluators, and an evaluator that cannot fail
 * is refused.
 *
 * One case binds a real evaluator from an earlier phase (FAZ 12's
 * verifyMultimodalAnalysis) rather than a fake, to prove the fabric joins the
 * evaluators that already exist instead of sitting beside them.
 */

import { describe, expect, it } from "vitest";

import { EvaluatorFabric, EvaluatorRegistrationError } from "../src/experts/evaluator-fabric.js";
import type { ExpertEvaluator } from "../src/experts/evaluator-fabric.js";
import { verifyMultimodalAnalysis } from "../src/multimodal/analysis-verification.js";
import type { MultimodalAnalysis, MultimodalInput } from "../src/multimodal/multimodal-service.js";

/** A strict evaluator: refuses work that is not a non-empty list of numbers. */
function strictEvaluator(expertId: string, domain: string): ExpertEvaluator {
  return {
    expertId,
    domain,
    name: `${domain}-strict`,
    evaluate: async (work) => {
      if (!Array.isArray(work) || work.length === 0) {
        return { verdict: "fail", detail: "expected a non-empty list" };
      }
      if (work.some((item) => typeof item !== "number")) {
        return { verdict: "fail", detail: "expected only numbers" };
      }
      return { verdict: "pass", detail: `${work.length} numbers` };
    },
    probe: { work: [], why: "an empty list is not a result" },
  };
}

/** An evaluator that agrees with everything: exactly what rule 2 exists to refuse. */
function rubberStamp(expertId: string, domain: string): ExpertEvaluator {
  return {
    expertId,
    domain,
    name: "rubber-stamp",
    evaluate: async () => ({ verdict: "pass", detail: "looks fine" }),
    probe: { work: "anything at all", why: "no input should be accepted unchecked" },
  };
}

describe("rule 2 — an evaluator that cannot fail is refused", () => {
  it("rejects a rubber stamp at registration", async () => {
    const fabric = new EvaluatorFabric();
    await expect(fabric.register(rubberStamp("data", "data"), "data")).rejects.toThrow(EvaluatorRegistrationError);
    await expect(fabric.register(rubberStamp("data", "data"), "data")).rejects.toThrow(
      /an evaluator that cannot fail reports coverage while checking nothing/,
    );
  });

  it("accepts an evaluator that refuses its probe", async () => {
    const fabric = new EvaluatorFabric();
    await expect(fabric.register(strictEvaluator("data", "data"), "data")).resolves.toBeUndefined();
    expect(fabric.evaluatorFor("data")?.name).toBe("data-strict");
  });

  it("refuses an evaluator that throws on its own probe", async () => {
    const fabric = new EvaluatorFabric();
    const broken: ExpertEvaluator = {
      expertId: "broken",
      domain: "data",
      name: "broken",
      evaluate: async () => {
        throw new Error("cannot reach the checker");
      },
      probe: { work: null, why: "nothing can be checked" },
    };
    await expect(fabric.register(broken, "data")).rejects.toThrow(/cannot be relied on/);
  });
});

describe("rule 3 — the domain has to match", () => {
  it("refuses an evaluator bound to the wrong expert domain", async () => {
    const fabric = new EvaluatorFabric();
    await expect(fabric.register(strictEvaluator("research", "coding"), "research")).rejects.toThrow(
      /reports coverage it does not have/,
    );
  });
});

describe("an expert cannot be re-bound silently", () => {
  it("refuses a second evaluator for the same expert", async () => {
    const fabric = new EvaluatorFabric();
    await fabric.register(strictEvaluator("data", "data"), "data");
    await expect(fabric.register(strictEvaluator("data", "data"), "data")).rejects.toThrow(
      /silently discard the previous one/,
    );
  });
});

describe("rule 1 — no evaluator means unverified, never pass", () => {
  it("reports unverified for an expert with no evaluator", async () => {
    const fabric = new EvaluatorFabric();
    const outcome = await fabric.evaluate("vision", [1, 2, 3]);
    expect(outcome.evaluated).toBe(false);
    expect(outcome.verdict).toBe("uncertain");
    expect(outcome.detail).toContain("no evaluator registered");
  });
});

describe("rule 5 — a throwing evaluator yields uncertain", () => {
  it("reports uncertain, not pass and not fail", async () => {
    const fabric = new EvaluatorFabric();
    const flaky: ExpertEvaluator = {
      expertId: "flaky",
      domain: "data",
      name: "flaky",
      evaluate: async (work) => {
        if (Array.isArray(work) && work.length > 0) throw new Error("checker unavailable");
        return { verdict: "fail", detail: "empty" };
      },
      probe: { work: [], why: "empty is not a result" },
    };
    await fabric.register(flaky, "data");
    const outcome = await fabric.evaluate("flaky", [1, 2, 3]);
    expect(outcome.verdict).toBe("uncertain");
    expect(outcome.detail).toContain("checker unavailable");
    expect(outcome.evaluated).toBe(true);
  });
});

describe("a real evaluator binds through the fabric", () => {
  const input: MultimodalInput = {
    id: "in-1",
    tenantId: "tenant",
    modality: "image",
    source: "screenshot.png",
    mimeType: "image/png",
    metadata: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  /** Wraps FAZ 12's verifier. Its probe is the confident-empty analysis it refuses. */
  const visionEvaluator: ExpertEvaluator = {
    expertId: "vision",
    domain: "vision",
    name: "vision-analysis",
    evaluate: async (work) => {
      const analysis = work as MultimodalAnalysis;
      const verification = verifyMultimodalAnalysis(analysis, input);
      return {
        verdict: verification.outcome === "supported" ? "pass" : "fail",
        detail: verification.detail,
      };
    },
    probe: {
      work: {
        id: "an-probe",
        inputId: "in-1",
        tenantId: "tenant",
        modality: "image",
        result: { summary: "The image shows an empty office.", details: {} },
        confidence: 0.9,
        processingMs: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      } satisfies MultimodalAnalysis,
      why: "a summary over no observations must not pass",
    },
  };

  it("registers, having proved it refuses the confident-empty case", async () => {
    const fabric = new EvaluatorFabric();
    await expect(fabric.register(visionEvaluator, "vision")).resolves.toBeUndefined();
  });

  it("passes work the underlying verifier supports", async () => {
    const fabric = new EvaluatorFabric();
    await fabric.register(visionEvaluator, "vision");
    const outcome = await fabric.evaluate("vision", {
      id: "an-1",
      inputId: "in-1",
      tenantId: "tenant",
      modality: "image",
      result: { summary: "", details: {}, text: "Invoice 4021" },
      confidence: 0.9,
      processingMs: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    } satisfies MultimodalAnalysis);
    expect(outcome.evaluated).toBe(true);
    expect(outcome.verdict).toBe("pass");
  });

  it("fails work the underlying verifier refuses", async () => {
    const fabric = new EvaluatorFabric();
    await fabric.register(visionEvaluator, "vision");
    const outcome = await fabric.evaluate("vision", visionEvaluator.probe.work);
    expect(outcome.verdict).toBe("fail");
    expect(outcome.detail).toContain("no entities, objects, text, structure or spatial data");
  });
});

describe("rule 4 — coverage is reported", () => {
  it("names the experts with no evaluator", async () => {
    const fabric = new EvaluatorFabric();
    await fabric.register(strictEvaluator("data", "data"), "data");
    const coverage = fabric.coverage(["data", "vision", "research"]);
    expect(coverage.covered).toEqual(["data"]);
    expect(coverage.uncovered).toEqual(["vision", "research"]);
    expect(coverage.summary).toContain("2 do not: vision, research");
  });

  it("reports full coverage when every expert is bound", async () => {
    const fabric = new EvaluatorFabric();
    await fabric.register(strictEvaluator("data", "data"), "data");
    expect(fabric.coverage(["data"]).summary).toContain("every one of the 1 expert(s)");
  });
});
