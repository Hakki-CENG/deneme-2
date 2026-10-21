/**
 * Closing the last strategy that was decided and never applied: `request_permission`.
 *
 * The measured defect, before this existed. `classifyFailure` reports
 * `permission_gap` for "permission denied"; `chooseRecovery` answers
 * `request_permission` with `canContinue: true`; and nothing in the loop handled
 * that strategy. A task that could never succeed ran the whole attempt budget
 * re-issuing the identical denied operation — measured at three agent calls for
 * `maxAttempts: 3` — while gap detection named the permission gap on every one
 * of them. The report's only escalation line was "Exhausted 3 recovery
 * attempts; escalating rather than looping", with nothing escalated.
 *
 * Repeating an operation that was just denied is not a strategy, so the loop now
 * stops at the first denial and says why.
 *
 * What is deliberately NOT here: a wiring from the engine to `ApprovalService`.
 * That would need a `CapabilityContext` — `sessionId`, `turnId`, `toolCallId`,
 * all required — and a `TaskContext` has no turn or tool-call identity to offer.
 * Synthesising them would write invented identifiers into an approval record a
 * human then reads. The last test pins that the loop says "could not be
 * requested" rather than quietly inventing an ask.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UnifiedExecutionLoop } from "../src/execution/unified-execution-loop.js";

const DENIED = "permission denied: cannot write to /var/lib/aurora/state";

let workspace: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "haf-perm-"));
});
afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function deniedResult(extra: Record<string, unknown> = {}) {
  return { completed: false, summary: DENIED, error: DENIED, ...extra };
}

function evidence(report: { outcomes?: readonly { status: string; evidence: string }[] }) {
  return (report.outcomes ?? []).map((o) => `${o.status}: ${o.evidence}`);
}

describe("request_permission does what its name says", () => {
  it("stops at the first denial instead of spending the attempt budget on it", async () => {
    let calls = 0;
    const loop = new UnifiedExecutionLoop(
      {
        runAgent: async () => {
          calls += 1;
          return deniedResult();
        },
      },
      { maxAttempts: 3 },
    );

    const report = await loop.run({ tenantId: "t", goal: "write the state file", workspace });

    // The regression this closes: three identical calls against one denial.
    expect(calls).toBe(1);
    const lines = evidence(report);
    expect(lines.some((l) => l.startsWith("blocked:") && /no authorisation provider/.test(l))).toBe(true);
    expect(lines.some((l) => /not retrying an operation that was just denied/.test(l))).toBe(true);
  });

  it("retries when authorisation is actually granted", async () => {
    let calls = 0;
    const asked: Array<{ attempt: number; operation: string | undefined }> = [];

    const loop = new UnifiedExecutionLoop(
      {
        runAgent: async () => {
          calls += 1;
          return calls === 1 ? deniedResult({ failedTool: "fs.write" }) : { completed: true, summary: "written" };
        },
        requestPermission: async ({ attempt, operation }) => {
          asked.push({ attempt, operation });
          return true;
        },
      },
      { maxAttempts: 3 },
    );

    const report = await loop.run({ tenantId: "t", goal: "write the state file", workspace });

    expect(asked).toEqual([{ attempt: 1, operation: "fs.write" }]);
    expect(calls).toBe(2);
    expect(evidence(report).some((l) => /Authorisation granted on attempt 1/.test(l))).toBe(true);
  });

  it("stops when authorisation is asked for and refused", async () => {
    let calls = 0;
    const loop = new UnifiedExecutionLoop(
      {
        runAgent: async () => {
          calls += 1;
          return deniedResult();
        },
        requestPermission: async () => false,
      },
      { maxAttempts: 3 },
    );

    const report = await loop.run({ tenantId: "t", goal: "write the state file", workspace });

    expect(calls).toBe(1);
    // "Asked and refused" and "nobody could be asked" are different facts, and
    // only one of them happened. The report must not blur them.
    expect(
      evidence(report).some((l) => l.startsWith("blocked:") && /was requested on attempt 1 and refused/.test(l)),
    ).toBe(true);
  });

  it("does not read a provider that throws as either answer", async () => {
    let calls = 0;
    const loop = new UnifiedExecutionLoop(
      {
        runAgent: async () => {
          calls += 1;
          return deniedResult();
        },
        requestPermission: async () => {
          throw new Error("the reviewer channel is down");
        },
      },
      { maxAttempts: 3 },
    );

    const report = await loop.run({ tenantId: "t", goal: "write the state file", workspace });

    expect(calls).toBe(1);
    const lines = evidence(report);
    expect(lines.some((l) => /Authorisation could not be requested: the reviewer channel is down/.test(l))).toBe(true);
    // Throwing is not a refusal: the loop still stops, but records the third fact.
    expect(lines.some((l) => /was requested on attempt 1 and refused/.test(l))).toBe(false);
  });

  it("says authorisation could not be requested rather than inventing an ask", async () => {
    const loop = new UnifiedExecutionLoop(
      { runAgent: async () => deniedResult() },
      { maxAttempts: 3 },
    );

    const report = await loop.run({ tenantId: "t", goal: "write the state file", workspace });

    const lines = evidence(report);
    expect(lines.some((l) => /no authorisation provider was supplied/.test(l))).toBe(true);
    // Nothing may claim an approval was sought.
    expect(lines.some((l) => /Authorisation was requested/.test(l))).toBe(false);
  });

  it("leaves ordinary failures retrying exactly as before", async () => {
    // The guard that this did not turn every failure into a stop. A timeout is
    // a transient, retryable condition and must still use the attempt budget.
    let calls = 0;
    const loop = new UnifiedExecutionLoop(
      {
        runAgent: async () => {
          calls += 1;
          return { completed: false, summary: "timed out", error: "The request timed out after 30000ms" };
        },
      },
      { maxAttempts: 3 },
    );

    const report = await loop.run({ tenantId: "t", goal: "fetch the report", workspace });

    expect(calls).toBe(3);
    expect(evidence(report).some((l) => /no authorisation provider/.test(l))).toBe(false);
  });
});
