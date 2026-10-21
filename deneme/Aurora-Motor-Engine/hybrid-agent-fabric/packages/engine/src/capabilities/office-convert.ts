/**
 * office.convert — LibreOffice headless conversion of Office documents.
 *
 * LibreOffice 25.2.3, MPL-2.0. Measured before this was written: Aurora had no
 * support for .docx, .xlsx or .pptx at all — no source file mentioned those
 * extensions. `document.parse` covers PDFs and images and nothing else, so
 * Office documents were a completely empty socket.
 *
 * On the licence, because MPL is easy to get wrong: MPL-2.0 is file-level
 * copyleft, and Aurora invokes LibreOffice as a subprocess rather than linking
 * against it. Nothing in this file imports or links LibreOffice code, so no
 * copyleft obligation reaches Aurora's own source. Some LibreOffice components
 * carry Apache-2.0, GPL-2+/3+ or LGPL-3+ terms; those are LibreOffice's to
 * satisfy, not this repository's, and are noted rather than summarised away.
 *
 * WHAT WAS MEASURED, and why the routing looks like this:
 *
 *   docx -> pdf          works, exit 0
 *   xlsx -> csv          works, exit 0, Turkish preserved ("Ürün,Adet")
 *   pptx -> pdf          works, exit 0
 *   docx -> txt:Text     RUNS AWAY
 *
 * That last line is the reason this capability is shaped the way it is.
 * Converting a .docx that contains a table with the `txt:Text` filter did not
 * fail — it looped. Measured: a temporary file grew 72 MB -> 94 MB -> 116 MB in
 * twelve seconds while soffice.bin held 99.8% CPU, and it would have filled the
 * 992 MB tmpfs it was writing to. A .docx without a table converted fine in
 * 835 ms, so the trigger is the table, not the document, and it is not
 * something a caller can be expected to predict.
 *
 * So `txt:Text` is never used for Writer documents, and the manifest says why.
 * Text from a Word document comes from converting to PDF and reading that with
 * `document.parse`, which is lossless and already tested. This is a deliberate
 * composition with an existing verified path rather than a second text
 * extractor.
 *
 * Two further requirements were measured, not assumed. LibreOffice needs a
 * writable profile directory, so each call gets a temporary one via
 * `-env:UserInstallation` — a shared profile would contend on its lock file if
 * two calls overlapped. And because a runaway filter is a real possibility, the
 * call is bounded hard and the output goes to a temporary directory that is
 * removed either way.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve, join, extname, basename } from "node:path";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";

import { z } from "zod";

import { defineCapability } from "./schema.js";
import type { CapabilityManifest } from "./manifest.js";
import { runSubprocessCapability } from "./external/subprocess-adapter.js";
import { resolveWithinWorkspace } from "./document-parse.js";

const HERE = dirname(fileURLToPath(import.meta.url));
void HERE;

export const LIBREOFFICE_PINNED_VERSION = "25.2.3";

export const OFFICE_CONVERT_MANIFEST: CapabilityManifest = {
  id: "office.convert",
  version: "1.0.0",
  domain: ["documents", "office", "document-processing"],
  description:
    "Convert an Office document in the workspace to PDF or CSV using LibreOffice headless. Word and " +
    "presentation documents convert to PDF; spreadsheets convert to CSV or PDF.",
  executionMode: "subprocess",
  requiredPermissions: ["process.spawn", "fs.read", "fs.write"],
  networkPolicy: "none",
  filesystemPolicy: "workspace-only",
  // Generous but bounded. A normal conversion measured under two seconds; the
  // bound exists for the case described in the module docstring.
  resourceLimits: { timeoutMs: 120_000, memoryMb: 2048 },
  healthCheck: "soffice --version",
  verifierIds: ["office.convert.output-exists"],
  benchmarks: [],
  provenance: {
    repository: "https://github.com/LibreOffice/core",
    commit: LIBREOFFICE_PINNED_VERSION,
    license: "MPL-2.0",
  },
  limitations: [
    "the txt:Text filter is never used for Writer documents: measured on a .docx containing a table it looped, growing a temp file past 116 MB in 12 seconds at 99.8% CPU rather than failing",
    "text from a Word document is therefore not extracted here — convert to PDF and read it with document.parse, which is lossless where OCR would not be",
    "MPL-2.0 is file-level copyleft and LibreOffice is invoked as a subprocess, not linked, so no obligation reaches Aurora's source; some LibreOffice components carry Apache-2.0, GPL or LGPL terms that are LibreOffice's to satisfy",
    "conversion fidelity is LibreOffice's, not Aurora's, and is not verified here — the verifier checks that an output file was produced, not that it is faithful",
    "each call uses a temporary LibreOffice profile, which costs startup time but avoids lock contention between overlapping calls",
  ],
  fallbackCapabilityIds: [],
};

export const OFFICE_CONVERT_CAPABILITY_ID = OFFICE_CONVERT_MANIFEST.id;

/** Source families, by extension. Everything else is refused rather than guessed at. */
const WRITER_SOURCES = new Set([".docx", ".doc", ".odt", ".rtf", ".fodt"]);
const CALC_SOURCES = new Set([".xlsx", ".xls", ".ods", ".csv", ".fods"]);
const IMPRESS_SOURCES = new Set([".pptx", ".ppt", ".odp", ".fodp"]);

