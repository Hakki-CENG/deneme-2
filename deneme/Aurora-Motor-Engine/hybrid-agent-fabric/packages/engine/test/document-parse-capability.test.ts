/**
 * document.parse — routing, and the bug its construction uncovered.
 *
 * The case that matters most here is a regression test for something that was
 * actually broken. `extractPdfText` claimed it would report rather than invent
 * when a PDF has no text layer. Measured against a real two-page scan, it
 * returned `extracted: true` with 7951 characters of decoded image bytes, and
 * `research-engine-service.ts` stored that as a source's content with a
 * fingerprint computed over it and a note reading "PDF text extracted".
 *
 * The fixture `scanned-two-page-no-text-layer.pdf` reproduces it. A one-page
 * scan does not, because the existing image-filter guard happens to catch that
 * layout — which is the point: the guard is a guess about where dictionaries
 * sit, and it is wrong often enough to matter.
 *
 * Also asserted: OCR results are never claimed as verified. Tesseract's mean
 * confidence was measured at 85.2 for a correctly read Turkish line and 84.3
 * for the same line read as garbage under the English model, so it cannot
 * separate right from wrong and is reported as legibility only.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";
import {
  DOCUMENT_PARSE_CAPABILITY_ID,
  DOCUMENT_PARSE_MANIFEST,
  resolveWithinWorkspace,
} from "../src/capabilities/document-parse.js";
import { assessManifest } from "../src/capabilities/manifest.js";
import { extractPdfText, assessTextLegibility } from "../src/research/pdf-text-extract.js";

const FIXTURE_DIR = resolve(process.cwd(), "test/fixtures");
const SCANNED_FIXTURE = join(FIXTURE_DIR, "scanned-two-page-no-text-layer.pdf");
const CID_FIXTURE = join(FIXTURE_DIR, "cid-font-libreoffice.pdf");

let root: string | undefined;
let engine: HybridAgentEngine | undefined;

function toolsAvailable(): { ok: boolean; detail: string } {
  for (const tool of ["tesseract", "pdftoppm", "python3"]) {
    try {
      execFileSync(tool, ["--version"], { encoding: "utf8", timeout: 30_000, stdio: "ignore" });
    } catch {
      try {
        execFileSync("which", [tool], { encoding: "utf8", timeout: 10_000 });
      } catch {
        return { ok: false, detail: `${tool} is not installed` };
      }
    }
  }
  return { ok: true, detail: "ok" };
}

const TOOLS = toolsAvailable();

/**
 * A PDF with a real text layer, built here rather than stored as a fixture so
 * the bytes under test are visible in the diff.
 */
