/**
 * Lean theorem checking, tested without a Lean toolchain.
 *
 * The toolchain is deliberately not installed here — it is a multi-hundred-megabyte
 * download that belongs on the machine that will use it, not in this workspace. So
 * the cases split three ways, and it matters which is which:
 *
 * - The proposition scan is pure logic and is tested directly.
 * - The capability's handling of `lean` is tested against a *fake* binary: a shell
 *   script that exits 0 or 1 on demand. That exercises the real code path — the temp
 *   file, the spawn, the exit-code branch, the verdict — and proves the wiring works.
 *   It does not prove anything about Lean's kernel.
 * - The cases that need the real kernel are skipped unless `lean` is present.
 *
 * Saying which of those a case is, is the point. A test named "checks a proof" that
 * actually ran a stub would be the exact failure this repository keeps finding.
 */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LEAN_INSTALL_HINT,
  checkLeanSource,
  declaresProposition,
  findLeanBinary,
  leanCheckCapability,
} from "../src/capabilities/lean-check.js";

let workDir = "";
/** A stand-in for the `lean` binary. Exits with the code in FAKE_LEAN_EXIT. */
let fakeLean = "";
let fakeLeanExit = 0;
/** Records what the fake binary was asked to check, so the file handoff is provable. */
let fakeLeanSeen = "";

const realLean = findLeanBinary();

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "haf-lean-test-"));
  fakeLean = join(workDir, "lean");
  // Writes the source it was given to a side file, then exits with the chosen code.
  writeFileSync(
    fakeLean,
    [
      "#!/bin/sh",
      `cp "$1" "${join(workDir, "seen.lean")}" 2>/dev/null || true`,
      `exit ${"$"}{FAKE_LEAN_EXIT:-0}`,
      "",
    ].join("\n"),
  );
  chmodSync(fakeLean, 0o755);
});

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

/** Runs the capability against the fake binary at a chosen exit code. */
async function withFakeLean(source: string, exitCode: number): Promise<Record<string, unknown>> {
  fakeLeanExit = exitCode;
  process.env.FAKE_LEAN_EXIT = String(exitCode);
  const capability = leanCheckCapability({ leanPath: fakeLean });
  return (await capability.execute({ source })) as Record<string, unknown>;
}

describe("the proposition scan, which is pure logic", () => {
  it("recognises the ways a proposition can be introduced", () => {
    expect(declaresProposition("theorem one_plus_one : 1 + 1 = 2 := by norm_num")).toBe(true);
    expect(declaresProposition("lemma helper : True := trivial")).toBe(true);
    expect(declaresProposition("example : 2 + 2 = 4 := by norm_num")).toBe(true);
    // An attribute on the line before is common in real files.
    expect(declaresProposition("@[simp]\ntheorem tagged : True := trivial")).toBe(true);
    expect(declaresProposition("def isProp : Prop := True")).toBe(true);
  });

  it("does not mistake a computation for a proof", () => {
    expect(declaresProposition("#eval 2 + 2")).toBe(false);
    expect(declaresProposition("")).toBe(false);
    expect(declaresProposition("def x : Nat := 4")).toBe(false);
    expect(declaresProposition("-- just a comment\nnamespace Foo\nend Foo")).toBe(false);
  });

  it("is anchored to line starts, so a commented-out proposition is not counted", () => {
    // Measured rather than assumed: the pattern is anchored, so `-- theorem …` at the
    // start of a line does not match. The scan is still lexical — it cannot see that
    // a `theorem` token sits inside a block comment or a string — which is why the
    // capability's checkDetail calls it lexical instead of claiming it establishes
    // that something was proved.
    expect(declaresProposition("-- theorem this is only a comment\n#eval 1")).toBe(false);
    expect(declaresProposition("/- theorem also a comment -/\n#eval 1")).toBe(false);
    // But an indented real proposition is still found.
    expect(declaresProposition("namespace N\n  theorem inner : True := trivial\nend N")).toBe(true);
  });
});

