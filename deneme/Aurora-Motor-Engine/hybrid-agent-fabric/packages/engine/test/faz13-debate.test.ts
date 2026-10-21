/**
 * FAZ 13 1/3 — a debate records the conflict it resolves.
 *
 * The load-bearing case is the first: a majority that wins still leaves the
 * losing position's evidence on the record, because a resolution that deleted
 * the objection is how a wrong answer survives.
 */

import { describe, expect, it } from "vitest";

import { distinctSources, hasEvidence, isActionable, resolveDebate } from "../src/society/debate.js";
import type { Position } from "../src/society/debate.js";

const causeIsMemory = (expert: string, source: string): Position => ({
  expert,
  source,
  stance: "the outage was caused by memory pressure",
  evidence: ["heap grew to 1.9 GB before the OOM kill"],
});

const causeIsNetwork = (expert: string, source: string): Position => ({
  expert,
  source,
  stance: "the outage was caused by network partition",
  evidence: ["retries to the primary timed out for 40 s"],
});

describe("rule 1 — a majority does not delete the dissent", () => {
  it("keeps the overruled position and its evidence on the record", () => {
    const resolution = resolveDebate("why did the service go down", [
      causeIsMemory("diagnostics", "static-analysis"),
      causeIsMemory("profiler", "runtime-metrics"),
      causeIsNetwork("tracing", "trace-store"),
    ]);

    expect(resolution.outcome).toBe("resolved");
    expect(resolution.adopted).toBe("the outage was caused by memory pressure");
    // The point: the losing position is still there, with its evidence.
    expect(resolution.overruled).toHaveLength(1);
    expect(resolution.overruled[0]!.evidence).toEqual(["retries to the primary timed out for 40 s"]);
    expect(resolution.positions).toHaveLength(3);
    expect(resolution.summary).toContain("the overruled evidence stays on the record");
    expect(isActionable(resolution)).toBe(true);
  });

  it("resolves unanimously with nothing overruled", () => {
    const resolution = resolveDebate("why", [
      causeIsMemory("a", "s1"),
      causeIsMemory("b", "s2"),
    ]);
    expect(resolution.outcome).toBe("resolved");
    expect(resolution.overruled).toEqual([]);
  });
});

describe("rule 2 — a tie is a tie", () => {
  it("refuses to break an even split", () => {
    const resolution = resolveDebate("why", [
      causeIsMemory("a", "s1"),
      causeIsNetwork("b", "s2"),
    ]);
    expect(resolution.outcome).toBe("tie");
    expect(resolution.resolved).toBe(false);
    expect(resolution.adopted).toBeUndefined();
    expect(isActionable(resolution)).toBe(false);
  });

  it("does not break a tie by order of arrival", () => {
    // The same two positions, submitted the other way round.
    const resolution = resolveDebate("why", [
      causeIsNetwork("b", "s2"),
      causeIsMemory("a", "s1"),
    ]);
    expect(resolution.outcome).toBe("tie");
  });
});

describe("rule 3 — an evidence-free position cannot win", () => {
  it("refuses to resolve a debate between unsupported opinions", () => {
    const resolution = resolveDebate("why", [
      { expert: "a", source: "s1", stance: "memory", evidence: [] },
      { expert: "b", source: "s2", stance: "memory", evidence: [] },
      { expert: "c", source: "s3", stance: "network", evidence: [] },
    ]);
    expect(resolution.outcome).toBe("unresolved");
    expect(resolution.summary).toContain("volume contest");
    expect(isActionable(resolution)).toBe(false);
  });

  it("lets a single evidence-bearing position beat an unsupported majority", () => {
    const resolution = resolveDebate("why", [
      { expert: "a", source: "s1", stance: "the outage was caused by memory pressure", evidence: [] },
      { expert: "b", source: "s2", stance: "the outage was caused by memory pressure", evidence: [] },
      causeIsNetwork("c", "s3"),
    ]);
    expect(resolution.outcome).toBe("resolved");
    expect(resolution.adopted).toBe("the outage was caused by network partition");
    expect(resolution.overruled).toHaveLength(2);
  });

  it("does not count whitespace as evidence", () => {
    expect(hasEvidence({ expert: "a", source: "s", stance: "x", evidence: ["   ", ""] })).toBe(false);
    expect(hasEvidence({ expert: "a", source: "s", stance: "x", evidence: ["one real observation"] })).toBe(true);
  });
});

describe("rule 4 — independence", () => {
  it("counts one expert holding three aliases as one opinion", () => {
    const resolution = resolveDebate("why", [
      causeIsMemory("a", "same-source"),
      causeIsMemory("b", "same-source"),
      causeIsMemory("c", "same-source"),
      causeIsNetwork("d", "other-source"),
    ]);
    // 1 source for memory against 1 for network: a tie, not a 3-1 win.
    expect(resolution.outcome).toBe("tie");
    expect(resolution.independentSources).toBe(2);
  });

  it("does not count an abstention as agreement", () => {
    const resolution = resolveDebate("why", [
      causeIsMemory("a", "s1"),
      { expert: "b", source: "s2", stance: "the outage was caused by memory pressure", evidence: ["x"], abstained: true },
    ]);
    expect(resolution.abstentions).toBe(1);
    expect(resolution.summary).toContain("were not counted as agreement");
  });

  it("reports distinct sources", () => {
    expect(distinctSources([causeIsMemory("a", "s1"), causeIsMemory("b", "s1"), causeIsNetwork("c", "s2")])).toBe(2);
  });
});

describe("nothing taken, nothing resolved", () => {
  it("reports unresolved when every expert abstained", () => {
    const resolution = resolveDebate("why", [
      { expert: "a", source: "s1", stance: "memory", evidence: ["x"], abstained: true },
      { expert: "b", source: "s2", stance: "network", evidence: ["y"], abstained: true },
    ]);
    expect(resolution.outcome).toBe("unresolved");
    expect(resolution.abstentions).toBe(2);
    expect(isActionable(resolution)).toBe(false);
  });

  it("reports unresolved for an empty panel", () => {
    const resolution = resolveDebate("why", []);
    expect(resolution.outcome).toBe("unresolved");
    expect(resolution.positions).toEqual([]);
  });
});
