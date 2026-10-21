/**
 * FAZ 15 1/3 — precision over what actually reached the user.
 *
 * The load-bearing cases: initiatives that never reached anyone are excluded from
 * the denominator, because counting a suppressed initiative as a correct one is
 * how a noisy system reports a flattering number. And a small sample refuses to
 * produce a rate at all.
 */

import { describe, expect, it } from "vitest";

import { isPrecisionActionable, measureProactivePrecision } from "../src/initiative/proactive-precision.js";
import type { Initiative } from "../src/initiative/proactive-initiative-service.js";

let counter = 0;

function initiative(state: Initiative["state"]): Initiative {
  counter += 1;
  return {
    id: `init-${counter}`,
    tenantId: "tenant",
    kind: "insight",
    mode: "standard",
    title: `initiative ${counter}`,
    message: "message",
    importance: 0.5,
    urgency: 0.5,
    impact: 0.5,
    confidence: 0.8,
    userRelevance: 0.6,
    worthiness: 0.7,
    goalAlignment: 0.5,
    priority: "P2",
    channel: "inbox",
    state,
    escalations: [],
    intakeEventIds: [],
    evidenceRefs: [],
    dedupeDigest: `digest-${counter}`,
  } as Initiative;
}

function many(state: Initiative["state"], count: number): Initiative[] {
  return Array.from({ length: count }, () => initiative(state));
}

describe("a real sample is measured", () => {
  it("reports precision with its denominator", () => {
    const measurement = measureProactivePrecision([...many("delivered", 7), ...many("dismissed", 3)]);
    expect(measurement.verdict).toBe("measured");
    expect(measurement.precision).toBeCloseTo(0.7, 5);
    expect(measurement.reached).toBe(10);
    expect(measurement.accepted).toBe(7);
    expect(measurement.dismissed).toBe(3);
    expect(measurement.detail).toContain("7/10 delivered initiative(s)");
    expect(isPrecisionActionable(measurement)).toBe(true);
  });
});

describe("rule 1 — what never reached the user is not accuracy", () => {
  it("excludes candidate, queued, suppressed, digested and expired from the denominator", () => {
    const measurement = measureProactivePrecision([
      ...many("delivered", 6),
      ...many("dismissed", 4),
      ...many("suppressed", 20),
      ...many("queued", 10),
      ...many("candidate", 10),
      ...many("digested", 5),
      ...many("expired", 5),
    ]);

    // 60 initiatives in total, but only 10 reached anyone.
    expect(measurement.reached).toBe(10);
    expect(measurement.neverReached).toBe(50);
    expect(measurement.precision).toBeCloseTo(0.6, 5);
    expect(measurement.detail).toContain("never reached the user and are excluded");
  });

  it("does not report 100% for a system that only ever suppresses", () => {
    const measurement = measureProactivePrecision(many("suppressed", 40));
    expect(measurement.verdict).toBe("insufficient-sample");
    expect(measurement.precision).toBeUndefined();
    expect(measurement.reached).toBe(0);
  });
});

describe("rule 2 — a small sample refuses to produce a rate", () => {
  it("reports insufficient-sample below the floor", () => {
    const measurement = measureProactivePrecision([...many("delivered", 2)]);
    expect(measurement.verdict).toBe("insufficient-sample");
    expect(measurement.precision).toBeUndefined();
    expect(measurement.detail).toContain("below the 10 needed");
    expect(isPrecisionActionable(measurement)).toBe(false);
  });

  it("refuses even a perfect-looking single initiative", () => {
    // The tempting case: 1 delivered, 0 dismissed, so "100% precision".
    const measurement = measureProactivePrecision(many("delivered", 1));
    expect(measurement.verdict).toBe("insufficient-sample");
    expect(measurement.accepted).toBe(1);
    expect(measurement.precision).toBeUndefined();
  });

  it("accepts a stated lower floor", () => {
    const measurement = measureProactivePrecision([...many("delivered", 2), ...many("dismissed", 1)], {
      minSample: 3,
    });
    expect(measurement.verdict).toBe("measured");
    expect(measurement.precision).toBeCloseTo(2 / 3, 5);
  });

  it("reports insufficient-sample for nothing at all", () => {
    const measurement = measureProactivePrecision([]);
    expect(measurement.verdict).toBe("insufficient-sample");
    expect(measurement.reached).toBe(0);
  });
});

describe("rule 5 — a high dismissal rate is stated plainly", () => {
  it("names it as a defect of the system", () => {
    const measurement = measureProactivePrecision([...many("delivered", 2), ...many("dismissed", 8)]);
    expect(measurement.verdict).toBe("measured");
    expect(measurement.precision).toBeCloseTo(0.2, 5);
    expect(measurement.detail).toContain("training the user to stop reading");
    expect(measurement.detail).toContain("a defect of the system rather than of the user");
  });

  it("does not raise the alarm at exactly half", () => {
    const measurement = measureProactivePrecision([...many("delivered", 5), ...many("dismissed", 5)]);
    expect(measurement.precision).toBeCloseTo(0.5, 5);
    expect(measurement.detail).not.toContain("training the user to stop reading");
  });
});
