/**
 * FAZ 5 3/3 — complexity stops being scored from substrings.
 *
 * `analyzeComplexity` used to be the whole of task classification: "implement"
 * was worth 2, "refactor" 3, "from scratch" 4, so the wording decided how much
 * machinery a task got. These tests hold the new path to ignoring the wording
 * completely when there is an analysis, and to saying which path ran when there
 * is not.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MetaControllerService, complexityFromCapabilities } from "../src/aurora/meta-controller.js";
import type { CapabilityRequirement } from "../src/experts/task-router.js";

function requirements(count: number): CapabilityRequirement[] {
  return Array.from({ length: count }, (_, index) => ({
    capability: `capability_${index}`,
    evidence: "e",
    confidence: 0.9,
  }));
}

async function controller() {
  return new MetaControllerService(await mkdtemp(join(tmpdir(), "haf-faz5-meta-")));
}

/** Wording that the legacy scorer reads as heavy: every clause is worth points. */
const HEAVY_WORDING =
  "Implement a comprehensive architecture from scratch, then refactor and optimize and migrate the entire system";

describe("complexityFromCapabilities", () => {
  it("cannot say anything from nothing", () => {
    // "Nothing was analysed" is not the same as "this is trivial".
    expect(complexityFromCapabilities([])).toBeUndefined();
  });

  it("climbs the ladder with the number of distinct needs", () => {
    expect(complexityFromCapabilities(requirements(1))).toBe("simple");
    expect(complexityFromCapabilities(requirements(2))).toBe("moderate");
    expect(complexityFromCapabilities(requirements(3))).toBe("complex");
    expect(complexityFromCapabilities(requirements(4))).toBe("complex");
    expect(complexityFromCapabilities(requirements(5))).toBe("extreme");
    expect(complexityFromCapabilities(requirements(9))).toBe("extreme");
  });

  it("never calls an analysed task trivial", () => {
    for (let count = 1; count <= 9; count++) {
      expect(complexityFromCapabilities(requirements(count)), `count=${count}`).not.toBe("trivial");
    }
  });
});

describe("analyzeComplexity", () => {
  it("ignores the wording entirely when there is an analysis", async () => {
    const meta = await controller();
    // The legacy scorer reads this goal as heavy. One analysed need makes it simple.
    expect(meta.analyzeComplexity(HEAVY_WORDING)).not.toBe("simple");
    expect(meta.analyzeComplexity(HEAVY_WORDING, undefined, requirements(1))).toBe("simple");
  });

  it("ignores plain wording too when there is an analysis", async () => {
    const meta = await controller();
    // The mirror case: a goal with none of the scoring words still counts.
    const plain = "look at this";
    expect(meta.analyzeComplexity(plain)).toBe("trivial");
    expect(meta.analyzeComplexity(plain, undefined, requirements(5))).toBe("extreme");
  });

  it("still runs the legacy scorer when nobody analysed anything", async () => {
    // Removing it outright would leave the runTask() path with no answer at all.
    // It stays, and complexitySource says it ran.
    const meta = await controller();
    expect(meta.analyzeComplexity(HEAVY_WORDING)).not.toBe("trivial");
    expect(meta.analyzeComplexity(HEAVY_WORDING, undefined, [])).toBe(meta.analyzeComplexity(HEAVY_WORDING));
  });
});

describe("profileTask records which path produced the answer", () => {
  it("says capabilities when there was an analysis", async () => {
    const meta = await controller();
    const profile = await meta.profileTask("local", HEAVY_WORDING, undefined, requirements(3));
    expect(profile.complexitySource).toBe("capabilities");
    expect(profile.complexity).toBe("complex");
  });

  it("says keyword when there was not", async () => {
    const meta = await controller();
    const profile = await meta.profileTask("local", HEAVY_WORDING);
    expect(profile.complexitySource).toBe("keyword");
  });

  it("does not let the two disagree about the same task", async () => {
    // The recorded source has to match the value: a profile claiming
    // "capabilities" while carrying a keyword score would be worse than
    // carrying no source at all.
    const meta = await controller();
    for (const count of [0, 1, 2, 3, 5]) {
      const profile = await meta.profileTask("local", HEAVY_WORDING, undefined, requirements(count));
      const expectedSource = count === 0 ? "keyword" : "capabilities";
      expect(profile.complexitySource, `count=${count}`).toBe(expectedSource);
      expect(profile.complexity, `count=${count}`).toBe(
        count === 0 ? meta.analyzeComplexity(HEAVY_WORDING) : complexityFromCapabilities(requirements(count)),
      );
    }
  });
});
