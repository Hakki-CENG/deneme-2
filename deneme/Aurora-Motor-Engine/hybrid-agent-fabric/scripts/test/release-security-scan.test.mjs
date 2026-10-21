/**
 * The release security scan, tested by planting secrets in a fixture repository.
 *
 * A scanner that reports "no secrets found" proves nothing until it has been shown
 * to find one. So these cases build a throwaway git repository, commit a credential
 * of each shape into it, and require the scan to fail — and then require it to pass
 * once the credential is removed. Without the second half, a scanner that always
 * fails would look correct too.
 *
 * Run with: node --test scripts/test/
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCANNER = resolve(HERE, "..", "release-security-scan.mjs");

let fixture = "";

before(() => {
  fixture = mkdtempSync(join(tmpdir(), "haf-secscan-"));
  const git = (...args) => spawnSync("git", args, { cwd: fixture, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "scan@test");
  git("config", "user.name", "scan");
  writeFileSync(join(fixture, "clean.txt"), "nothing to see here\n");
  git("add", "-A");
  git("commit", "-q", "-m", "clean");
});

after(() => {
  // Left in the temp directory; the OS reclaims it.
});

/** Runs the scanner against the fixture and returns its parsed JSON verdict. */
function scan() {
  const child = spawnSync("node", [SCANNER, "--json"], { cwd: fixture, encoding: "utf8" });
  return { status: child.status, body: JSON.parse(child.stdout || "{}") };
}

describe("the release security scan", () => {
  it("passes on a repository with nothing in it", () => {
    const { status, body } = scan();
    assert.equal(status, 0, `expected a clean fixture to pass, got ${JSON.stringify(body.findings)}`);
    assert.equal(body.secrets, 0);
    assert.equal(body.filesScannedForSecrets >= 1, true);
  });

  // Each shape gets its own case, because a pattern that silently stopped matching
  // would otherwise hide behind the others.
  const shapes = [
    ["an AWS access key id", "aws = 'AKIAIOSFODNN7EXAMPLE'\n", "AWS access key id"],
    ["a private key block", "-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----\n", "private key block"],
    ["a GitHub token", "token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'\n", "GitHub token"],
    ["a Stripe secret key", "key = 'sk_live_abcdefghijklmnopqrstuvwx'\n", "Stripe secret key"],
    ["credentials embedded in a URL", "url = 'postgresql://admin:s3cret@db.internal:5432/app'\n", "credentials in a URL"],
  ];

  for (const [label, contents, expectedName] of shapes) {
    it(`detects ${label}`, () => {
      writeFileSync(join(fixture, "leak.txt"), contents);
      spawnSync("git", ["add", "-A"], { cwd: fixture, stdio: "ignore" });
      spawnSync("git", ["commit", "-q", "-m", "leak"], { cwd: fixture, stdio: "ignore" });

      const { status, body } = scan();
      assert.equal(status, 1, `expected the scan to fail on ${label}`);
      assert.equal(body.secrets >= 1, true);
      const found = body.findings.find((finding) => finding.location === "leak.txt");
      assert.ok(found, `expected a finding for leak.txt, got ${JSON.stringify(body.findings)}`);
      assert.match(found.detail, new RegExp(expectedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

      // And it passes again once the credential is gone, which is the half that
      // distinguishes a working scanner from one that always fails.
      writeFileSync(join(fixture, "leak.txt"), "cleaned\n");
      spawnSync("git", ["add", "-A"], { cwd: fixture, stdio: "ignore" });
      spawnSync("git", ["commit", "-q", "-m", "cleaned"], { cwd: fixture, stdio: "ignore" });
      const cleared = scan();
      assert.equal(cleared.status, 0, `expected the scan to pass after removing ${label}`);
    });
  }

  it("does not treat a reviewed fixture as clean without saying so", () => {
    // The reviewed classification downgrades a finding rather than dropping it, so
    // the output still names the file and the review stays auditable.
    const { body } = scan();
    const reviewed = body.findings.filter((finding) => finding.severity === "reviewed");
    for (const finding of reviewed) {
      assert.match(finding.detail, /REVIEWED_FIXTURES/);
    }
  });
});
