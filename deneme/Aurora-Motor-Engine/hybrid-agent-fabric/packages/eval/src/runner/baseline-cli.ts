/**
 * Baseline CLI: save a measured batch, list what is on disk, and gate a release
 * against the stored baseline.
 *
 * Exit codes are the interface a CI job actually consumes:
 *   0  not blocking
 *   1  blocking — the candidate regressed, a task broke, or safety got worse
 *   2  usage error, unreadable input, or no baseline to compare against
 * A missing baseline exits 2 rather than 0: passing a gate because nobody has
 * measured anything yet is the failure mode this exists to prevent.
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compareAgainstBaseline, listBaselines, saveBaseline } from "../baselines/baseline-store.js";
import type { BaselineRecord } from "../baselines/baseline-store.js";
import { deriveOutcomeMetrics } from "../metrics/outcome-metrics.js";
import type { RunRecord } from "../tasks/types.js";

function usage(): never {
  console.error("usage:");
  console.error("  haf-eval-baseline save    --dir <dir> --runs <file.json> [--label <l>] [--id <id>] [--model <m>]");
  console.error("  haf-eval-baseline compare --dir <dir> --runs <file.json> [--baseline <id>]");
  console.error("  haf-eval-baseline list    --dir <dir>");
  process.exit(2);
}

function arg(name: string, argv: string[]): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function gitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim() || null;
  } catch {
    // Outside a repository, or git unavailable. Recorded as null rather than
    // guessed — provenance we cannot establish must stay visibly unknown.
    return null;
  }
}

async function loadRuns(path: string): Promise<RunRecord[]> {
  const raw = await readFile(resolve(path), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${path}: expected a JSON array of run records`);
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null || typeof (entry as RunRecord).taskId !== "string") {
      throw new Error(`${path}: every entry must be a run record with a taskId`);
    }
  }
  return parsed as RunRecord[];
}

/**
 * An unreadable input must exit 2, never 1. Exit 1 means "the candidate
 * regressed", so letting a malformed runs file surface as an unhandled crash
 * would make a broken measurement look like a failed release gate — the exact
 * confusion a gate exists to prevent.
 */
async function main(): Promise<never> {
const [command, ...argv] = process.argv.slice(2);
const dir = arg("dir", argv);
if (command === undefined || dir === undefined) usage();

if (command === "save") {
  const runsPath = arg("runs", argv);
  if (runsPath === undefined) usage();
  const runs = await loadRuns(runsPath);
  const sha = gitSha();
  const id = arg("id", argv) ?? sha ?? new Date().toISOString().replace(/[:.]/g, "-");
  const record: BaselineRecord = {
    id,
    label: arg("label", argv) ?? id,
    gitSha: sha,
    version: process.env.npm_package_version ?? "unknown",
    model: arg("model", argv) ?? "unknown",
    generatedAt: new Date().toISOString(),
    metrics: deriveOutcomeMetrics(runs),
    runs,
  };
  const written = await saveBaseline(dir, record);
  console.log(`saved ${written}`);
  console.log(`id=${record.id} gitSha=${record.gitSha ?? "unknown"} runs=${runs.length} taskSuccess=${record.metrics.taskSuccess}`);
  process.exit(0);
}

if (command === "list") {
  const listed = await listBaselines(dir);
  if (listed.length === 0) {
    console.log("no baselines");
    process.exit(0);
  }
  for (const b of listed) {
    console.log(`${b.id}  ${b.generatedAt}  sha=${b.gitSha ?? "unknown"}  ${b.label}  model=${b.model}  success=${b.taskSuccess}  runs=${b.runs}`);
  }
  process.exit(0);
}

if (command === "compare") {
  const runsPath = arg("runs", argv);
  if (runsPath === undefined) usage();
  const runs = await loadRuns(runsPath);
  const baselineId = arg("baseline", argv);
  const comparison = await compareAgainstBaseline(dir, runs, baselineId === undefined ? {} : { baselineId });
  if (comparison === null) {
    console.error("no baseline found — refusing to declare an improvement against nothing");
    process.exit(2);
  }
  console.log(`baseline=${comparison.baselineId} verdict=${comparison.verdict} blocking=${comparison.blocking}`);
  console.log(`taskSuccess ${comparison.baselineMetrics.taskSuccess} -> ${comparison.candidateMetrics.taskSuccess}`);
  console.log(`verifiedSuccess ${comparison.baselineMetrics.verifiedSuccess} -> ${comparison.candidateMetrics.verifiedSuccess}`);
  console.log(`falseSuccess ${comparison.baselineMetrics.falseSuccess} -> ${comparison.candidateMetrics.falseSuccess}`);
  console.log(`safetyViolations ${comparison.baselineMetrics.safetyViolations} -> ${comparison.candidateMetrics.safetyViolations}`);
  for (const reason of comparison.reasons) console.log(`  - ${reason}`);
  for (const r of comparison.regressions) console.log(`  regressed task: ${r.taskId} (${r.domain})`);
  process.exit(comparison.blocking ? 1 : 0);
}

usage();
}

main().catch((error: unknown) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
