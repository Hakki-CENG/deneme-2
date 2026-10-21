/**
 * document.parse — text extraction routed by document type.
 *
 * The plan's first-wave item 4 asks for documents routed by PDF type. This is
 * that routing, and it exists because of a measured bug rather than a plan.
 *
 * The id `document.parse` was already referenced by the gap detector as one of
 * the capabilities that satisfies the `pdf_parsing` gap, alongside `pdf`.
 * Neither id existed. So the gap detector reported a gap as satisfied that the
 * planner could never call. This capability makes one of those ids real; the
 * other reference is still dangling and is noted in the manifest rather than
 * quietly left alone.
 *
 * Three routes, chosen by measurement rather than by file extension alone:
 *
 *   pdf-text-layer  the repository's own dependency-free extractor. Fast,
 *                   lossless, in-process. Used when the PDF really carries
 *                   text — which is now verified by checking the decoded
 *                   output, after it was measured that a scanned PDF used to
 *                   return 3630 characters of image bytes with
 *                   `extracted: true`.
 *   pdf-text-poppler poppler's pdftotext. Measured to extract text from PDFs
 *                   the in-process extractor cannot — including everything
 *                   LibreOffice writes, which uses CID/CMap fonts. Tried
 *                   before OCR because it is lossless where OCR is not.
 *   ocr-image /     Tesseract 5.5.0, Apache-2.0. For images and for scanned
 *   ocr-scanned-pdf PDFs. Scanned pages are rendered by poppler's pdftoppm.
 *
 * Verification honesty, which is the part that matters:
 *
 * OCR confidence is reported as LEGIBILITY, not accuracy. Measured: on one
 * image a correctly read Turkish line scored 85.2 mean confidence while the
 * identical line read as garbage ("Turkce glsi6g") under the English model
 * scored 84.3. A 0.9 point gap between right and wrong. A badly rendered image
 * did fall to 54.5, so the number is not meaningless — it just does not mean
 * what it looks like it means. Every OCR result is therefore returned
 * `unchecked: true`. Nothing here can establish that a transcription of an
 * unknown document is correct, and claiming otherwise would be the exact
 * failure mode this repository is built to refuse.
 *
 * Path access is contained to the caller's workspace, which is stricter than
 * the other subprocess adapters in this directory currently are.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, isAbsolute, extname } from "node:path";
import { readFile } from "node:fs/promises";

import { z } from "zod";

import { defineCapability } from "./schema.js";
import type { CapabilityManifest } from "./manifest.js";
import { runSubprocessCapability } from "./external/subprocess-adapter.js";
import { extractPdfText, assessTextLegibility } from "../research/pdf-text-extract.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DOCUMENT_OCR_WORKER_PATH = resolve(HERE, "../../external-workers/document_ocr.py");

export const TESSERACT_PINNED_VERSION = "5.5.0";

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp", ".gif", ".pbm", ".pgm", ".ppm",
]);

export const DOCUMENT_PARSE_MANIFEST: CapabilityManifest = {
  id: "document.parse",
  version: "1.0.0",
  domain: ["documents", "ocr", "document-processing", "retrieval"],
  description:
    "Extract text from a PDF or image, routing by document type: PDFs with a real text layer are " +
    "decoded in-process; images and scanned PDFs are OCR'd with Tesseract.",
  executionMode: "subprocess",
  requiredPermissions: ["process.spawn", "fs.read"],
  networkPolicy: "none",
  filesystemPolicy: "workspace-only",
  resourceLimits: { timeoutMs: 300_000, memoryMb: 1024 },
  // Proves the binary runs. It does NOT prove OCR is accurate; see limitations.
  healthCheck: "tesseract --version",
  verifierIds: ["document.parse.shape-and-legibility"],
  benchmarks: [],
  provenance: {
    repository: "https://github.com/tesseract-ocr/tesseract",
    commit: TESSERACT_PINNED_VERSION,
    license: "Apache-2.0",
  },
  limitations: [
    "tesseract's mean confidence measures legibility, not accuracy: a correct Turkish line scored 85.2 and the same line read as garbage under the English model scored 84.3",
    "so every OCR result is returned unchecked — nothing here can establish that a transcription of an unknown document is correct",
    "language selection changes the output and is not inferred; defaulting to English silently corrupts Turkish text",
    "the manifest's healthCheck proves the binary runs, not that it reads accurately",
    "the sibling id 'pdf' that the gap detector also cites for this gap still does not exist; only this id is real",
    "CID/CMap-encoded PDF text layers are not decoded by the in-process route; poppler's pdftotext runs next and handles them",
    "pdftotext exits 0 for a PDF that genuinely has no text layer, so its output is checked for content and not trusted on exit status alone",
  ],
  fallbackCapabilityIds: [],
};

export const DOCUMENT_PARSE_CAPABILITY_ID = DOCUMENT_PARSE_MANIFEST.id;

/**
 * Containment check, applied before anything reads the file.
 *
 * Returns the resolved absolute path, or the reason it was refused. Symlink
 * escape is not fully closed by this — `resolve` normalises `..` textually, it
 * does not follow links — so the limitation is stated rather than implied.
 */
