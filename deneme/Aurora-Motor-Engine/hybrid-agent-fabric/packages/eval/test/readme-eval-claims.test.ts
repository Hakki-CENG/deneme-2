/**
 * The numbers this README states about `eval:validate` are the numbers the suite measures.
 *
 * An audit read "60/60 discriminative" alongside "a non-acting model scores 0/61"
 * in the same table and could not tell which was right. Both were: the suite has
 * 61 tasks, one of which is not statically evaluable, so 60 are evaluated and all
 * 60 discriminate. Nothing pinned either figure, so adding a task would have left
 * the README stating a count the suite no longer produced — the familiar shape of
 * a number written once and later read as a measurement still being taken.
 *
 * The audit also reported two broken tasks and a score of 58/60. Measured here
 * `brokenCriteria` is 0 and `discriminative` is 60 of 60, so that part is recorded
 * as not reproduced rather than quietly closed.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateCoreSuite } from "../src/runner/criteria-validation.js";

describe("the README's eval:validate row", () => {
  it("matches what the suite actually measures", async () => {
    const report = await validateCoreSuite();
    const readmePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../README.md");
    const readme = await readFile(readmePath, "utf8");
    const row = readme
      .split("\n")
      .find((line) => line.startsWith("| `eval:validate` |"));
    expect(row, "the eval:validate row is missing from the README").toBeDefined();

    // Every figure the row states, checked against the report rather than
    // hard-coded here, so the test fails when the suite changes and the prose
    // does not.
    expect(row).toContain(`${report.discriminative}/${report.evaluatedTasks} discriminative`);
    expect(row).toContain(`of ${report.totalTasks} tasks`);
    expect(row).toContain(`${report.skippedTasks} skipped`);
    expect(row).toContain(`${report.byDesignNoop} no-ops by design`);
    expect(row).toContain(`${report.withReferenceSolution} with a reference solution`);
  }, 240_000);

  it("measures what it claims to, and says which part is thin", async () => {
    const report = await validateCoreSuite();
    // The two claims the row makes and the suite backs.
    expect(report.vacuous).toBe(0);
    expect(report.brokenCriteria).toBe(0);
    expect(report.discriminative).toBe(report.evaluatedTasks);

    // Stated because it is the part a reader would otherwise over-read: a task
    // discriminates when its criteria reject an empty workspace, and only the
    // twelve with a reference solution also have a known-good answer accepted.
    expect(report.withReferenceSolution).toBeLessThan(report.evaluatedTasks);
  }, 240_000);
});
