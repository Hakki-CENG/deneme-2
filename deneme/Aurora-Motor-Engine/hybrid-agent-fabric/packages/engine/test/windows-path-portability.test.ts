/**
 * Two absolute-path assumptions that only hold on POSIX.
 *
 * Both were found by an audit run on Windows and both were confirmed by reading
 * the code, not by running it: there is no Windows in this environment. What the
 * tests below can do — and do — is exercise the platform-parameterised logic on
 * this machine, so the transformation is pinned even though the OS behaviour is
 * not. Each block says which half is which.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPortableAbsolutePath } from "../src/security/secret-source-registry.js";
import { isNamedPipePath, WorkerProcessManager } from "../src/runtime/worker/worker-process-manager.js";

describe("a secret-source executable path is not required to be POSIX", () => {
  it("accepts a POSIX absolute path", () => {
    expect(isPortableAbsolutePath("/usr/local/bin/op")).toBe(true);
  });

  it("accepts a Windows drive path, which is where op and bw actually live", () => {
    // The case the audit hit: every legitimate Windows secret source was rejected
    // before it could be registered, because the check demanded a leading slash.
    expect(isPortableAbsolutePath("C:\\Program Files\\1Password\\op.exe")).toBe(true);
    expect(isPortableAbsolutePath("c:\\tools\\bw.exe")).toBe(true);
    expect(isPortableAbsolutePath("C:/tools/bw.exe")).toBe(true);
  });

  it("accepts a UNC share path", () => {
    expect(isPortableAbsolutePath("\\\\fileserver\\tools\\op.exe")).toBe(true);
  });

  it("still refuses a relative path", () => {
    // The property being enforced is that the path is absolute. Accepting Windows
    // forms must not become accepting anything.
    expect(isPortableAbsolutePath("op.exe")).toBe(false);
    expect(isPortableAbsolutePath("tools/op")).toBe(false);
    expect(isPortableAbsolutePath(".\\op.exe")).toBe(false);
    expect(isPortableAbsolutePath("")).toBe(false);
  });

  it("does not accept a drive letter with nothing after it", () => {
    // `C:` alone is "the current directory on drive C" in Windows semantics, which
    // is relative in everything but spelling.
    expect(isPortableAbsolutePath("C:")).toBe(false);
    expect(isPortableAbsolutePath("C:\\")).toBe(true);
  });
});

describe("the worker IPC endpoint is a named pipe on Windows", () => {
  const manager = new WorkerProcessManager(join(tmpdir(), "haf-wpm-test"));

  it("uses a Unix socket path on POSIX", () => {
    const path = manager.socketPath("worker-1", "linux");
    expect(path.endsWith(".sock")).toBe(true);
    expect(isNamedPipePath(path)).toBe(false);
  });

  it("uses a named pipe on Windows, which is not a filesystem path", () => {
    const path = manager.socketPath("worker-1", "win32");
    expect(isNamedPipePath(path)).toBe(true);
    expect(path.startsWith("\\\\.\\pipe\\haf-worker-")).toBe(true);
    // A named pipe name carries no directory, so nothing may try to create or
    // unlink one — `mkdir` on `\\.\pipe` fails rather than no-opping.
    expect(path.endsWith(".sock")).toBe(false);
  });

  it("keeps the name short enough for a Unix socket path limit", () => {
    // The digest exists because these paths are commonly capped around 108 bytes.
    // A long manager root must not push the POSIX path past that.
    const longRoot = new WorkerProcessManager(`/${Array.from({ length: 40 }, () => "a-very-long-segment").join("/")}`);
    expect(longRoot.socketPath("a-long-worker-identifier-here", "linux").length).toBeLessThan(108);
  });

  it("gives different workers different endpoints", () => {
    expect(manager.socketPath("worker-1", "win32")).not.toBe(manager.socketPath("worker-2", "win32"));
  });

  it("recognises a named pipe by the value, not by the platform", () => {
    // The callers that skip mkdir and rm test the path they are about to use. If
    // they re-derived the platform instead, the two could disagree.
    expect(isNamedPipePath("\\\\.\\pipe\\anything")).toBe(true);
    expect(isNamedPipePath("/tmp/anything.sock")).toBe(false);
    expect(isNamedPipePath("C:\\not\\a\\pipe")).toBe(false);
  });
});
