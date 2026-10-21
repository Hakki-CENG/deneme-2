/**
 * P1.1: the conversational turn must declare which contract stages it performed.
 *
 * Driven through the real engine and a real session, not a stubbed actor: the
 * value of the change is that a caller reading a turn result can now see that no
 * verifier ran. Asserting it on a hand-built stub would only prove the stub.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { HybridAgentEngine } from "../src/engine.js";

const engines: HybridAgentEngine[] = [];
afterEach(async () => await Promise.all(engines.splice(0).map((engine) => engine.shutdown())));

describe("a conversational turn reports its contract coverage", () => {
  it("performs route/execute/observe and says it verified nothing", async () => {
    const engine = new HybridAgentEngine({
      homePath: await mkdtemp(join(tmpdir(), "haf-p11-conv-")),
      kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
      sandboxBackend: "local",
      model: { provider: "mock" },
    });
    engines.push(engine);

    const session = await engine.createSession({ tenantId: "local", name: "contract probe" });
    const result = await engine.command({
      protocolVersion: 1,
      commandId: randomUUID(),
      clientId: "test",
      tenantId: "local",
      sessionId: session.sessionId,
      kind: "session.prompt",
      source: "user",
      issuedAt: new Date().toISOString(),
      payload: { text: "Say hello." },
    });

    expect(result.status).toBe("completed");
    const contract = (result.result as { contract?: { performed: string[]; missing: string[]; coverage: number } })
      ?.contract;
    expect(contract, "the turn result carries no contract coverage").toBeDefined();
    expect(contract!.performed).toEqual(["route", "execute", "observe"]);
    expect(contract!.missing).toEqual([]);
    expect(contract!.coverage).toBe(1);

    // Coverage counts stages, not correctness. An independent audit measured a
    // turn that claimed to have written a file, never wrote it, and still came
    // back completed with coverage 1 — indistinguishable from a turn that did
    // the work. The turn now says plainly that nothing was verified.
    const verification = (result.result as { verification?: Record<string, unknown> })?.verification;
    expect(verification, "the turn result carries no verification field").toBeDefined();
    expect(verification!.performed).toBe(false);
    expect(String(verification!.reason)).toContain("runs no verifier");
    expect(verification!.toolCalls).toBe(0);
    expect(verification!.toolErrors).toBe(0);
    // No tool ran at all, so "every tool call failed" must not be claimed.
    expect(verification!.allToolCallsFailed).toBe(false);
  });

  it("counts a tool call that succeeded", async () => {
    const engine = new HybridAgentEngine({
      homePath: await mkdtemp(join(tmpdir(), "haf-p11-ok-")),
      kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
      sandboxBackend: "local",
      model: { provider: "mock" },
    });
    engines.push(engine);
    engine.approvals.bindReviewer(async () => ({ autoApproved: true, rationale: "test" }));

    const session = await engine.createSession({ tenantId: "local", name: "tool probe" });
    const result = await engine.command({
      protocolVersion: 1,
      commandId: randomUUID(),
      clientId: "test",
      tenantId: "local",
      sessionId: session.sessionId,
      kind: "session.prompt",
      source: "user",
      issuedAt: new Date().toISOString(),
      payload: { text: 'Please run [tool filesystem.write {"path":"ok.txt","content":"hello"}]' },
    });

    expect(result.status).toBe("completed");
    const verification = (result.result as { verification?: Record<string, unknown> })?.verification;
    expect(verification!.toolCalls).toBe(1);
    expect(verification!.toolErrors).toBe(0);
    expect(verification!.failedTools).toEqual([]);
    expect(verification!.allToolCallsFailed).toBe(false);
  });

  it("counts a tool call that failed, so coverage 1 cannot hide it", async () => {
    const engine = new HybridAgentEngine({
      homePath: await mkdtemp(join(tmpdir(), "haf-p11-fail-")),
      kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
      sandboxBackend: "local",
      model: { provider: "mock" },
    });
    engines.push(engine);
    engine.approvals.bindReviewer(async () => ({ autoApproved: true, rationale: "test" }));

    const session = await engine.createSession({ tenantId: "local", name: "failing tool probe" });
    // The capability exists but the path escapes the workspace, so the call
    // fails. This is the shape the audit found: the model believes it acted.
    const result = await engine.command({
      protocolVersion: 1,
      commandId: randomUUID(),
      clientId: "test",
      tenantId: "local",
      sessionId: session.sessionId,
      kind: "session.prompt",
      source: "user",
      issuedAt: new Date().toISOString(),
      payload: {
        text: 'Please run [tool filesystem.write {"path":"../../escaped.txt","content":"x"}]',
      },
    });

    const verification = (result.result as { verification?: Record<string, unknown> })?.verification;
    expect(verification!.toolCalls).toBe(1);
    expect(verification!.toolErrors).toBe(1);
    expect(verification!.failedTools).toEqual(["filesystem.write"]);
    expect(verification!.allToolCallsFailed).toBe(true);

    // The turn still completes — a chat turn completing is not the same claim as
    // the work succeeding — but coverage alone no longer says it did.
    const contract = (result.result as { contract?: { coverage: number } })?.contract;
    expect(contract!.coverage).toBe(1);
    expect(verification!.performed).toBe(false);
  });
});
