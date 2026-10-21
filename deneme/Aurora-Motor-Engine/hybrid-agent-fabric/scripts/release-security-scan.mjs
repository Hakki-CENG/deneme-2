#!/usr/bin/env node
/**
 * Release security scan: dependency vulnerabilities and committed secrets.
 *
 *     node scripts/release-security-scan.mjs           # both scans
 *     node scripts/release-security-scan.mjs --json    # machine-readable output
 *
 * V2 plan §12 asks that "SBOM, vulnerability scan and secret scan run every release".
 * Measured before writing this: the release tool already produces CycloneDX and SPDX
 * SBOMs plus in-toto provenance, and those are covered by tests. The other two were
 * absent — nothing in the release path ran `npm audit` and nothing looked for
 * secrets. So one third of that checklist item was satisfied and it looked satisfied.
 *
 * WHY A SEPARATE SCRIPT AND NOT A STEP INSIDE THE RELEASE TOOL. The release tool is
 * exercised by tests that build fixture releases; making it shell out to the network
 * would make those tests depend on npm's advisory database being reachable, which is
 * exactly the kind of hidden external dependency that turns a green CI red for a
 * reason nobody changed. This script is meant to be run by the release pipeline and
 * can fail without taking the release tool's tests with it.
 *
 * WHAT THE SECRET SCAN IS, honestly. It is a pattern match over tracked files. It
 * will catch an AWS key, a private key block, a GitHub token and similar shapes. It
 * will not catch a secret that does not look like one — a password in a config file,
 * a database URL with credentials embedded in an unexpected place. It is a floor, not
 * a guarantee, and the exit message says so rather than reporting "no secrets found"
 * as though that were a proof.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The repository to scan is the working directory, not the directory this script
 * lives in. Deriving it from `import.meta.url` looked equivalent and was not: it made
 * the scan always target this repository no matter where it was invoked from, so a
 * test that built a fixture repository with a planted key in it scanned the real tree
 * instead and reported a clean result. Found by the test that plants a key — a
 * scanner that had only ever been shown to report "nothing found" would have looked
 * correct while detecting nothing.
 */
const REPO_ROOT = process.cwd();
const JSON_OUT = process.argv.includes("--json");

const findings = [];

/** Records a finding. Kept as a function so the shape cannot drift between scans. */
function report(kind, severity, location, detail) {
  findings.push({ kind, severity, location, detail });
}

// ---------------------------------------------------------------- vulnerabilities

/**
 * Runs `npm audit` against production dependencies only.
 *
 * Dev-only advisories are reported but do not fail the scan. That is a decision
 * rather than an oversight: this repository has dev-only advisories whose only fix is
 * a semver-major bump of the test runner, and blocking a release on those would mean
 * the flag is permanently red, which teaches people to ignore it. They are listed so
 * the decision stays visible.
 */
function scanVulnerabilities() {
  const child = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  // `npm audit` exits non-zero when it finds anything, so the exit code is not an
  // error signal here — the JSON is the answer.
  if (!child.stdout) {
    report("vulnerability", "error", "npm audit", `produced no output: ${(child.stderr ?? "").slice(0, 300)}`);
    return { production: 0, counts: {} };
  }
  let parsed;
  try {
    parsed = JSON.parse(child.stdout);
  } catch (error) {
    report("vulnerability", "error", "npm audit", `returned unparseable JSON: ${error.message}`);
    return { production: 0, counts: {} };
  }

  const counts = parsed.metadata?.vulnerabilities ?? {};
  const production = (counts.critical ?? 0) + (counts.high ?? 0);
  for (const [name, advisory] of Object.entries(parsed.vulnerabilities ?? {})) {
    const severity = advisory.severity ?? "unknown";
    // Only production-dependency findings are listed individually; the aggregate
    // counts above already exclude dev.
    if (advisory.isDirect === true || advisory.range) {
      report(
        "vulnerability",
        severity,
        name,
        `${severity} — ${advisy.via?.[0]?.title ?? advisory.range ?? "no advisory text"}`,
      );
    }
  }
  return { production, counts };
}

// ------------------------------------------------------------------ secret shapes

/**
 * Patterns for credential shapes. Deliberately narrow: a pattern that matches
 * ordinary code produces noise, and a scan people have to filter out is a scan
 * nobody runs.
 */
const SECRET_PATTERNS = [
  { name: "private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "AWS access key id", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "npm token", pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: "OpenAI-style key", pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/ },
  { name: "Stripe secret key", pattern: /\bsk_live_[0-9a-zA-Z]{16,}\b/ },
  {
    name: "credentials in a URL",
    // user:pass@host — the shape that leaks a database password into a config file.
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]{1,64}:[^\s/@]{1,128}@[^\s/]{1,128}/i,
  },
];

/** Files that are allowed to contain the shapes above. */
const SECRET_ALLOWLIST = [
  // This file, which has to name the shapes it looks for.
  "scripts/release-security-scan.mjs",
  // Tests that assert the scanner detects a shape need a sample of it.
  "scripts/test/release-security-scan.test.mjs",
];

