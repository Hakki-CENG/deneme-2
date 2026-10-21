/**
 * `@types/node` must track the Node version the project actually requires.
 *
 * Measured before this change: root `package.json` declared
 * `engines.node: ">=22.12.0"`, CI pinned `node-version: 22` in three places and
 * the Dockerfile built and ran on `node:22-bookworm-slim` — but
 * `@types/node` was `^20.17.30`. Every part of the toolchain targeted Node 22
 * except the types.
 *
 * That mismatch fails in both directions. A Node 22 API used in source is a
 * type error even though it works at runtime, so the workaround is a cast —
 * and a cast is how a real type mistake survives review. Meanwhile the v20
 * types still describe APIs that are deprecated or changed in 22, so the
 * compiler happily accepts code the runtime no longer behaves the way the
 * types claim.
 *
 * Bumping the types is only half the job: nothing would stop the two drifting
 * apart again on the next Node upgrade. Hence the assertion below, which reads
 * the real manifests rather than restating a number.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

function rootManifest(): { engines?: { node?: string }; devDependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as never;
}

/** Leading major version from a range such as ">=22.12.0" or "^22.20.5". */
function majorOf(range: string | undefined): number | undefined {
  const match = /(\d+)/.exec(range ?? "");
  return match ? Number(match[1]) : undefined;
}

describe("Node type alignment", () => {
  it("declares a Node engine requirement", () => {
    const engines = rootManifest().engines?.node;
    expect(engines).toBeTruthy();
    expect(majorOf(engines)).toBeGreaterThanOrEqual(22);
  });

  it("pins @types/node to the same major as the engine requirement", () => {
    const manifest = rootManifest();
    const typesRange = manifest.devDependencies?.["@types/node"];
    expect(typesRange).toBeTruthy();
    // This is the assertion that would have failed before: engines major 22,
    // types major 20.
    expect(majorOf(typesRange)).toBe(majorOf(manifest.engines?.node));
  });

  it("has the matching @types/node actually installed, not just declared", () => {
    const declared = majorOf(rootManifest().devDependencies?.["@types/node"]);
    const installed = JSON.parse(
      readFileSync(join(ROOT, "node_modules", "@types", "node", "package.json"), "utf8"),
    ) as { version: string };
    expect(Number(installed.version.split(".")[0])).toBe(declared);
  });

  it("the source tree does not reach for Node APIs the declared types do not know", async () => {
    // A cast to silence a missing type is the usual escape hatch, and it is how
    // the mismatch above stayed invisible. Counting them keeps the number from
    // growing; the baseline is what the tree contained when the types were
    // aligned, so anything new is a deliberate act rather than an accident.
    const { execSync } = await import("node:child_process");
    let count = 0;
    try {
      const out = execSync(
        `grep -rn "as unknown as NodeJS\\|@ts-expect-error.*node" --include=*.ts packages/engine/src apps/control-api/src | wc -l`,
        { cwd: ROOT, encoding: "utf8" },
      );
      count = Number(out.trim());
    } catch {
      count = 0; // grep exits non-zero when there are no matches
    }
    expect(count).toBeLessThanOrEqual(0);
  });
});
