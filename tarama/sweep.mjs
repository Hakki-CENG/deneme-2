/**
 * Objective metadata sweep over every repository the master plan names.
 *
 * Uses shields.io rather than the GitHub API on purpose: the unauthenticated
 * API allows 60 requests/hour, and 1064 repositories at three metrics each is
 * 3192 requests, which is 53 hours of quota. shields.io is a cache in front of
 * the same data and imposes no such limit at this volume.
 *
 * What this can establish, and what it cannot:
 *
 *   CAN: is it alive, what licence, what language, how recently pushed, is it
 *        archived, did the link in the plan go stale.
 *   CANNOT: is it good. Quality needs benchmarking, and the plan itself forbids
 *        inferring it from stars or README claims.
 *
 * Resumable: results are appended to results.jsonl as they arrive, and any
 * repository already present is skipped on a re-run. Interrupting it costs
 * nothing.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";

const REPOS = readFileSync(new URL("./repos.txt", import.meta.url), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const OUT = new URL("./results.jsonl", import.meta.url);
const METRICS = ["license", "last-commit", "languages/top", "stars"];

/** Anything already measured, so a re-run continues instead of restarting. */
function loadDone() {
  const done = new Map();
  if (!existsSync(OUT)) return done;
  for (const line of readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.repo) done.set(row.repo, row);
    } catch {
      /* a truncated tail line is not fatal; it will be re-fetched */
    }
  }
  return done;
}

async function badge(repo, metric, attempt = 0) {
  const url = `https://img.shields.io/github/${metric}/${repo}.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        return badge(repo, metric, attempt + 1);
      }
      return `HTTP ${res.status}`;
    }
    if (res.status === 404) return "not-found";
    const json = await res.json();
    const value = String(json?.value ?? "unknown");
    // shields.io reports a missing repo as "repo not found"
    return value;
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return badge(repo, metric, attempt + 1);
    }
    return `error:${String(err?.name ?? err).slice(0, 30)}`;
  }
}

async function measure(repo) {
  const [license, lastCommit, language, stars] = await Promise.all(
    METRICS.map((m) => badge(repo, m)),
  );
  return {
    repo,
    license: license === "no license" ? "NONE" : license,
    lastCommit,
    language,
    stars,
    fetchedAt: new Date().toISOString().slice(0, 10),
  };
}

/** Bounded concurrency: enough to be quick, not enough to look like an attack. */
async function pool(items, size, worker) {
  let index = 0;
  let completed = 0;
  const runners = Array.from({ length: size }, async () => {
    while (index < items.length) {
      const item = items[index++];
      const row = await worker(item);
      appendFileSync(OUT, JSON.stringify(row) + "\n");
      completed += 1;
      if (completed % 25 === 0) {
        process.stdout.write(`\r  ${completed}/${items.length} repo`);
      }
    }
  });
  await Promise.all(runners);
  process.stdout.write(`\r  ${items.length}/${items.length} repo\n`);
}

const done = loadDone();
const todo = REPOS.filter((repo) => !done.has(repo));

process.stdout.write(
  `${REPOS.length} repo in the plan, ${done.size} already measured, ${todo.length} to fetch\n`,
);

if (todo.length > 0) {
  await pool(todo, 6, measure);
}

// Final tally, so the sweep reports what it found rather than just finishing.
const all = loadDone();
const rows = [...all.values()];
const tally = {
  measured: rows.length,
  missing: rows.filter((r) => r.lastCommit === "not-found" || r.license === "not-found").length,
  noLicense: rows.filter((r) => r.license === "NONE").length,
  byLicense: {},
};
for (const r of rows) {
  tally.byLicense[r.license] = (tally.byLicense[r.license] ?? 0) + 1;
}
writeFileSync(new URL("./tally.json", import.meta.url), JSON.stringify(tally, null, 2));
process.stdout.write(
  `measured ${tally.measured} | link gone ${tally.missing} | no licence ${tally.noLicense}\n`,
);