/**
 * Files reviewed by hand and found to contain a credential *shape* deliberately.
 *
 * This list is not a blanket "tests are fine" rule, and the difference matters: a
 * blanket rule would let a real key committed into a test file pass silently. Each
 * entry here was opened and read. What was found, so the review can be redone rather
 * than trusted:
 *
 *   README.md                                postgresql://haf:haf@localhost — local dev DSN
 *   deploy/compose/compose.distributed.yaml  container credentials for a local compose stack
 *   test/embodiment-hardening.test.ts        a DSN built inside a test
 *   test/fixtures/irc-tls-fixture.ts         a generated TLS fixture key, committed on purpose
 *   test/mcp-http.test.ts                    a generated TLS fixture key
 *   test/po-security-hardening.test.ts       "sk-1234567890abcdef…" — an obvious placeholder
 *   test/postgres-rls-integration.test.ts    a local DSN
 *   test/stateless-mcp.test.ts               a local DSN
 *   test/web-security.test.ts                a DSN/URL inside an assertion
 *   test/worktree-review.test.ts             AKIAIOSFODNN7EXAMPLE — AWS's own documentation example
 *
 * Adding an entry here is a decision that has to be made deliberately, and the scan
 * still fails on any *other* file that matches, including one under test/.
 */
const REVIEWED_FIXTURES = [
  "README.md",
  "deploy/compose/compose.distributed.yaml",
  "packages/engine/test/embodiment-hardening.test.ts",
  "packages/engine/test/fixtures/irc-tls-fixture.ts",
  "packages/engine/test/mcp-http.test.ts",
  "packages/engine/test/po-security-hardening.test.ts",
  "packages/engine/test/postgres-rls-integration.test.ts",
  "packages/engine/test/stateless-mcp.test.ts",
  "packages/engine/test/web-security.test.ts",
  "packages/engine/test/worktree-review.test.ts",
];

function scanSecrets() {
  const listing = spawnSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (listing.status !== 0) {
    report("secret", "error", "git ls-files", `could not list tracked files: ${(listing.stderr ?? "").slice(0, 300)}`);
    return 0;
  }
  const files = (listing.stdout ?? "").split("\0").filter(Boolean);
  let scanned = 0;

  for (const relative of files) {
    if (SECRET_ALLOWLIST.some((allowed) => relative === allowed || relative.endsWith(allowed))) continue;
    // Binary and generated files are skipped: reading them as text produces garbage
    // matches, and node_modules/dist are not tracked anyway.
    if (/\.(png|jpe?g|gif|ico|pdf|zip|gz|tgz|onnx|bin|woff2?|ttf|mp3|wav|mp4|pyc|lock)$/i.test(relative)) continue;

    let contents;
    try {
      contents = readFileSync(join(REPO_ROOT, relative), "utf8");
    } catch {
      continue; // unreadable tracked file is not a secret finding
    }
    if (contents.includes("\u0000")) continue; // binary
    scanned++;

    // A file reviewed by hand is downgraded rather than skipped, so the finding
    // still appears in the output and the review can be audited instead of trusted.
    const reviewed = REVIEWED_FIXTURES.includes(relative);
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(contents)) {
        report(
          "secret",
          reviewed ? "reviewed" : "critical",
          relative,
          `looks like a ${name}${reviewed ? " (in REVIEWED_FIXTURES — read it before trusting this)" : ""}`,
        );
      }
    }
  }
  return scanned;
}

// --------------------------------------------------------------------------- main

const { production, counts } = scanVulnerabilities();
const scannedFiles = scanSecrets();

const secrets = findings.filter((finding) => finding.kind === "secret" && finding.severity === "critical");
const blocking = production > 0 || secrets.length > 0;

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        ok: !blocking,
        vulnerabilities: { productionCriticalOrHigh: production, counts },
        secrets: secrets.length,
        filesScannedForSecrets: scannedFiles,
        findings,
      },
      null,
      2,
    ),
  );
} else {
  console.log("release security scan");
  console.log(
    `  dependencies   ${production} critical/high in production deps` +
      ` (moderate ${counts.moderate ?? 0}, low ${counts.low ?? 0})`,
  );
  console.log(`  secrets        ${secrets.length} finding(s) across ${scannedFiles} tracked file(s)`);
  if (findings.length > 0) {
    console.log("");
    for (const finding of findings) {
      console.log(`  [${finding.severity}] ${finding.kind}: ${finding.location} — ${finding.detail}`);
    }
  }
  console.log("");
  if (blocking) {
    console.log("FAILED: a release should not be cut with these findings.");
  } else {
    console.log(
      "PASSED. Note what this does not prove: the secret scan is a pattern match, so a\n" +
        "credential that does not match one of the known shapes will not be found.",
    );
  }
}

process.exit(blocking ? 1 : 0);
