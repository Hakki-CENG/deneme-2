/**
 * P1.1: the report must say which contract stages actually ran.
 *
 * The property under test is honesty, not completeness. A minimal run must NOT
 * claim stages it never performed, and a run that supplies the dependencies must
 * show them. Before this, an absent stage and a skipped stage were
 * indistinguishable from outside.
 */
import { describe, expect, it } from "vitest";
import { UnifiedExecutionLoop } from "../src/execution/unified-execution-loop.js";
import { formalVerifier } from "../src/execution/verification-factory.js";

const goal = "Create hello.txt containing Hi";

describe("TaskReport.contract", () => {
  it("does not claim understanding, planning or verification for a bare run", async () => {
    const loop = new UnifiedExecutionLoop(
      { runAgent: async () => ({ completed: true, summary: "done" }) },
      { maxAttempts: 1 },
    );
    const report = await loop.run({ tenantId: "local", goal });

    expect(report.contract.performed).toEqual(["execute", "observe", "verify"]);
    // No understanding dependency, no planner, no recall, no retry.
    expect(report.contract.skipped).toEqual(["understand", "recall", "plan", "route", "recover", "learn"]);
    // `verify` IS performed — the stage runs — but it says so honestly: with no
    // verifier registered the verdict is uncertain and the status unverified.
    // That distinction is the whole point of the contract: "we verified" and
    // "we ran verification and it could not confirm anything" are different.
    expect(report.verification?.status).toBe("unverified");
    expect(report.verification?.verdict).toBe("uncertain");
  });

  it("shows the stages whose dependencies were supplied", async () => {
    const loop = new UnifiedExecutionLoop(
      {
        runAgent: async () => ({ completed: true, summary: "done, created hello.txt with Hi" }),
        understandGoal: async () => ({
          goal,
          constraints: [],
          preferences: [],
          risks: [],
          successCriteria: ["hello.txt contains Hi"],
          missingInformation: [],
          ambiguity: 0,
          recommendation: "act" as const,
          source: "test",
        }),
        recall: async () => ["a relevant memory"],
        plan: async () => [
          { id: "s1", description: "write the file", dependencies: [], expectedOutput: "hello.txt" },
        ],
        verifiersFor: async () => [
          formalVerifier("file", async () => ({ ok: true, output: "hello.txt contains Hi" })),
        ],
      },
      { maxAttempts: 1 },
    );
    const report = await loop.run({ tenantId: "local", goal });

    for (const stage of ["understand", "recall", "plan", "execute", "verify"]) {
      expect(report.contract.performed, `expected ${stage} to be performed`).toContain(stage);
    }
  });

  it("counts a recall that returned nothing as performed — the stage ran", async () => {
    const loop = new UnifiedExecutionLoop(
      { runAgent: async () => ({ completed: true, summary: "done" }), recall: async () => [] },
      { maxAttempts: 1 },
    );
    const report = await loop.run({ tenantId: "local", goal });
    expect(report.contract.performed).toContain("recall");
  });

  it("counts recovery only when the task actually retried", async () => {
    let attempt = 0;
    const loop = new UnifiedExecutionLoop(
      {
        runAgent: async () => {
          attempt += 1;
          return attempt === 1
            ? { completed: false, summary: "failed the first time" }
            : { completed: true, summary: "done" };
        },
        verifiersFor: async () => [
          formalVerifier("file", async () => ({ ok: attempt > 1, output: attempt > 1 ? "ok" : "missing" })),
        ],
      },
      { maxAttempts: 2 },
    );
    const report = await loop.run({ tenantId: "local", goal });
    if (report.attempts > 1) {
      expect(report.contract.performed).toContain("recover");
    } else {
      expect(report.contract.performed).not.toContain("recover");
    }
  });
});

/**
 * The "single contract" half of P1.1.
 *
 * Making coverage visible is only useful while there is still one road. If a
 * second caller starts constructing its own loop, the contract becomes a
 * description of one path among several and the numbers stop meaning anything.
 * This pins the invariant so adding a second execution path fails a test rather
 * than quietly becoming the new normal.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("there is exactly one construction of the execution loop", () => {
  it("keeps UnifiedExecutionLoop constructed in a single place", () => {
    const root = new URL("../src/", import.meta.url).pathname;
    const offenders = sourceFiles(root)
      .map((file) => ({ file, count: (readFileSync(file, "utf8").match(/new UnifiedExecutionLoop\(/g) ?? []).length }))
      .filter((entry) => entry.count > 0);

    expect(offenders.map((o) => `${o.file.split("/src/")[1]}:${o.count}`)).toEqual(["engine.ts:1"]);
  });
});