export type OfficeSourceFamily = "writer" | "calc" | "impress";

export function officeSourceFamily(path: string): OfficeSourceFamily | undefined {
  const ext = extname(path).toLowerCase();
  if (WRITER_SOURCES.has(ext)) return "writer";
  if (CALC_SOURCES.has(ext)) return "calc";
  if (IMPRESS_SOURCES.has(ext)) return "impress";
  return undefined;
}

/**
 * Whether this source/format pair is allowed, and why not if it is not.
 *
 * Exported so the refusal reasons can be tested directly rather than only
 * through a booted engine.
 */
export function planConversion(
  path: string,
  format: "pdf" | "csv",
): { ok: true; family: OfficeSourceFamily } | { ok: false; reason: string } {
  const family = officeSourceFamily(path);
  if (!family) {
    const ext = extname(path).toLowerCase();
    return {
      ok: false,
      reason:
        `${ext || "this file"} is not an Office document this capability converts; ` +
        "supported: " +
        [...WRITER_SOURCES, ...CALC_SOURCES, ...IMPRESS_SOURCES].join(", "),
    };
  }
  if (format === "csv" && family !== "calc") {
    // This is the refusal that keeps the runaway filter unreachable, and it is
    // stated in terms of what the caller asked for rather than as an internal
    // detail. See the module docstring for the measurement.
    return {
      ok: false,
      reason:
        `only a spreadsheet can become CSV, and this is a ${family} document. LibreOffice's ` +
        "text filter was measured to loop on Word documents containing tables, so it is not " +
        "offered; convert to PDF and read it with document.parse instead",
    };
  }
  return { ok: true, family };
}

