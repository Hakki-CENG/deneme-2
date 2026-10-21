/**
 * FAZ 23 1/3 — the three questions, separated by kind.
 *
 * Two load-bearing cases: a deadline declared "met" whose date is in the past is
 * reported as a contradiction rather than resolved in favour of either side, and a
 * counterfactual returns `cannot-simulate` instead of a fabricated forecast.
 */

import { describe, expect, it } from "vitest";

import {
  answerCounterfactual,
  answerDelayRisk,
  answerWorkload,
  DUE_SOON_DAYS,
} from "../src/digital-twin/twin-simulation.js";

const NOW = new Date("2026-10-10T00:00:00.000Z");

describe("question 1 — workload is a sum, and says what it summed", () => {
  it("totals the recorded estimates and lists the lines", () => {
    const answer = answerWorkload([
      {
        id: "wf-1",
        steps: [
          { id: "s1", name: "review", estimatedMinutes: 45 },
          { id: "s2", name: "deploy", estimatedMinutes: 30 },
        ],
      },
      { id: "wf-2", steps: [{ id: "s3", name: "test", estimatedMinutes: 60 }] },
    ]);

    expect(answer.kind).toBe("sum");
    expect(answer.totalMinutes).toBe(135);
    expect(answer.steps).toHaveLength(3);
    expect(answer.evidence).toContain("3 recorded step(s) across 2 workflow(s)");
  });

  it("says an empty twin is a sum over an empty set, not a week with no work", () => {
    const answer = answerWorkload([]);
    expect(answer.totalMinutes).toBe(0);
    expect(answer.evidence).toContain("sum over an empty set rather than a week with no work");
  });
});

describe("question 2 — delay risk comes from the date, not the declared status", () => {
  it("computes overdue and due-soon from dates", () => {
    const answer = answerDelayRisk(
      [
        { id: "d1", title: "past", date: "2026-10-01T00:00:00.000Z", priority: "critical", status: "upcoming" },
        { id: "d2", title: "soon", date: "2026-10-13T00:00:00.000Z", priority: "high", status: "upcoming" },
        { id: "d3", title: "far", date: "2026-12-31T00:00:00.000Z", priority: "low", status: "upcoming" },
      ],
      NOW,
    );

    expect(answer.kind).toBe("threshold");
    const byId = new Map(answer.findings.map((f) => [f.deadlineId, f]));
    expect(byId.get("d1")?.risk).toBe("overdue");
    expect(byId.get("d1")?.daysFromNow).toBe(-9);
    expect(byId.get("d2")?.risk).toBe("due-soon");
    expect(byId.get("d3")?.risk).toBe("on-track");
    // At-risk findings come first, so the answer leads with the problem.
    expect(answer.findings[0]!.deadlineId).toBe("d1");
  });

  it("reports a declared status that contradicts the date rather than trusting it", () => {
    const answer = answerDelayRisk(
      [{ id: "d1", title: "claimed done", date: "2026-10-01T00:00:00.000Z", status: "met" }],
      NOW,
    );
    const finding = answer.findings[0]!;
    expect(finding.risk).toBe("overdue");
    expect(finding.statusContradiction).toContain('declared "met"');
    expect(answer.contradictions).toBe(1);
    expect(answer.evidence).toContain("contradicts their date and are reported rather than resolved");
  });

  it("reports the reverse contradiction too — declared at risk but on track", () => {
    const answer = answerDelayRisk(
      [{ id: "d1", title: "worried", date: "2026-12-31T00:00:00.000Z", status: "at_risk" }],
      NOW,
    );
    expect(answer.findings[0]!.risk).toBe("on-track");
    expect(answer.findings[0]!.statusContradiction).toContain('declared "at_risk"');
  });

  it("stays silent when the declared status agrees with the date", () => {
    const answer = answerDelayRisk(
      [{ id: "d1", title: "honest", date: "2026-10-01T00:00:00.000Z", status: "overdue" }],
      NOW,
    );
    expect(answer.findings[0]!.statusContradiction).toBeUndefined();
    expect(answer.contradictions).toBe(0);
  });

  it("treats an unparseable date as the worst case, never as on-track", () => {
    const answer = answerDelayRisk([{ id: "d1", title: "broken", date: "next tuesday", status: "upcoming" }], NOW);
    expect(answer.findings[0]!.risk).toBe("overdue");
    expect(Number.isNaN(answer.findings[0]!.daysFromNow)).toBe(true);
    expect(answer.findings[0]!.statusContradiction).toContain("could not be parsed");
  });

  it("honours a stated due-soon window", () => {
    const deadlines = [{ id: "d1", title: "in ten days", date: "2026-10-20T00:00:00.000Z", status: "upcoming" }];
    expect(answerDelayRisk(deadlines, NOW).findings[0]!.risk).toBe("on-track");
    expect(answerDelayRisk(deadlines, NOW, { dueSoonDays: 14 }).findings[0]!.risk).toBe("due-soon");
    expect(DUE_SOON_DAYS).toBe(7);
  });
});

describe("question 3 — a counterfactual is refused, not fabricated", () => {
  it("returns cannot-simulate and names what is missing", () => {
    const answer = answerCounterfactual("if I postpone the release by a week");

    expect(answer.kind).toBe("counterfactual");
    expect(answer.simulated).toBe(false);
    expect(answer.reason).toBe("no-observed-transitions");
    expect(answer.missing).toContain("(state, action, next-state) transitions");
    expect(answer.evidence).toContain("refused rather than guessed");
    // The point: no forecast field exists at all.
    expect("forecast" in answer).toBe(false);
    expect("nextWeek" in answer).toBe(false);
  });
});

describe("the three answers are distinguishable by kind", () => {
  it("labels each one, so a guess cannot read as arithmetic", () => {
    const kinds = [
      answerWorkload([]).kind,
      answerDelayRisk([], NOW).kind,
      answerCounterfactual("x").kind,
    ];
    expect(kinds).toEqual(["sum", "threshold", "counterfactual"]);
  });
});