describe("the capability, driven against a stand-in binary", () => {
  it("hands the source to the binary as a file and reads its exit code", async () => {
    const output = await withFakeLean("theorem t : True := trivial", 0);

    expect(output.status).toBe("executed");
    expect(output.accepted).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(output.verified).toBe(true);
    // The source really was written to a file the binary could read.
    const seen = readFileSync(join(workDir, "seen.lean"), "utf8");
    expect(seen).toContain("theorem t");
  });

  it("reports a rejected source as a failure, not as a verified proof", async () => {
    const output = await withFakeLean("theorem t : False := by trivial", 1);

    expect(output.status).toBe("executed");
    expect(output.accepted).toBe(false);
    expect(output.verified).toBe(false);
    const capability = leanCheckCapability({ leanPath: fakeLean });
    const verdict = await capability.verify(output, { source: "x" }, {} as never);
    expect(verdict.ok).toBe(false);
  });

  it("refuses to call a clean check over a file with nothing in it a proof", async () => {
    // The vacuous-pass case: the binary said fine, and fine is not a proof.
    const output = await withFakeLean("#eval 2 + 2", 0);

    expect(output.accepted).toBe(true);
    expect(output.verified).toBe(false);
    expect(output.unchecked).toBe(true);
    expect(String(output.checkDetail)).toContain("nothing was proved");
    expect(String(output.checkDetail)).toContain("lexical");

    const capability = leanCheckCapability({ leanPath: fakeLean });
    const verdict = await capability.verify(output, { source: "#eval 2 + 2" }, {} as never);
    // Not a failure — the file did type-check — but nothing is being claimed.
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain("nothing was proved");
  });

  it("keeps a clean proof verified", async () => {
    const output = await withFakeLean("example : 1 + 1 = 2 := by norm_num", 0);
    expect(output.verified).toBe(true);
    const capability = leanCheckCapability({ leanPath: fakeLean });
    const verdict = await capability.verify(output, { source: "example : 1 + 1 = 2 := by norm_num" }, {} as never);
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain("machine-checked");
  });
});

describe("a missing toolchain is a reported condition", () => {
  it("names the command that installs it", async () => {
    // A path that cannot exist, standing in for a machine with no Lean.
    const capability = leanCheckCapability({ leanPath: join(workDir, "definitely-not-lean") });
    const output = (await capability.execute({ source: "theorem t : True := trivial" })) as Record<string, unknown>;

    // This case used to hang until the test timed out: spawning a path that does
    // not exist emits `error` and never emits `exit`, and the capability only
    // listened for `exit`. It now reports the toolchain as unavailable.
    expect(output.status).toBe("unavailable");
    expect(output.verified).toBe(false);
    expect(String(output.reason)).toContain(LEAN_INSTALL_HINT);
  });

  it("reports unavailable and the install hint when no binary can be found", async () => {
    const result = await checkLeanSource("theorem t : True := trivial", { leanPath: "" });
    // An empty override means "nothing to run", which is the unavailable path.
    expect(result.status === "unavailable" || result.status === "failed").toBe(true);
    if (result.status === "unavailable") {
      expect(result.stderr).toContain(LEAN_INSTALL_HINT);
    }
  });

  it("exposes the install hint so a caller can act on it", () => {
    expect(LEAN_INSTALL_HINT).toContain("install-backends.mjs");
    expect(LEAN_INSTALL_HINT).toContain("--lean");
  });
});

describe.skipIf(!realLean)("the real Lean kernel", () => {
  it("accepts a provable proposition", async () => {
    const capability = leanCheckCapability();
    const output = (await capability.execute({
      source: "example : 1 + 1 = 2 := by norm_num",
    })) as Record<string, unknown>;
    expect(output.status).toBe("executed");
    expect(output.verified).toBe(true);
  });

  it("rejects an unprovable one", async () => {
    const capability = leanCheckCapability();
    const output = (await capability.execute({
      source: "theorem bad : 1 + 1 = 3 := by norm_num",
    })) as Record<string, unknown>;
    expect(output.status).toBe("executed");
    expect(output.accepted).toBe(false);
    expect(output.verified).toBe(false);
  });
});
