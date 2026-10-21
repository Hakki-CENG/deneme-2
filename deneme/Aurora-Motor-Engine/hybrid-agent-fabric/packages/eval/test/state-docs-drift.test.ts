/**
 * Drift gate: the state docs must match what the generator produces.
 *
 * `state-docs.test.ts` checks the numbers inside the docs against the code with
 * a tolerance, which is a sanity check — it does NOT catch a stale file. Proven:
 * with CURRENT_STATE.md claiming 282 test files while the repo held 286, that
 * suite still passed 21/21, because the gap is inside tolerance and the suite
 * never compares against the file on disk.
 *
 * A spec that can silently fall behind the code is not authoritative, it is
 * aspirational. This closes that. The committed date is fed back into the
 * generator so the check compares content, not the day it happens to run.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateStateDocs, stateDocPath } from "../src/runner/state-docs-cli.js";

const GENERATED = /\*\*Generated:\*\* (\d{4}-\d{2}-\d{2})/;

describe("committed state docs match the generator", () => {
  const docs = generateStateDocs();

  for (const doc of docs) {
    it(`${doc.file} is not stale`, () => {
      const onDisk = readFileSync(stateDocPath(doc.file), "utf8");
      const stamped = GENERATED.exec(onDisk)?.[1];
      expect(stamped, `${doc.file} has no **Generated:** date line`).toBeDefined();

      // Regenerate with the committed date so only real content can differ.
      const fresh = generateStateDocs(stamped).find((d) => d.file === doc.file);
      expect(fresh, `${doc.file} no longer generated`).toBeDefined();
      if (fresh!.content !== onDisk) {
        const firstDiff = fresh!.content
          .split("\n")
          .findIndex((line, i) => line !== onDisk.split("\n")[i]);
        throw new Error(
          `${doc.file} is stale — run \`npm run docs:state -w @haf/eval\` and commit the result.\n` +
            `First difference at line ${firstDiff + 1}:\n` +
            `  on disk:  ${onDisk.split("\n")[firstDiff]}\n` +
            `  generated: ${fresh!.content.split("\n")[firstDiff]}`,
        );
      }
    });
  }

  it("generates all three authoritative documents", () => {
    expect(docs.map((d) => d.file).sort()).toEqual(["CURRENT_STATE.md", "KNOWN_GAPS.md", "MATURITY_MATRIX.md"]);
  });
});