export function resolveWithinWorkspace(
  workspacePath: string,
  requested: string,
): { ok: true; path: string } | { ok: false; reason: string } {
  if (requested.trim() === "") return { ok: false, reason: "no path was given" };
  const base = resolve(workspacePath);
  const target = isAbsolute(requested) ? resolve(requested) : resolve(base, requested);
  const rel = relative(base, target);
  if (rel === "") return { ok: false, reason: "the path is the workspace itself, not a document" };
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { ok: false, reason: `the path escapes the workspace (${rel.split("/")[0] ?? "outside"})` };
  }
  return { ok: true, path: target };
}

interface OcrWorkerResult {
  text: string;
  route: string;
  languages: string;
  pages: number;
  wordCount: number;
  meanConfidence: number | null;
  lowConfidenceWordCount: number;
  /** Optional in the worker's output, so optional here too under exactOptionalPropertyTypes. */
  pageLimitReached?: boolean | undefined;
}

function parseWorkerOutput(stdout: string): { ok: true; value: OcrWorkerResult } | { ok: false; reason: string } {
  const trimmed = stdout.trim();
  if (trimmed === "") return { ok: false, reason: "the OCR worker produced no output at all" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, reason: `the OCR worker's output is not valid JSON: ${String(err)}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "the OCR worker's output is not a JSON object" };
  }
  const c = parsed as Record<string, unknown>;
  if (typeof c.error === "string") return { ok: false, reason: c.error };
  if (typeof c.text !== "string") return { ok: false, reason: "the OCR worker returned no text" };
  return {
    ok: true,
    value: {
      text: c.text,
      route: typeof c.route === "string" ? c.route : "ocr-image",
      languages: typeof c.languages === "string" ? c.languages : "",
      pages: typeof c.pages === "number" ? c.pages : 1,
      wordCount: typeof c.wordCount === "number" ? c.wordCount : 0,
      meanConfidence: typeof c.meanConfidence === "number" ? c.meanConfidence : null,
      lowConfidenceWordCount: typeof c.lowConfidenceWordCount === "number" ? c.lowConfidenceWordCount : 0,
      pageLimitReached: typeof c.pageLimitReached === "boolean" ? c.pageLimitReached : undefined,
    },
  };
}

export function documentParseCapabilities() {
  return [
    defineCapability(
      {
        id: DOCUMENT_PARSE_CAPABILITY_ID,
        version: DOCUMENT_PARSE_MANIFEST.version,
        description:
          "Extract text from a PDF or image in the workspace. PDFs with a real text layer are decoded " +
          "in-process; images and scanned PDFs are OCR'd. Returns 'unavailable' if Tesseract is missing.",
        risk: "workspace_read",
        sideEffect: false,
        source: "core",
        idempotency: "inherent",
      },
      z.object({
        path: z.string().min(1).max(1000),
        /**
         * Tesseract language tags joined with '+'. Deliberately defaulted to
         * 'tur+eng' rather than Tesseract's own default of 'eng', because
         * reading Turkish text under the English model does not fail — it
         * returns plausible-looking garbage.
         */
        languages: z.string().min(1).max(64).optional(),
        psm: z.number().int().min(0).max(13).optional(),
        maxPages: z.number().int().min(1).max(50).optional(),
      }),
      async ({ path, languages, psm, maxPages }, context) => {
        const contained = resolveWithinWorkspace(context.workspacePath, path);
        if (!contained.ok) {
          return { status: "failed", reason: contained.reason, route: "refused" };
        }

        const extension = extname(contained.path).toLowerCase();
        const isPdf = extension === ".pdf";
        if (!isPdf && !IMAGE_EXTENSIONS.has(extension)) {
          return {
            status: "failed",
            route: "refused",
            reason:
              `${extension || "this file"} is neither a PDF nor an image this capability reads; ` +
              "supported images: " + [...IMAGE_EXTENSIONS].join(", "),
          };
        }

        // Route 1: a PDF that really carries text. Checked on the decoded
        // output, because `extracted: true` was measured to be untrustworthy
        // for scanned documents.
        if (isPdf) {
          let bytes: Uint8Array;
          try {
            bytes = new Uint8Array(await readFile(contained.path));
          } catch (err) {
            return { status: "failed", route: "refused", reason: `the file could not be read: ${String(err)}` };
          }
          const extraction = extractPdfText(bytes);
          if (extraction.extracted && extraction.text.trim() !== "") {
            const legibility = assessTextLegibility(extraction.text);
            return {
              status: "executed",
              route: "pdf-text-layer",
              text: extraction.text,
              pages: extraction.pages,
              characterCount: extraction.text.length,
              // No independent check exists for text taken from a text layer:
              // the bytes are what the document says. That is different from
              // being verified.
              verified: false,
              unchecked: true,
              checkDetail:
                "the text came from the PDF's own text layer, so it was decoded rather than " +
                "transcribed; legibility measured at " +
                `${(legibility.printableAsciiRatio * 100).toFixed(1)}% printable ASCII`,
            };
          }
          // Falls through, carrying the reason the text layer was rejected so
          // the caller can see why a more expensive route ran.

          // Route 1b: poppler's pdftotext. Measured on the same file:
          //   a PDF written by LibreOffice from a .docx
          //     extractPdfText   extracted=false, 316 NUL bytes in 3996 chars
          //     pdftotext        "Aurora Office Testi / Bu bir docx
          //                       paragrafıdır. Türkçe: ğüşıöç / hücre"
          // The repository's extractor is dependency-free and deliberately does
          // not decode CID/CMap fonts, which is what most real-world PDFs use.
          // Without this route those documents fell straight through to OCR —
          // slow, lossy, and reported as an unverified transcription — when a
          // lossless extraction was available.
          const poppler = await runSubprocessCapability(DOCUMENT_PARSE_MANIFEST, {
            command: "pdftotext",
            // `-layout` keeps columns readable; `-` writes to stdout so nothing
            // is written next to the caller's file.
            args: ["-layout", contained.path, "-"],
          });
          if (poppler.status === "executed") {
            // pdftotext exits non-zero for a missing or malformed file, but
            // exits 0 with nothing but form feeds for a PDF that genuinely has
            // no text layer. So the exit status alone is not enough; the
            // content has to be checked too. Measured, not assumed.
            const text = poppler.stdout.replace(/\f/g, "\n").replace(/\s+$/, "");
            if (text.trim() !== "") {
              const legibility = assessTextLegibility(text);
              if (legibility.legible) {
                return {
                  status: "executed",
                  route: "pdf-text-poppler",
                  text,
                  characterCount: text.length,
                  verified: false,
                  unchecked: true,
                  checkDetail:
                    "the text was decoded from the PDF's own text layer by poppler, which handles " +
                    "the CID/CMap fonts the in-process extractor does not; legibility measured at " +
                    `${(legibility.printableAsciiRatio * 100).toFixed(1)}% printable ASCII`,
                };
              }
            }
          }
        }

        // Route 2: OCR.
        const run = await runSubprocessCapability(DOCUMENT_PARSE_MANIFEST, {
          command: "python3",
          args: [DOCUMENT_OCR_WORKER_PATH],
          stdin: JSON.stringify({
            path: contained.path,
            mode: isPdf ? "pdf" : "image",
            languages: languages ?? "tur+eng",
            psm: psm ?? 3,
            maxPages: maxPages ?? 20,
          }),
        });

        if (run.status === "unavailable") {
          return {
            status: "unavailable",
            route: "refused",
            installed: false,
            reason: run.reason ?? "Tesseract or its worker could not be started",
          };
        }

        const parsed = parseWorkerOutput(run.stdout);
        if (!parsed.ok) {
          return {
            status: "failed",
            route: isPdf ? "ocr-scanned-pdf" : "ocr-image",
            installed: true,
            reason: parsed.reason,
            stderr: run.stderr.slice(0, 2000),
          };
        }

        const v = parsed.value;
        return {
          status: run.status,
          route: v.route,
          installed: true,
          text: v.text,
          pages: v.pages,
          characterCount: v.text.length,
          languages: v.languages,
          wordCount: v.wordCount,
          // Legibility, not accuracy. The measurement behind this distinction
          // is in the module docstring and in the manifest's limitations.
          meanConfidence: v.meanConfidence,
          lowConfidenceWordCount: v.lowConfidenceWordCount,
          verified: false,
          unchecked: true,
          checkDetail:
            `OCR read ${v.wordCount} word(s) with mean legibility ` +
            `${v.meanConfidence ?? "n/a"}; legibility is not accuracy, so the transcription is ` +
            "returned unchecked rather than endorsed",
          durationMs: run.durationMs,
        };
      },
      {
        idempotency: "inherent",
        output: z.object({
          status: z.string(),
          route: z.string(),
          installed: z.boolean().optional(),
          text: z.string().optional(),
          pages: z.number().optional(),
          characterCount: z.number().optional(),
          languages: z.string().optional(),
          wordCount: z.number().optional(),
          meanConfidence: z.number().nullable().optional(),
          lowConfidenceWordCount: z.number().optional(),
          verified: z.boolean().optional(),
          unchecked: z.boolean().optional(),
          checkDetail: z.string().optional(),
          reason: z.string().optional(),
          stderr: z.string().optional(),
          durationMs: z.number().optional(),
        }),
        /**
         * What this can and cannot establish.
         *
         * It fails when the capability broke its promise: a refusal that should
         * not have happened is reported by the caller-facing `route`, and no
         * text at all is a failure. It passes when text came back, carrying
         * `unchecked: true`, because no check available here can establish that
         * a transcription of an unknown document is correct — and a verifier
         * that endorsed such a transcription would be lying.
         */
        verify: async (output) => {
          const value = output as Record<string, unknown>;
          const status = String(value.status ?? "");
          if (status === "unavailable") {
            return { ok: true, reason: String(value.reason ?? "the OCR backend is not installed") };
          }
          if (status !== "executed") {
            return {
              ok: true,
              reason: String(value.reason ?? value.stderr ?? status) || "the capability reported its own failure",
            };
          }
          const text = typeof value.text === "string" ? value.text.trim() : "";
          if (text === "") {
            return { ok: false, reason: "the capability reported success but produced no text" };
          }
          return {
            ok: true,
            reason: String(value.checkDetail ?? "text was returned, unchecked"),
          };
        },
      },
    ),
  ];
}
