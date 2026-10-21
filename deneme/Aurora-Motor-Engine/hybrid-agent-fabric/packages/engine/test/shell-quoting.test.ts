/**
 * One argument, quoted for the shell the sandbox will actually run.
 *
 * The sandbox invokes `cmd.exe` on Windows and `/bin/bash` elsewhere
 * (`sandbox/sandbox.ts`), and `worktree-service` used to emit POSIX single quotes
 * unconditionally. On Windows that meant a branch named `feature/x` reached git as
 * the literal `'feature/x'`, quotes and all.
 *
 * The POSIX cases below are executed against a real shell rather than asserted as
 * strings, because a quoting rule that looks right and does not round-trip is the
 * whole failure mode. The `cmd.exe` cases cannot be executed here — there is no
 * `cmd.exe` in this environment — so they are checked against the documented
 * rules and that limitation is stated rather than hidden.
 */
import { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";
import { quoteForShell } from "../src/repositories/worktree-service.js";

/** Ask a real bash what it makes of the quoted argument. */
function bashRoundTrip(quoted: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("/bin/bash", ["-c", `printf %s ${quoted}`], (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

describe("quoting for /bin/bash", () => {
  it("round-trips a plain argument", async () => {
    await expect(bashRoundTrip(quoteForShell("feature/x", "linux"))).resolves.toBe("feature/x");
  });

  it("round-trips a path with spaces", async () => {
    await expect(bashRoundTrip(quoteForShell("/home/me/my repo", "linux"))).resolves.toBe(
      "/home/me/my repo",
    );
  });

  it("round-trips an argument containing a single quote", async () => {
    // The case the escape sequence exists for.
    await expect(bashRoundTrip(quoteForShell("it's", "linux"))).resolves.toBe("it's");
  });

  it("does not let shell metacharacters through", async () => {
    // If the quoting were wrong, `$(...)` would be expanded and this would return
    // the command's output instead of the literal text.
    await expect(bashRoundTrip(quoteForShell("$(echo pwned)", "linux"))).resolves.toBe(
      "$(echo pwned)",
    );
    await expect(bashRoundTrip(quoteForShell("a; rm -rf /", "linux"))).resolves.toBe("a; rm -rf /");
  });
});

describe("quoting for cmd.exe", () => {
  // Verified against the documented rules, not executed: cmd.exe is not available
  // in this environment, so these assert the transformation rather than the
  // shell's behaviour.
  it("uses double quotes, which cmd.exe treats as quoting and single quotes do not", () => {
    const quoted = quoteForShell("C:\\Users\\me\\repo", "win32");
    expect(quoted).toBe('"C:\\Users\\me\\repo"');
    expect(quoted.startsWith("'")).toBe(false);
  });

  it("doubles an embedded double quote", () => {
    expect(quoteForShell('say "hi"', "win32")).toBe('"say ""hi"""');
  });

  it("doubles a percent sign, which cmd.exe expands even inside double quotes", () => {
    // `%PATH%` inside double quotes would otherwise be replaced by the variable's
    // value before git ever saw the argument.
    expect(quoteForShell("%PATH%", "win32")).toBe('"%%PATH%%"');
  });

  it("leaves the characters that are not special inside double quotes alone", () => {
    // `^` is cmd.exe's escape character outside quotes but has no meaning inside
    // them, so doubling it here would corrupt the value.
    expect(quoteForShell("a^b", "win32")).toBe('"a^b"');
  });
});

describe("the platform actually in use", () => {
  it("matches the shell this machine will run", () => {
    // No platform argument means the running platform, which is what the call
    // sites rely on.
    const quoted = quoteForShell("feature/x");
    expect(process.platform === "win32" ? quoted.startsWith('"') : quoted.startsWith("'")).toBe(
      true,
    );
  });
});
