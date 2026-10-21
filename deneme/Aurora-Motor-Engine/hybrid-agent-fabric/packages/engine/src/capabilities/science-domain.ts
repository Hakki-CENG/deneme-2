/**
 * science.sequence.analyse and science.molecule.analyse.
 *
 * Biopython 1.88, Biopython License Agreement — permissive and MIT-like, with
 * some files dual-licensed BSD-3-Clause. Read from LICENSE.rst, because
 * shields.io reports the licence as "not identifiable by github" and that is
 * not the same as there being no licence. RDKit 2026.09.1, BSD-3-Clause.
 *
 * Measured before this was written: `science.recompute` was the only
 * science-domain capability, and it is domain-agnostic — it runs whatever
 * command a claim carries and compares the number. A grep for
 * `dna|protein|sequence|molecule|smiles|fasta|amino` in that file returned
 * zero. Aurora could check a number if handed a command and knew nothing about
 * sequences or molecules.
 *
 * The reason these are not Biopython and RDKit behind an endpoint is the check.
 * Every headline number is recomputed by code in the worker that does not call
 * the library, and the two are compared:
 *
 *   sequence   gcFraction against a plain character count; reverse complement
 *              against a hand-written complement table, plus the involution
 *              rc(rc(s)) == s, which catches a table that is self-consistent
 *              but wrong; molecular weight against a monomer-mass table
 *   molecule   MolWt against the molecular formula multiplied out by IUPAC
 *              average atomic weights; canonical SMILES against a parse of
 *              itself; heavy-atom count against the formula's non-hydrogen tally
 *
 * That check found four real things on the first runs, and in every case the
 * library was right and the first version of the re-derivation was wrong:
 *
 *   1. Molecular weight. The worker used *residue* masses and subtracted one
 *      water; Biopython's model is sum(free monomer masses) minus (length - 1)
 *      waters. On a 39-mer that was a 35.9 Da gap. With the measured model the
 *      same sequence agrees to 0.0136 Da.
 *   2. `gc_fraction` divides by the count of unambiguous positions, not by the
 *      length — 0.666667 on ATGGCCATTNNNGGGCCC where 10/18 would be 0.555556.
 *      The denominator is now reported with the number, because a caller who
 *      assumes the length would misread it.
 *   3. `reverse_complement()` on RNA returns *DNA*: AUGGCCAUU... comes back
 *      GCGGCCCATT..., T where the input had U. Reported as an RNA complement
 *      that would simply be wrong, so it is normalised before being compared
 *      and before being returned.
 *   4. Biopython raises ValueError for an ambiguous position, so an N- or
 *      X-containing sequence has no molecular weight. The check is skipped and
 *      says why, rather than averaging over the ambiguity and calling the
 *      result a measurement.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { defineCapability } from "./schema.js";
import type { CapabilityManifest } from "./manifest.js";
import { runSubprocessCapability } from "./external/subprocess-adapter.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCIENCE_ANALYSE_WORKER_PATH = resolve(HERE, "../../external-workers/science_analyse.py");

export const BIOPYTHON_PINNED_VERSION = "1.88";
export const RDKIT_PINNED_VERSION = "2026.09.1";

export const SEQUENCE_ALPHABETS = ["dna", "rna", "protein"] as const;
export type SequenceAlphabet = (typeof SEQUENCE_ALPHABETS)[number];

const SEQUENCE_ID = "science.sequence.analyse";
const MOLECULE_ID = "science.molecule.analyse";

export const SCIENCE_SEQUENCE_MANIFEST: CapabilityManifest = {
  id: SEQUENCE_ID,
  version: "1.0.0",
  domain: ["bioinformatics", "science", "sequence-analysis"],
  description:
    "Analyse a DNA, RNA or protein sequence: length, composition, GC fraction, reverse complement and " +
    "molecular weight. Each number is re-derived independently and compared.",
  executionMode: "subprocess",
  requiredPermissions: ["process.spawn"],
  networkPolicy: "none",
  filesystemPolicy: "none",
  resourceLimits: { timeoutMs: 60_000, memoryMb: 1024 },
  healthCheck: "python3 -c 'import Bio'",
  verifierIds: ["science.sequence.analyse.independent-rederivation"],
  benchmarks: [],
  provenance: {
    repository: "https://github.com/biopython/biopython",
    commit: BIOPYTHON_PINNED_VERSION,
    license: "Biopython License Agreement (permissive, MIT-like; some files dual-licensed BSD-3-Clause)",
  },
  limitations: [
    "GC fraction is divided by the number of unambiguous positions, not the sequence length, because that is what Biopython does; the denominator is reported with the number",
    "molecular weight is not computed for a sequence containing an ambiguous position (N or X): Biopython refuses and so does this capability, rather than averaging over the ambiguity",
    "this describes a sequence; it does not predict structure, function or whether the sequence is biologically meaningful",
    "no alignment, no database lookup, no variant calling",
  ],
  fallbackCapabilityIds: [],
};

export const SCIENCE_MOLECULE_MANIFEST: CapabilityManifest = {
  id: MOLECULE_ID,
  version: "1.0.0",
  domain: ["cheminformatics", "science", "drug-discovery"],
  description:
    "Analyse a molecule from SMILES: formula, molecular weight, canonical form, ring and bond counts, " +
    "drug-likeness descriptors. Each number is re-derived independently and compared.",
  executionMode: "subprocess",
  requiredPermissions: ["process.spawn"],
  networkPolicy: "none",
  filesystemPolicy: "none",
  resourceLimits: { timeoutMs: 60_000, memoryMb: 1024 },
  healthCheck: "python3 -c 'import rdkit'",
  verifierIds: ["science.molecule.analyse.independent-rederivation"],
  benchmarks: [],
  provenance: {
    repository: "https://github.com/rdkit/rdkit",
    commit: RDKIT_PINNED_VERSION,
    license: "BSD-3-Clause",
  },
  limitations: [
    "heavy-atom count excludes hydrogens implied by SMILES, because that is what RDKit counts; calling it an atom count would mean something else",
    "descriptors such as TPSA and rotatable bonds are reported but not independently re-derived, so they are the library's numbers",
    "no 3D coordinates, no conformers, no docking, no property prediction",
    "an invalid SMILES string is refused with the parser's reason rather than repaired, because guessing the intended molecule would be inventing an answer",
  ],
  fallbackCapabilityIds: [],
};

export const SCIENCE_SEQUENCE_CAPABILITY_ID = SEQUENCE_ID;
export const SCIENCE_MOLECULE_CAPABILITY_ID = MOLECULE_ID;

interface ScienceCheck {
  agrees: boolean;
  [key: string]: unknown;
}

interface ScienceResult {
  kind: string;
  answer: Record<string, unknown>;
  checks: Record<string, ScienceCheck>;
  verified: boolean;
  checkCount: number;
  note: string;
}

function parseWorkerOutput(
  stdout: string,
): { ok: true; value: ScienceResult } | { ok: false; reason: string } {
  const trimmed = stdout.trim();
  if (trimmed === "") return { ok: false, reason: "the science worker produced no output at all" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, reason: `the science worker's output is not valid JSON: ${String(err)}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "the science worker's output is not a JSON object" };
  }
  const c = parsed as Record<string, unknown>;
  if (typeof c.error === "string") return { ok: false, reason: c.error };
  if (typeof c.kind !== "string") return { ok: false, reason: "the worker named no kind" };
  if (typeof c.answer !== "object" || c.answer === null) {
    return { ok: false, reason: "the worker returned no answer" };
  }

  const rawChecks =
    typeof c.checks === "object" && c.checks !== null ? (c.checks as Record<string, unknown>) : {};
  const checks: Record<string, ScienceCheck> = {};
  for (const [name, value] of Object.entries(rawChecks)) {
    if (typeof value === "object" && value !== null && typeof (value as ScienceCheck).agrees === "boolean") {
      checks[name] = value as ScienceCheck;
    }
  }

  return {
    ok: true,
    value: {
      kind: c.kind,
      answer: c.answer as Record<string, unknown>,
      checks,
      verified: c.verified === true,
      checkCount: typeof c.checkCount === "number" ? c.checkCount : Object.keys(checks).length,
      note: typeof c.note === "string" ? c.note : "",
    },
  };
}

/**
 * Reads the worker's checks and says which disagreed.
 *
 * Exported so the failure path can be tested directly rather than only through
 * a subprocess that would have to be made to lie.
 */