export function officeConvertCapabilities() {
  return [
    defineCapability(
      {
        id: OFFICE_CONVERT_CAPABILITY_ID,
        version: OFFICE_CONVERT_MANIFEST.version,
        description:
          "Convert an Office document in the workspace to PDF or CSV with LibreOffice headless. " +
          "Returns 'unavailable' if soffice is not installed.",
        risk: "workspace_write",
        sideEffect: true,
        source: "core",
        idempotency: "inherent",
      },
      z.object({
        path: z.string().min(1).max(1000),
        format: z.enum(["pdf", "csv"]),
        /** Where to write, relative to the workspace. Defaults to the source name. */
        outputPath: z.string().min(1).max(1000).optional(),
      }),
      async ({ path, format, outputPath }, context) => {
        const contained = resolveWithinWorkspace(context.workspacePath, path);
        if (!contained.ok) {
          return { status: "failed", route: "refused", reason: contained.reason, converted: false };
        }

        const plan = planConversion(contained.path, format);
        if (!plan.ok) {
          return { status: "failed", route: "refused", reason: plan.reason, converted: false };
        }

        // The destination is validated the same way as the source, so a caller
        // cannot read a document from the workspace and write over something
        // outside it.
        const stem = basename(contained.path).replace(/\.[^.]+$/, "");
        const destination = resolveWithinWorkspace(
          context.workspacePath,
          outputPath ?? `${stem}.${format}`,
        );
        if (!destination.ok) {
          return {
            status: "failed",
            route: "refused",
            reason: `the output path was refused: ${destination.reason}`,
            converted: false,
          };
        }

        // LibreOffice writes into a directory it chooses the name in, so it runs
        // in a scratch directory and the result is moved into place. The
        // scratch directory is also where a runaway filter would write, which
        // is why it is temporary and removed either way.
        const scratch = await mkdtemp(join(tmpdir(), "haf-office-"));
        const profile = join(scratch, "profile");
        try {
          const run = await runSubprocessCapability(OFFICE_CONVERT_MANIFEST, {
            command: "soffice",
            args: [
              "--headless",
              "--norestore",
              "--nolockcheck",
              "--nodefault",
              "--nofirststartwizard",
              `-env:UserInstallation=file://${profile}`,
              "--convert-to",
              format,
              "--outdir",
              scratch,
              contained.path,
            ],
          });

          if (run.status === "unavailable") {
            return {
              status: "unavailable",
              route: "refused",
              installed: false,
              converted: false,
              reason: run.reason ?? "LibreOffice could not be started",
            };
          }

          const produced = join(scratch, `${stem}.${format}`);
          let size: number;
          try {
            size = (await stat(produced)).size;
          } catch {
            // LibreOffice announces the conversion before writing, and exits 0
            // on some failures, so the exit status is not evidence. The file is.
            return {
              status: "failed",
              route: plan.family,
              installed: true,
              converted: false,
              reason:
                run.status === "executed"
                  ? "LibreOffice reported success but produced no output file"
                  : (run.reason ?? `soffice exited without producing ${stem}.${format}`),
              stderr: run.stderr.slice(0, 2000),
            };
          }
          if (size === 0) {
            return {
              status: "failed",
              route: plan.family,
              installed: true,
              converted: false,
              reason: "LibreOffice produced an empty output file",
            };
          }

          await writeFile(destination.path, await readFile(produced));

          return {
            status: "executed",
            route: plan.family,
            installed: true,
            converted: true,
            format,
            outputPath: outputPath ?? `${stem}.${format}`,
            byteCount: size,
            // Fidelity is LibreOffice's and is not checked here. Saying so is
            // cheaper than implying a check that does not exist.
            verified: false,
            unchecked: true,
            checkDetail:
              `LibreOffice produced a ${size}-byte ${format} from a ${plan.family} document. ` +
              "The output exists and is non-empty; whether it is faithful was not checked.",
            durationMs: run.durationMs,
          };
        } finally {
          await rm(scratch, { recursive: true, force: true });
        }
      },
      {
        idempotency: "inherent",
        output: z.object({
          status: z.string(),
          route: z.string(),
          installed: z.boolean().optional(),
          converted: z.boolean(),
          format: z.string().optional(),
          outputPath: z.string().optional(),
          byteCount: z.number().optional(),
          verified: z.boolean().optional(),
          unchecked: z.boolean().optional(),
          checkDetail: z.string().optional(),
          reason: z.string().optional(),
          stderr: z.string().optional(),
          durationMs: z.number().optional(),
        }),
        /**
         * Checks that a conversion produced something, and nothing more.
         *
         * It cannot judge fidelity — that would need the original document's
         * meaning, which nothing here has. Claiming otherwise would be the
         * failure mode this repository keeps closing, so the limit is in the
         * reason string rather than left implicit.
         */
        verify: async (output) => {
          const value = output as Record<string, unknown>;
          const status = String(value.status ?? "");
          if (status === "unavailable") {
            return { ok: true, reason: String(value.reason ?? "LibreOffice is not installed") };
          }
          if (value.converted !== true) {
            return {
              ok: true,
              reason: String(value.reason ?? value.stderr ?? "no conversion happened") || "no conversion happened",
            };
          }
          const bytes = typeof value.byteCount === "number" ? value.byteCount : 0;
          if (bytes <= 0) {
            return { ok: false, reason: "the conversion claimed success but produced no bytes" };
          }
          return {
            ok: true,
            reason:
              `a ${bytes}-byte ${String(value.format ?? "")} was produced. Existence is checked; ` +
              "fidelity is not.",
          };
        },
      },
    ),
  ];
}
