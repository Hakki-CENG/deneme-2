/**
 * science.sequence.analyse and science.molecule.analyse.
 *
 * The load-bearing cases are the ones that pin the four library behaviours the
 * independent check uncovered, because each one was a real trap and each one
 * could silently come back:
 *
 *   molecular weight uses sum(free monomer masses) - (length - 1) waters. The
 *   first version used residue masses and one water, and was 35.9 Da off on a
 *   39-mer.
 *
 *   `gc_fraction` divides by unambiguous positions, not by length. On
 *   ATGGCCATTNNNGGGCCC it is 10/15, not 10/18, and a caller who assumes the
 *   length misreads the number — so the denominator is asserted to be present.
 *
 *   `reverse_complement()` on RNA returns DNA. Reported as an RNA complement
 *   that is simply wrong, so the returned value must contain U and not T.
 *
 *   an ambiguous position means there is no molecular weight. Biopython raises;
 *   the capability must say the check did not run rather than invent a number.
 *
 * `summariseScienceChecks` is tested against a lying check for the usual reason:
 * an unexercised disagreement path makes `verified: true` an assertion about
 * nothing.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { HybridAgentEngine } from "../src/engine.js";
import {
  SCIENCE_MOLECULE_CAPABILITY_ID,
  SCIENCE_MOLECULE_MANIFEST,
  SCIENCE_SEQUENCE_CAPABILITY_ID,
  SCIENCE_SEQUENCE_MANIFEST,
  summariseScienceChecks,
} from "../src/capabilities/science-domain.js";
import { assessManifest } from "../src/capabilities/manifest.js";

// Aspirin. Formula C9H8O4, molecular weight 180.159 Da.
const ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O";
// 39 bases, 22 of them G or C: 22/39 = 0.564103.
const DNA = "ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG";
const RNA = "AUGGCCAUUGUAAUGGGCCGC";
const PROTEIN = "MKTAYIAKQRQISFVKSHFSRQ";
// 15 unambiguous positions, 10 of them G or C: 10/15 = 0.666667.
const AMBIGUOUS_DNA = "ATGGCCATTNNNGGGCCC";

function pythonHas(module: string): { ok: boolean; detail: string } {
  try {
    const out = execFileSync("python3", ["-c", `import ${module}; print(getattr(${module}, "__version__", "?"))`], {
      encoding: "utf8",
      timeout: 60_000,
    });
    return { ok: true, detail: out.trim() };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 140) };
  }
}

const BIO = pythonHas("Bio");
const RDKIT = pythonHas("rdkit");

let root: string | undefined;
let engine: HybridAgentEngine | undefined;

async function bootEngine(): Promise<HybridAgentEngine> {
  root = await mkdtemp(join(tmpdir(), "haf-science-"));
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

async function run(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const booted = engine ?? (await bootEngine());
  return (await booted.capabilities.execute(id, input, context())) as Record<string, unknown>;
}

describe("the manifests and the check reader, without needing the libraries", () => {
  it("both manifests are complete and state their real licences", () => {
    expect(assessManifest(SCIENCE_SEQUENCE_MANIFEST).complete).toBe(true);
    expect(assessManifest(SCIENCE_MOLECULE_MANIFEST).complete).toBe(true);
    // Not rounded to "MIT": the file says Biopython License Agreement.
    expect(SCIENCE_SEQUENCE_MANIFEST.provenance.license).toContain("Biopython License Agreement");
    expect(SCIENCE_MOLECULE_MANIFEST.provenance.license).toBe("BSD-3-Clause");
  });

  it("the sequence manifest states the GC denominator and the ambiguity refusal", () => {
    expect(
      SCIENCE_SEQUENCE_MANIFEST.limitations.some((l) => l.includes("unambiguous positions")),
    ).toBe(true);
    expect(
      SCIENCE_SEQUENCE_MANIFEST.limitations.some((l) => l.includes("ambiguous position")),
    ).toBe(true);
  });

  it("the molecule manifest states that heavy-atom count excludes implied hydrogens", () => {
    expect(SCIENCE_MOLECULE_MANIFEST.limitations.some((l) => l.includes("heavy-atom count"))).toBe(true);
    expect(SCIENCE_MOLECULE_MANIFEST.limitations.some((l) => l.includes("no 3D coordinates"))).toBe(true);
  });

  it("reads agreeing checks as agreeing", () => {
    const summary = summariseScienceChecks({
      gcFraction: { agrees: true, engine: 0.564, independent: 0.564 },
      molecularWeight: { agrees: true, engine: 180.159, independent: 180.159 },
    });
    expect(summary.allAgree).toBe(true);
    expect(summary.disagreements).toEqual([]);
    expect(summary.skipped).toEqual([]);
  });

  it("reads a disagreeing check as a failure and says what differed", () => {
    const summary = summariseScienceChecks({
      molecularWeight: { agrees: false, engine: 12192.756, independent: 12156.855 },
    });
    expect(summary.allAgree).toBe(false);
    expect(summary.disagreements).toHaveLength(1);
    expect(summary.disagreements[0]).toContain("molecularWeight");
    expect(summary.disagreements[0]).toContain("12156.855");
  });

  it("records a check that could not run as neither agreement nor failure", () => {
    // The state that matters: "not measured" must not be laundered into
    // "verified", and it must not fail the capability either.
    const summary = summariseScienceChecks({
      molecularWeight: { agrees: true, engine: null, independent: null, notComputed: "3 ambiguous positions" },
    });
    expect(summary.allAgree).toBe(true);
    expect(summary.disagreements).toEqual([]);
    expect(summary.skipped).toHaveLength(1);
    expect(summary.skipped[0]).toContain("ambiguous");
  });
});

describe.skipIf(!BIO.ok)("analysing a real sequence", () => {
  it("is registered with its manifest", async () => {
    const booted = await bootEngine();
    expect(booted.capabilities.list().some((c) => c.id === SCIENCE_SEQUENCE_CAPABILITY_ID)).toBe(true);
    expect(engine!.capabilities.manifestFor(SCIENCE_SEQUENCE_CAPABILITY_ID)?.provenance.license).toContain(
      "Biopython",
    );
  }, 120_000);

  it("reports a DNA sequence's properties, all independently re-derived", async () => {
    await bootEngine();

    const out = await run(SCIENCE_SEQUENCE_CAPABILITY_ID, { sequence: DNA, alphabet: "dna" });
    const answer = out.answer as Record<string, unknown>;

    expect(out.status).toBe("executed");
    expect(out.analysed).toBe(true);
    expect(out.verified).toBe(true);
    expect(out.disagreements).toEqual([]);
    expect(answer.length).toBe(39);
    expect(answer.gcFraction).toBeCloseTo(22 / 39, 5);
    expect(typeof answer.molecularWeightDa).toBe("number");
    expect(String(answer.reverseComplement)).toHaveLength(39);
  }, 300_000);

  it("returns an RNA complement in RNA, not in DNA", async () => {
    await bootEngine();

    // Biopython's reverse_complement() on RNA returns DNA — AUGGCCAUU comes back
    // GCGGCCCATT. Reported as an RNA complement that would be wrong.
    const out = await run(SCIENCE_SEQUENCE_CAPABILITY_ID, { sequence: RNA, alphabet: "rna" });
    const answer = out.answer as Record<string, unknown>;
    const rc = String(answer.reverseComplement);

    expect(out.verified).toBe(true);
    expect(rc).not.toContain("T");
    expect(rc).toContain("U");
    expect(rc).toBe("GCGGCCCAUUACAAUGGCCAU");
  }, 300_000);

  it("reports the GC denominator, because it is not the length", async () => {
    await bootEngine();

    const out = await run(SCIENCE_SEQUENCE_CAPABILITY_ID, {
      sequence: AMBIGUOUS_DNA,
      alphabet: "dna",
    });
    const answer = out.answer as Record<string, unknown>;
    const gc = (out.checks as Record<string, Record<string, unknown>>).gcFraction!;

    // 10 of the 15 unambiguous positions, not 10 of 18.
    expect(answer.gcFraction).toBeCloseTo(10 / 15, 5);
    expect(gc.denominator).toBe(15);
    expect(gc.length).toBe(18);
    expect(String(gc.denominatorNote)).toContain("unambiguous positions");
    expect(out.verified).toBe(true);
  }, 300_000);

  it("says the molecular weight was not computed for an ambiguous sequence", async () => {
    await bootEngine();

    const out = await run(SCIENCE_SEQUENCE_CAPABILITY_ID, {
      sequence: AMBIGUOUS_DNA,
      alphabet: "dna",
    });

    // Not a failure, and not an invented average either.
    expect(out.verified).toBe(true);
    expect(out.disagreements).toEqual([]);
    const skipped = out.checksNotComputed as string[];
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toContain("ambiguous position");
    expect(String(out.checkDetail)).toContain("could not run");
  }, 300_000);

  it("analyses a protein, where GC and complement do not apply", async () => {
    await bootEngine();

    const out = await run(SCIENCE_SEQUENCE_CAPABILITY_ID, { sequence: PROTEIN, alphabet: "protein" });
    const answer = out.answer as Record<string, unknown>;

    expect(out.verified).toBe(true);
    expect(answer.length).toBe(22);
    expect(answer.gcFraction).toBeNull();
    expect(answer.reverseComplement).toBeNull();
    expect(typeof answer.molecularWeightDa).toBe("number");
  }, 300_000);

  it("refuses letters that are not in the stated alphabet", async () => {
    await bootEngine();

    const out = await run(SCIENCE_SEQUENCE_CAPABILITY_ID, { sequence: "ATGXBZ", alphabet: "dna" });

    expect(out.analysed).toBe(false);
    expect(String(out.reason)).toContain("not valid dna");
  }, 180_000);
});

describe.skipIf(!RDKIT.ok)("analysing a real molecule", () => {
  it("is registered with its manifest", async () => {
    const booted = await bootEngine();
    expect(booted.capabilities.list().some((c) => c.id === SCIENCE_MOLECULE_CAPABILITY_ID)).toBe(true);
    expect(engine!.capabilities.manifestFor(SCIENCE_MOLECULE_CAPABILITY_ID)?.provenance.license).toBe(
      "BSD-3-Clause",
    );
  }, 120_000);

  it("reports aspirin's properties, with the weight re-derived from its formula", async () => {
    await bootEngine();

    const out = await run(SCIENCE_MOLECULE_CAPABILITY_ID, { smiles: ASPIRIN });
    const answer = out.answer as Record<string, unknown>;
    const mw = (out.checks as Record<string, Record<string, unknown>>).molecularWeight!;

    expect(out.status).toBe("executed");
    expect(out.verified).toBe(true);
    expect(answer.formula).toBe("C9H8O4");
    expect(answer.molecularWeightDa).toBeCloseTo(180.159, 2);
    // 9*12.011 + 8*1.008 + 4*15.999, computed without RDKit.
    expect(mw.agrees).toBe(true);
    expect(mw.independent).toBeCloseTo(180.159, 2);
    expect(answer.heavyAtomCount).toBe(13);
    expect(answer.ringCount).toBe(1);
  }, 300_000);

  it("canonicalises SMILES, and checks the canonical form parses to itself", async () => {
    await bootEngine();

    const out = await run(SCIENCE_MOLECULE_CAPABILITY_ID, { smiles: "c1ccccc1C(=O)O" });
    const answer = out.answer as Record<string, unknown>;
    const roundTrip = (out.checks as Record<string, Record<string, unknown>>).canonicalSmilesRoundTrip!;

    expect(out.verified).toBe(true);
    expect(roundTrip.agrees).toBe(true);
    expect(String(answer.canonicalSmiles)).toContain("O=C(O)c1ccccc1");
  }, 300_000);

  it("refuses a SMILES string that is not a molecule, with the parser's reason", async () => {
    await bootEngine();

    const out = await run(SCIENCE_MOLECULE_CAPABILITY_ID, { smiles: "C1CC" });

    expect(out.analysed).toBe(false);
    expect(String(out.reason)).toContain("could not parse");
    // Guessing the intended molecule would be inventing an answer.
    expect(String(out.reason)).toContain("not a valid molecule");
  }, 180_000);
});
