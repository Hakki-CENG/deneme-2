/**
 * office.convert — LibreOffice headless conversion.
 *
 * The two cases that matter most here are not the happy paths.
 *
 * One is a refusal. Converting a .docx containing a table with LibreOffice's
 * `txt:Text` filter was measured to loop rather than fail: a temporary file
 * grew 72 MB -> 94 MB -> 116 MB in twelve seconds at 99.8% CPU, on its way to
 * filling the 992 MB tmpfs. A .docx without a table converted in 835 ms, so the
 * trigger is the table and no caller could be expected to predict it. CSV
 * output is therefore refused for anything that is not a spreadsheet, and the
 * refusal says so.
 *
 * The other is the composition test at the end: a Word document becomes a PDF
 * here and is read by `document.parse`, which reaches it through the poppler
 * route. That is the path a real caller would take, and it is the reason text
 * extraction is not duplicated inside this capability.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";
import {
  OFFICE_CONVERT_CAPABILITY_ID,
  OFFICE_CONVERT_MANIFEST,
  officeSourceFamily,
  planConversion,
} from "../src/capabilities/office-convert.js";
import { DOCUMENT_PARSE_CAPABILITY_ID } from "../src/capabilities/document-parse.js";
import { assessManifest } from "../src/capabilities/manifest.js";

const FIXTURE_DIR = resolve(process.cwd(), "test/fixtures");

// Follows the repository's convention for tests needing a real external
// backend, so this file skips visibly rather than failing on a machine without
// LibreOffice. The pure-logic describes below always run.
function sofficeAvailable(): { ok: boolean; detail: string } {
  try {
    const out = execFileSync("soffice", ["--version"], { encoding: "utf8", timeout: 60_000 });
    return { ok: true, detail: out.trim() };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 140) };
  }
}

const SOFFICE = sofficeAvailable();

let root: string | undefined;
let engine: HybridAgentEngine | undefined;

async function bootEngine(): Promise<HybridAgentEngine> {
  root = await mkdtemp(join(tmpdir(), "haf-office-"));
  engine = new HybridAgentEngine({
    homePath: root,
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
  } as never);
  await engine.initialize();
  // risk "workspace_write" is medium severity and goes through approval; with a
  // mock model the default reviewer never resolves and execute() hangs.
  engine.approvals.bindReviewer(async () => ({
    autoApproved: true,
    rationale: "integration test: converting a fixture document",
  }));
  return engine;
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
  engine = undefined;
});

let callSequence = 0;

function context() {
  // A distinct idempotency key per call, and the reason is not cosmetic.
  // office.convert declares sideEffect: true, so the broker routes it through
  // the effect journal keyed on this value (capability-broker.ts:221). Reusing
  // one key made the second call in a test return the FIRST call's result — a
  // refusal about a source path came back when an output path was being tested.
  // A capability that writes must be given a fresh key for each distinct call.
  callSequence += 1;
  return {
    tenantId: "tenant-test",
    sessionId: "00000000-0000-0000-0000-000000000001",
    familyId: "00000000-0000-0000-0000-000000000002",
    turnId: "00000000-0000-0000-0000-000000000003",
    toolCallId: "00000000-0000-0000-0000-000000000004",
    source: "user",
    workspacePath: root ?? tmpdir(),
    idempotencyKey: `office-test-${callSequence}`,
  } as never;
}

async function convert(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const booted = engine ?? (await bootEngine());
  return (await booted.capabilities.execute(
    OFFICE_CONVERT_CAPABILITY_ID,
    input,
    context(),
  )) as Record<string, unknown>;
}

async function parse(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const booted = engine ?? (await bootEngine());
  return (await booted.capabilities.execute(
    DOCUMENT_PARSE_CAPABILITY_ID,
    input,
    context(),
  )) as Record<string, unknown>;
}

describe("routing rules, without needing LibreOffice installed", () => {
  it("classifies source documents by family", () => {
    expect(officeSourceFamily("a.docx")).toBe("writer");
    expect(officeSourceFamily("a.DOCX")).toBe("writer");
    expect(officeSourceFamily("a.odt")).toBe("writer");
    expect(officeSourceFamily("a.xlsx")).toBe("calc");
    expect(officeSourceFamily("a.ods")).toBe("calc");
    expect(officeSourceFamily("a.pptx")).toBe("impress");
    expect(officeSourceFamily("a.odp")).toBe("impress");
    expect(officeSourceFamily("a.pdf")).toBeUndefined();
    expect(officeSourceFamily("a.txt")).toBeUndefined();
    expect(officeSourceFamily("noextension")).toBeUndefined();
  });

  it("allows PDF from any Office family", () => {
    expect(planConversion("a.docx", "pdf").ok).toBe(true);
    expect(planConversion("a.xlsx", "pdf").ok).toBe(true);
    expect(planConversion("a.pptx", "pdf").ok).toBe(true);
  });

  it("allows CSV only from a spreadsheet", () => {
    expect(planConversion("a.xlsx", "csv").ok).toBe(true);
    expect(planConversion("a.docx", "csv").ok).toBe(false);
    expect(planConversion("a.pptx", "csv").ok).toBe(false);
  });

  it("explains the CSV refusal in terms of the measurement behind it", () => {
    const plan = planConversion("a.docx", "csv");
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    // The refusal must say why, and point at the path that does work. A bare
    // "unsupported" would leave a caller to rediscover the runaway filter.
    expect(plan.reason).toContain("only a spreadsheet can become CSV");
    expect(plan.reason).toContain("loop");
    expect(plan.reason).toContain("document.parse");
  });

  it("refuses a file that is not an Office document, listing what is", () => {
    const plan = planConversion("notes.pdf", "pdf");
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toContain("not an Office document");
    expect(plan.reason).toContain(".docx");
  });

  it("the manifest passes its own gate and states the licence position", () => {
    expect(assessManifest(OFFICE_CONVERT_MANIFEST).complete).toBe(true);
    expect(OFFICE_CONVERT_MANIFEST.provenance.license).toBe("MPL-2.0");
    // MPL is file-level copyleft; invoking a subprocess is not linking, and the
    // manifest says so rather than leaving a reader to work it out.
    const licence = OFFICE_CONVERT_MANIFEST.limitations.find((l) => l.includes("MPL-2.0"));
    expect(licence).toContain("subprocess");
    expect(licence).toContain("not linked");
  });

  it("records the runaway measurement as a limitation", () => {
    const limitation = OFFICE_CONVERT_MANIFEST.limitations.find((l) => l.includes("txt:Text"));
    expect(limitation).toBeDefined();
    expect(limitation).toContain("116 MB");
    expect(limitation).toContain("99.8% CPU");
  });
});

describe.skipIf(!SOFFICE.ok)("real conversions", () => {
  it("is registered with its manifest", async () => {
    const booted = await bootEngine();

    expect(booted.capabilities.list().some((c) => c.id === OFFICE_CONVERT_CAPABILITY_ID)).toBe(true);
    expect(engine!.capabilities.manifestFor(OFFICE_CONVERT_CAPABILITY_ID)?.provenance.license).toBe(
      "MPL-2.0",
    );
  }, 120_000);

  it("converts the .docx that made the text filter run away, to PDF", async () => {
    await bootEngine();
    // This fixture contains a table. It is the document shape that sent the
    // txt:Text filter into a loop; the PDF route handles it.
    await writeFile(join(root!, "doc.docx"), await readFile(join(FIXTURE_DIR, "office-with-table.docx")));

    const out = await convert({ path: "doc.docx", format: "pdf" });

    expect(out.converted).toBe(true);
    expect(out.route).toBe("writer");
    expect(out.format).toBe("pdf");
    expect(out.byteCount).toBeGreaterThan(1000);
    // Fidelity is LibreOffice's and is not checked here.
    expect(out.verified).toBe(false);
    expect(out.unchecked).toBe(true);

    const written = await readFile(join(root!, "doc.pdf"));
    expect(written.length).toBe(out.byteCount);
  }, 300_000);

  it("converts a spreadsheet to CSV and keeps non-ASCII text intact", async () => {
    await bootEngine();
    await writeFile(join(root!, "sheet.xlsx"), await readFile(join(FIXTURE_DIR, "office-sheet.xlsx")));

    const out = await convert({ path: "sheet.xlsx", format: "csv" });

    expect(out.converted).toBe(true);
    expect(out.route).toBe("calc");
    const csv = (await readFile(join(root!, "sheet.csv"))).toString("utf8");
    // Turkish, measured through the whole path rather than assumed.
    expect(csv).toContain("Ürün");
    expect(csv).toContain("Kalem,42");
  }, 300_000);

  it("converts a presentation to PDF", async () => {
    await bootEngine();
    await writeFile(join(root!, "slides.pptx"), await readFile(join(FIXTURE_DIR, "office-slides.pptx")));

    const out = await convert({ path: "slides.pptx", format: "pdf" });

    expect(out.converted).toBe(true);
    expect(out.route).toBe("impress");
    expect(out.byteCount).toBeGreaterThan(1000);
  }, 300_000);

  it("refuses CSV from a Word document rather than reaching the looping filter", async () => {
    await bootEngine();
    await writeFile(join(root!, "doc.docx"), await readFile(join(FIXTURE_DIR, "office-with-table.docx")));

    const out = await convert({ path: "doc.docx", format: "csv" });

    expect(out.converted).toBe(false);
    expect(out.route).toBe("refused");
    expect(String(out.reason)).toContain("only a spreadsheet can become CSV");
  }, 180_000);
});

describe.skipIf(!SOFFICE.ok)("input handling", () => {
  it("refuses a source outside the workspace, and an output outside it", async () => {
    await bootEngine();
    await writeFile(join(root!, "doc.docx"), await readFile(join(FIXTURE_DIR, "office-simple.docx")));

    const escapingSource = await convert({ path: "../../etc/passwd", format: "pdf" });
    expect(escapingSource.converted).toBe(false);
    expect(String(escapingSource.reason)).toContain("escapes the workspace");

    const escapingOutput = await convert({
      path: "doc.docx",
      format: "pdf",
      outputPath: "../../outside.pdf",
    });
    expect(escapingOutput.converted).toBe(false);
    expect(String(escapingOutput.reason)).toContain("output path was refused");
  }, 180_000);

  it("reports a document that is not there as a failed conversion, not a refusal", async () => {
    await bootEngine();

    const out = await convert({ path: "missing.docx", format: "pdf" });

    expect(out.converted).toBe(false);
    // Written expecting "refused". The actual route is the source family,
    // because a .docx is a valid input and LibreOffice really was asked — it
    // just had nothing to read. A refusal is for inputs this capability does
    // not handle at all; conflating the two would hide which happened.
    expect(out.route).toBe("writer");
    expect(out.status).toBe("failed");
  }, 180_000);

  it("reports a non-Office file rather than guessing at it", async () => {
    await bootEngine();
    await writeFile(join(root!, "notes.txt"), "plain text");

    const out = await convert({ path: "notes.txt", format: "pdf" });

    expect(out.converted).toBe(false);
    expect(String(out.reason)).toContain("not an Office document");
  }, 120_000);
});

describe.skipIf(!SOFFICE.ok)("the composition a real caller would take", () => {
  it("reads a Word document by converting it and parsing the PDF", async () => {
    await bootEngine();
    await writeFile(join(root!, "doc.docx"), await readFile(join(FIXTURE_DIR, "office-with-table.docx")));

    const converted = await convert({ path: "doc.docx", format: "pdf" });
    expect(converted.converted).toBe(true);

    // LibreOffice writes CID/CMap fonts, which the in-process extractor cannot
    // read; document.parse reaches this through its poppler route.
    const parsed = await parse({ path: "doc.pdf" });

    expect(parsed.route).toBe("pdf-text-poppler");
    expect(String(parsed.text)).toContain("Aurora Office Testi");
    expect(String(parsed.text)).toContain("Türkçe: ğüşıöç");
    // The table cell survived the whole path.
    expect(String(parsed.text)).toContain("hücre");
  }, 300_000);
});
