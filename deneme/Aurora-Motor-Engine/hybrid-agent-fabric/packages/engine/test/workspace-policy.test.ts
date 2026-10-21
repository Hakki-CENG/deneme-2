/**
 * A session's workspace path is a privilege boundary.
 *
 * An independent audit opened a session on `C:\Windows` and read `win.ini` back
 * through the ordinary file tools: `POST /v1/sessions` accepts `workspacePath` as
 * an unvalidated string and the supervisor handed it straight to `mkdir`. The
 * cases below drive the real engine where the behaviour matters, and the policy
 * function directly where the platform-specific edges are.
 */
import { mkdtemp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HybridAgentEngine } from "../src/engine.js";
import {
  WorkspacePathRejectedError,
  deniedWorkspaceRoots,
  resolveWorkspacePath,
} from "../src/runtime/workspace-policy.js";

const engines: HybridAgentEngine[] = [];
afterEach(async () => await Promise.all(engines.splice(0).map((engine) => engine.shutdown())));

async function bootEngine(extra?: { allowedWorkspaceRoots?: readonly string[] }): Promise<HybridAgentEngine> {
  const engine = new HybridAgentEngine({
    homePath: await mkdtemp(join(tmpdir(), "haf-wspolicy-")),
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
    ...(extra ? extra : {}),
  });
  engines.push(engine);
  await engine.initialize();
  return engine;
}

describe("a caller-supplied workspace path is checked before anything is created", () => {
  it("refuses a system directory even when no allowlist is configured", async () => {
    const engine = await bootEngine();
    // The audit's scenario. Nothing here depends on Windows: /etc is the same
    // mistake on this platform.
    await expect(
      engine.createSession({ tenantId: "local", name: "escaped", workspacePath: "/etc" }),
    ).rejects.toMatchObject({ code: "HAF-4031" });
  });

  it("refuses a path outside the operator's allowlist", async () => {
    const allowed = await mkdtemp(join(tmpdir(), "haf-wspolicy-allowed-"));
    const outside = await mkdtemp(join(tmpdir(), "haf-wspolicy-outside-"));
    const engine = await bootEngine({ allowedWorkspaceRoots: [allowed] });

    const refusal = await engine
      .createSession({ tenantId: "local", name: "outside", workspacePath: join(outside, "work") })
      .then(
        () => undefined,
        (error: unknown) => error as WorkspacePathRejectedError,
      );
    expect(refusal?.code).toBe("HAF-4031");
    // A caller can ask for a workspace path as often as it likes, so the reason
    // must not describe where the operator *does* allow work. The roots are kept
    // in a field that is logged and never sent.
    expect(refusal?.reason).not.toContain(allowed);
    expect(refusal?.detail).toContain(allowed);

    const session = await engine.createSession({
      tenantId: "local",
      name: "inside",
      workspacePath: join(allowed, "work"),
    });
    expect(session.workspacePath).toBe(join(allowed, "work"));
  });

  it("still derives the default workspace from the engine's own root", async () => {
    const engine = await bootEngine({ allowedWorkspaceRoots: [await mkdtemp(join(tmpdir(), "haf-wspolicy-narrow-"))] });
    const session = await engine.createSession({ tenantId: "local", name: "default" });
    // The default must not be blocked by an allowlist the operator set for
    // caller-supplied paths.
    expect(session.workspacePath.includes("workspaces")).toBe(true);
  });
});

describe("the deny list refuses the directory itself, not everything under it", () => {
  it("names the roots it refuses", () => {
    const denied = deniedWorkspaceRoots();
    expect(denied).toContain("/etc");
    expect(denied).toContain("/usr");
    // The home directory holds credentials, so it is refused as a workspace…
    expect(denied).toContain(resolve(homedir()));
  });

  it("allows an ordinary project directory beneath a refused one", () => {
    // Denying `/usr` must not stop someone working in `/usr/local/src/project`.
    const result = resolveWorkspacePath({ workspacePath: "/usr/local/src/project" });
    expect(result.resolved).toBe("/usr/local/src/project");
    expect(result.basis).toBe("not-denied");
  });

  it("allows a subdirectory of the home directory", () => {
    const result = resolveWorkspacePath({ workspacePath: join(homedir(), "projects", "aurora") });
    expect(result.basis).toBe("not-denied");
  });

  it("refuses the home directory itself", () => {
    expect(() => resolveWorkspacePath({ workspacePath: homedir() })).toThrow(WorkspacePathRejectedError);
  });

  it("refuses a relative path rather than resolving it against the server's cwd", () => {
    // A relative path would land wherever the server happened to start, which is
    // not a workspace anyone chose.
    expect(() => resolveWorkspacePath({ workspacePath: "work/thing" })).toThrow(/must be absolute/);
  });

  it("refuses an empty path", () => {
    expect(() => resolveWorkspacePath({ workspacePath: "   " })).toThrow(/empty/);
  });

  it("collapses traversal before deciding", () => {
    // `/etc/../etc` must not slip past a textual comparison.
    expect(() => resolveWorkspacePath({ workspacePath: "/etc/../etc" })).toThrow(WorkspacePathRejectedError);
    const result = resolveWorkspacePath({ workspacePath: "/usr/local/src/../src/project" });
    expect(result.resolved).toBe("/usr/local/src/project");
  });

  it("treats a trailing separator as the same directory", () => {
    expect(() => resolveWorkspacePath({ workspacePath: "/etc/" })).toThrow(WorkspacePathRejectedError);
  });

  it("reports which rule accepted the path", () => {
    const root = resolve("/tmp/root");
    expect(resolveWorkspacePath({ workspacePath: "/tmp/root/session", workspaceRoot: root }).basis).toBe(
      "workspace-root",
    );
    expect(resolveWorkspacePath({ workspacePath: "/elsewhere/work", allowedRoots: ["/elsewhere"] }).basis).toBe(
      "allowlist",
    );
  });

  it("lets the engine's own roots through even when an allowlist is in force", () => {
    const result = resolveWorkspacePath({
      workspacePath: "/srv/haf/workspaces/abc",
      allowedRoots: ["/somewhere/else"],
      workspaceRoot: "/srv/haf/workspaces",
    });
    expect(result.basis).toBe("allowlist");
  });
});
