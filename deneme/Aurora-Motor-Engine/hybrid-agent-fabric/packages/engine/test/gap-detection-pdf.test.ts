/**
 * `pdf_parsing` is satisfied by the capability that now exists.
 *
 * This was carried as an open item — "gap-detection cites a dangling `pdf`
 * capability id" — and that framing was wrong. `satisfiedBy` is a list of
 * substring hints matched against the inventory's ids *and descriptions*, not a
 * list of capability ids, so `"pdf"` alongside `"document.parse"` is a keyword
 * and not a broken reference. Nothing pinned that, so the item stayed on the list
 * and the real question — does the gap actually close now that PDF parsing
 * exists? — was never asked.
 *
 * Both directions matter. A gap that never closes is a capability the system
 * thinks it lacks; a gap that closes for the wrong reason is worse, because it
 * stops the search for something genuinely missing.
 */
import { describe, expect, it } from "vitest";
import { detectDeterministicGaps } from "../src/execution/gap-detection.js";

const pdfGoal = "Parse the structure of this PDF and pull out its tables";

describe("the pdf_parsing requirement", () => {
  it("closes when document.parse is in the inventory", () => {
    const gaps = detectDeterministicGaps(pdfGoal, {
      capabilityIds: ["filesystem.read", "document.parse"],
    });
    expect(gaps.some((gap) => gap.missing === "pdf_parsing")).toBe(false);
  });

  it("also closes on the keyword alone, which is what the hint list means", () => {
    // A capability whose *description* mentions PDF satisfies the hint. That is
    // the intended behaviour of a substring list, and it is why `"pdf"` is not a
    // dangling id — but it is also the loose end worth naming: a description that
    // merely mentions PDF closes the gap.
    const gaps = detectDeterministicGaps(pdfGoal, {
      capabilityIds: ["some.other"],
      descriptions: ["Reads and parses PDF documents"],
    });
    expect(gaps.some((gap) => gap.missing === "pdf_parsing")).toBe(false);
  });

  it("still opens when nothing in the inventory can parse a PDF", () => {
    // The other direction: the rule must still fire. A gap detector that always
    // reports satisfaction would be indistinguishable from one that is broken.
    const gaps = detectDeterministicGaps(pdfGoal, {
      capabilityIds: ["filesystem.read", "math.symbolic"],
    });
    const gap = gaps.find((item) => item.missing === "pdf_parsing");
    expect(gap, "pdf_parsing should still be reported as missing").toBeDefined();
    expect(gap!.synthesisable).toBe(false);
    // The evidence names the hints it looked for, so a reader can see why it
    // fired rather than trusting the confidence number.
    expect(gap!.evidence.some((line) => line.includes("document.parse"))).toBe(true);
  });

  it("does not fire for a goal that never mentions a PDF", () => {
    const gaps = detectDeterministicGaps("Add two numbers together", {
      capabilityIds: ["math.symbolic"],
    });
    expect(gaps.some((gap) => gap.missing === "pdf_parsing")).toBe(false);
  });
});