function buildTextLayerPdf(lines: string[]): Uint8Array {
  const content = lines
    .map((line, i) => `BT /F1 20 Tf 50 ${720 - i * 40} Td (${line}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

// Follows the repository's convention for tests that need a real external
// backend (postgres-rls-integration, real-encoder-recall, version): skip,
// visibly, rather than fail. These were written to throw instead, on the
// reasoning that a skipped integration test is not evidence — which is true
// but made `npm test` fail on any machine without the backend installed.
// The pure-logic describes in this file are deliberately left outside the
// skip so the file always asserts something.

async function bootEngine(): Promise<HybridAgentEngine> {
  root = await mkdtemp(join(tmpdir(), "haf-docparse-"));
  engine = new HybridAgentEngine({
    homePath: root,
    kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
    sandboxBackend: "local",
    model: { provider: "mock" },
  } as never);
  await engine.initialize();
  return engine;
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
  engine = undefined;
});

function context() {
  return {
    tenantId: "tenant-test",
    sessionId: "00000000-0000-0000-0000-000000000001",
    familyId: "00000000-0000-0000-0000-000000000002",
    turnId: "00000000-0000-0000-0000-000000000003",
    toolCallId: "00000000-0000-0000-0000-000000000004",
    source: "user",
    workspacePath: root ?? tmpdir(),
  } as never;
}

async function parse(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const booted = engine ?? (await bootEngine());
  return (await booted.capabilities.execute(
    DOCUMENT_PARSE_CAPABILITY_ID,
    input,
    context(),
  )) as Record<string, unknown>;
}

describe("the bug this capability was built around", () => {
  it("a real scanned PDF is no longer reported as extracted text", async () => {
    const bytes = new Uint8Array(await readFile(SCANNED_FIXTURE));
    const extraction = extractPdfText(bytes);

    // Before the fix this was `true`, with thousands of characters of image
    // bytes decoded as text and no reason given.
    expect(extraction.extracted).toBe(false);
    expect(extraction.text).toBe("");
    expect(extraction.reason).toContain("needs OCR");
    expect(extraction.reason).toMatch(/NUL byte/);
  });

  it("a PDF with a real text layer is unaffected by the fix", () => {
    const extraction = extractPdfText(
      buildTextLayerPdf(["Aurora document parse routing", "Gercek metin katmani"]),
    );

    expect(extraction.extracted).toBe(true);
    expect(extraction.text).toContain("Aurora document parse routing");
  });

  it("the legibility thresholds separate the measured samples, with margin", () => {
    // Measured: garbage 14.7% control / 2.9% NUL; real text 0% / 0%.
    expect(assessTextLegibility("Merhaba dünya, ğüşıöç gerçek metin").legible).toBe(true);
    expect(assessTextLegibility("plain ascii text").legible).toBe(true);
    expect(assessTextLegibility("has\u0000nul").legible).toBe(false);
    expect(assessTextLegibility("").legible).toBe(false);

    const garbage = assessTextLegibility("ab\u0001\u0002\u0003\u0004\u0005cd");
    expect(garbage.legible).toBe(false);
    expect(garbage.reason).toContain("control characters");
  });
});

describe.skipIf(!TOOLS.ok)("routing is chosen by what the document actually contains", () => {
  it("registers the id the gap detector already claimed existed", async () => {
    const booted = await bootEngine();

    // gap-detection.ts lists `document.parse` as satisfying the pdf_parsing
    // gap. Until this capability existed, that claim pointed at nothing.
    expect(booted.capabilities.list().some((c) => c.id === DOCUMENT_PARSE_CAPABILITY_ID)).toBe(true);
    expect(engine!.capabilities.manifestFor(DOCUMENT_PARSE_CAPABILITY_ID)?.provenance.license).toBe(
      "Apache-2.0",
    );
    expect(assessManifest(DOCUMENT_PARSE_MANIFEST).complete).toBe(true);
  }, 120_000);

  it("reads a text-layer PDF in-process without invoking OCR", async () => {
    await bootEngine();
    await writeFile(join(root!, "paper.pdf"), buildTextLayerPdf(["Benchmark throughput measured"]));

    const out = await parse({ path: "paper.pdf" });

    expect(out.route).toBe("pdf-text-layer");
    expect(String(out.text)).toContain("Benchmark throughput measured");
    expect(out.verified).toBe(false);
    expect(out.unchecked).toBe(true);
  }, 180_000);

  it("OCR's a scanned PDF that has no text layer, and reads it correctly", async () => {
    await bootEngine();
    await writeFile(join(root!, "scan.pdf"), await readFile(SCANNED_FIXTURE));

    const out = await parse({ path: "scan.pdf", languages: "tur+eng" });

    expect(out.route).toBe("ocr-scanned-pdf");
    expect(String(out.text)).toContain("Taranmis belge OCR testi");
    expect(out.pages).toBe(2);
    // Legibility, not accuracy — see the module docstring for the measurement.
    expect(typeof out.meanConfidence).toBe("number");
    expect(out.verified).toBe(false);
    expect(out.unchecked).toBe(true);
    expect(String(out.checkDetail)).toContain("legibility is not accuracy");
  }, 300_000);

  it("uses poppler for a CID-font PDF the in-process extractor cannot read", async () => {
    await bootEngine();
    // The fixture is a PDF LibreOffice wrote from a .docx. Measured on this
    // exact file: extractPdfText reports extracted=false with 316 NUL bytes in
    // 3996 characters, because it deliberately does not decode CID/CMap fonts.
    // Before this route existed the document fell through to OCR — slow,
    // lossy, and reported as an unverified transcription.
    const inProcess = extractPdfText(new Uint8Array(await readFile(CID_FIXTURE)));
    expect(inProcess.extracted).toBe(false);

    await writeFile(join(root!, "office.pdf"), await readFile(CID_FIXTURE));
    const out = await parse({ path: "office.pdf" });

    expect(out.route).toBe("pdf-text-poppler");
    expect(String(out.text)).toContain("Aurora Office Testi");
    expect(String(out.text)).toContain("Türkçe: ğüşıöç");
    // The table cell survived too, which OCR of a rendered page would guess at.
    expect(String(out.text)).toContain("hücre");
    expect(out.verified).toBe(false);
    expect(out.unchecked).toBe(true);
  }, 300_000);

  it("does not let poppler claim text from a PDF that has none", async () => {
    await bootEngine();
    // pdftotext exits 0 here with nothing but form feeds. Trusting the exit
    // status would have reported a successful empty extraction instead of
    // falling through to the OCR that can actually read the page.
    await writeFile(join(root!, "scan2.pdf"), await readFile(SCANNED_FIXTURE));

    const out = await parse({ path: "scan2.pdf", languages: "tur+eng" });

    expect(out.route).toBe("ocr-scanned-pdf");
    expect(String(out.text)).toContain("Taranmis belge OCR testi");
  }, 300_000);

  it("OCR's an image, and agrees with the text that was rendered into it", async () => {
    await bootEngine();
    const pdfPath = join(root!, "render.pdf");
    await writeFile(pdfPath, buildTextLayerPdf(["Roundtrip ground truth line"]));
    // Render with the same tool the capability uses, so the ground truth is the
    // text that was actually drawn rather than text I assume was drawn.
    execFileSync("pdftoppm", ["-png", "-r", "300", pdfPath, join(root!, "page")], { timeout: 120_000 });
    const png = join(root!, "page-1.png");

    const out = await parse({ path: "page-1.png", languages: "eng" });

    expect(out.route).toBe("ocr-image");
    expect(String(out.text)).toContain("Roundtrip ground truth line");
    expect(out.verified).toBe(false);
    expect(out.unchecked).toBe(true);
  }, 300_000);

  it("refuses a file that is neither a PDF nor an image", async () => {
    await bootEngine();
    await writeFile(join(root!, "notes.txt"), "just text");

    const out = await parse({ path: "notes.txt" });

    expect(out.route).toBe("refused");
    expect(out.text).toBeUndefined();
    expect(String(out.reason)).toContain("neither a PDF nor an image");
  }, 120_000);
});

describe("path access stays inside the workspace", () => {
  it("refuses traversal and absolute paths outside the workspace", () => {
    const workspace = "/tmp/ws";
    expect(resolveWithinWorkspace(workspace, "../etc/passwd").ok).toBe(false);
    expect(resolveWithinWorkspace(workspace, "/etc/passwd").ok).toBe(false);
    expect(resolveWithinWorkspace(workspace, "a/../../etc/passwd").ok).toBe(false);
    expect(resolveWithinWorkspace(workspace, "").ok).toBe(false);
    expect(resolveWithinWorkspace(workspace, ".").ok).toBe(false);

    const inside = resolveWithinWorkspace(workspace, "docs/paper.pdf");
    expect(inside.ok).toBe(true);
    if (inside.ok) expect(inside.path).toBe("/tmp/ws/docs/paper.pdf");
  });

  it("refuses an escaping path through the capability, not just the helper", async () => {
    await bootEngine();

    const out = await parse({ path: "../../etc/passwd" });

    expect(out.route).toBe("refused");
    expect(out.text).toBeUndefined();
    expect(String(out.reason)).toContain("escapes the workspace");
  }, 120_000);
});

describe("nothing here claims to have verified a transcription", () => {
  it("the manifest says confidence is legibility and cites the measurement", () => {
    const limitation = DOCUMENT_PARSE_MANIFEST.limitations.find((l) => l.includes("85.2"));
    expect(limitation).toBeDefined();
    expect(limitation).toContain("84.3");
    expect(DOCUMENT_PARSE_MANIFEST.limitations.some((l) => l.includes("unchecked"))).toBe(true);
  });

  it("and admits the sibling id it is cited alongside still does not exist", () => {
    expect(
      DOCUMENT_PARSE_MANIFEST.limitations.some((l) => l.includes("'pdf'") && l.includes("does not exist")),
    ).toBe(true);
  });

  it("the health check is documented as proving only that the binary runs", () => {
    expect(DOCUMENT_PARSE_MANIFEST.healthCheck).toBe("tesseract --version");
    expect(
      DOCUMENT_PARSE_MANIFEST.limitations.some((l) => l.includes("not that it reads accurately")),
    ).toBe(true);
  });
});