export function summariseScienceChecks(
  checks: Record<string, ScienceCheck>,
): { allAgree: boolean; disagreements: string[]; evaluated: number; skipped: string[] } {
  const disagreements: string[] = [];
  const skipped: string[] = [];
  for (const [name, entry] of Object.entries(checks)) {
    if (!entry.agrees) {
      const detail = Object.entries(entry)
        .filter(([k]) => k !== "agrees")
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      disagreements.push(`${name}: ${detail}`.slice(0, 300));
    } else if (typeof entry.notComputed === "string") {
      // A check that could not run is recorded, not counted as agreement. It is
      // not a failure either — the honest state is "not measured".
      skipped.push(`${name}: ${String(entry.notComputed).slice(0, 200)}`);
    }
  }
  return {
    allAgree: disagreements.length === 0,
    disagreements,
    skipped,
    evaluated: Object.keys(checks).length,
  };
}

async function runScienceWorker(manifest: CapabilityManifest, payload: Record<string, unknown>) {
  return runSubprocessCapability(manifest, {
    command: "python3",
    args: [SCIENCE_ANALYSE_WORKER_PATH],
    stdin: JSON.stringify(payload),
  });
}

function shapeResult(
  run: Awaited<ReturnType<typeof runScienceWorker>>,
  missingDependency: string,
): Record<string, unknown> {
  if (run.status === "unavailable") {
    return {
      status: "unavailable",
      analysed: false,
      installed: false,
      reason: run.reason ?? missingDependency,
    };
  }

  const parsed = parseWorkerOutput(run.stdout);
  if (!parsed.ok) {
    return {
      status: "failed",
      analysed: false,
      installed: true,
      reason: parsed.reason,
      stderr: run.stderr.slice(0, 2000),
    };
  }

  const value = parsed.value;
  const summary = summariseScienceChecks(value.checks);

  return {
    status: run.status,
    analysed: true,
    installed: true,
    kind: value.kind,
    answer: value.answer,
    checks: value.checks,
    checksEvaluated: summary.evaluated,
    // Only true when an independent re-derivation actually ran and agreed.
    verified: value.verified && summary.allAgree,
    unchecked: !(value.verified && summary.allAgree),
    disagreements: summary.disagreements,
    checksNotComputed: summary.skipped,
    note: value.note,
    checkDetail: summary.allAgree
      ? `${summary.evaluated} independent check(s) re-derived and agreed` +
        (summary.skipped.length > 0 ? `; ${summary.skipped.length} could not run` : "")
      : `${summary.disagreements.length} of ${summary.evaluated} independent check(s) disagreed`,
    durationMs: run.durationMs,
  };
}

