/**
 * Deciding an approval that is no longer awaiting a decision is not a server fault.
 *
 * An audit found it answering 500, because `ApprovalService.resolve` threw a plain
 * `Error` and the API's only option was the 500 fallback. The record is still
 * there — the audit log keeps it, with the decision taken or with `expired` — so
 * what failed is a conflict with the record's state: not a missing resource, and
 * not a malfunction.
 */
import { describe, expect, it } from "vitest";
import { ApprovalNotPendingError, ApprovalService } from "../src/policy/approval-service.js";

const descriptor = {
  id: "filesystem.write",
  version: "1",
  description: "test capability",
  risk: "workspace_write",
  sideEffect: true,
  source: "core",
} as never;

const context = {
  tenantId: "local",
  sessionId: "sess-1",
  familyId: "sess-1",
  turnId: "turn-1",
  toolCallId: "call-1",
  source: "api",
  workspacePath: "/tmp/haf-approval-test",
  idempotencyKey: "approval-test-1",
} as never;

describe("an approval that is no longer pending", () => {
  it("reports a typed conflict rather than a generic failure", () => {
    const service = new ApprovalService();
    // The shape an audit hit: a reviewer answers an approval that has already
    // been resolved, or one that expired while they were reading it.
    const error = (() => {
      try {
        service.resolve("never-existed", "approve_once", "reviewer");
        return undefined;
      } catch (thrown) {
        return thrown as ApprovalNotPendingError;
      }
    })();
    expect(error).toBeInstanceOf(ApprovalNotPendingError);
    expect(error?.code).toBe("HAF-3007");
    expect(error?.approvalId).toBe("never-existed");
  });

  it("says the same thing about an approval that expired by timeout", async () => {
    // No reviewer is bound, which is the path that has a timeout at all: when a
    // reviewer *is* bound the service awaits it directly and the timer never
    // arms. So this is the audit's scenario — the request sits, the window
    // elapses, the service resolves it as not-approved, and a decision that
    // arrives afterwards hits a record that is no longer pending.
    const service = new ApprovalService(30);
    const seen: string[] = [];
    service.subscribe((request: { id: string }) => {
      if (!seen.includes(request.id)) seen.push(request.id);
    });

    const approved = await service.request(descriptor, { path: "x.txt" }, context, "test");
    expect(approved).toBe(false);
    expect(seen).toHaveLength(1);

    expect(() => service.resolve(seen[0]!, "approve_once", "reviewer")).toThrow(
      ApprovalNotPendingError,
    );
  });

  it("does not claim the record is missing", () => {
    const service = new ApprovalService();
    // A 404 would tell a client to stop retrying something that was real and is
    // still in the audit log. The message says what actually happened.
    const message = (() => {
      try {
        service.resolve("appr-gone", "deny", "reviewer");
        return "";
      } catch (thrown) {
        return (thrown as Error).message;
      }
    })();
    expect(message).toContain("already resolved or it expired");
    expect(message).not.toContain("not found");
  });
});