const outputShape = z.object({
  status: z.string(),
  analysed: z.boolean(),
  installed: z.boolean().optional(),
  kind: z.string().optional(),
  answer: z.record(z.string(), z.unknown()).optional(),
  checks: z.record(z.string(), z.unknown()).optional(),
  checksEvaluated: z.number().optional(),
  verified: z.boolean().optional(),
  unchecked: z.boolean().optional(),
  disagreements: z.array(z.string()).optional(),
  checksNotComputed: z.array(z.string()).optional(),
  note: z.string().optional(),
  checkDetail: z.string().optional(),
  reason: z.string().optional(),
  stderr: z.string().optional(),
  durationMs: z.number().optional(),
});

/**
 * Shared verifier. Fails only when an independent re-derivation disagreed,
 * which is the only thing here that can establish the number is wrong.
 *
 * A refusal — invalid alphabet, unparseable SMILES — is returned with its
 * reason rather than failed, because "this could not be analysed" is not "this
 * analysis is wrong".
 */
const scienceVerify = async (output: unknown) => {
  const value = output as Record<string, unknown>;
  const status = String(value.status ?? "");
  if (status === "unavailable") {
    return { ok: true, reason: String(value.reason ?? "the scientific library is not installed") };
  }
  if (value.analysed !== true) {
    return {
      ok: true,
      reason: String(value.reason ?? value.stderr ?? "nothing was analysed") || "nothing was analysed",
    };
  }
  const disagreements = Array.isArray(value.disagreements)
    ? (value.disagreements as string[])
    : [];
  if (disagreements.length > 0) {
    return {
      ok: false,
      reason: `the independent re-derivation disagreed: ${disagreements.join("; ")}`.slice(0, 500),
    };
  }
  return { ok: true, reason: String(value.checkDetail ?? "the independent check agreed") };
};

export function scienceDomainCapabilities() {
  return [
    defineCapability(
      {
        id: SEQUENCE_ID,
        version: SCIENCE_SEQUENCE_MANIFEST.version,
        description:
          "Analyse a DNA, RNA or protein sequence and independently re-derive its headline numbers. " +
          "Returns 'unavailable' if Biopython is not installed.",
        risk: "pure",
        sideEffect: false,
        source: "core",
        idempotency: "inherent",
      },
      z.object({
        sequence: z.string().min(1).max(5_000_000),
        alphabet: z.enum(SEQUENCE_ALPHABETS).optional(),
      }),
      async ({ sequence, alphabet }) =>
        shapeResult(
          await runScienceWorker(SCIENCE_SEQUENCE_MANIFEST, {
            kind: "sequence",
            sequence,
            alphabet: alphabet ?? "dna",
          }),
          "Biopython could not be started",
        ),
      { idempotency: "inherent", output: outputShape, verify: scienceVerify },
    ),

    defineCapability(
      {
        id: MOLECULE_ID,
        version: SCIENCE_MOLECULE_MANIFEST.version,
        description:
          "Analyse a molecule from SMILES and independently re-derive its headline numbers. " +
          "Returns 'unavailable' if RDKit is not installed.",
        risk: "pure",
        sideEffect: false,
        source: "core",
        idempotency: "inherent",
      },
      z.object({ smiles: z.string().min(1).max(20_000) }),
      async ({ smiles }) =>
        shapeResult(
          await runScienceWorker(SCIENCE_MOLECULE_MANIFEST, { kind: "molecule", smiles }),
          "RDKit could not be started",
        ),
      { idempotency: "inherent", output: outputShape, verify: scienceVerify },
    ),
  ];
}
