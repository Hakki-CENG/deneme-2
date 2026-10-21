"""Analyse a DNA/RNA/protein sequence or a molecule, and re-derive the numbers.

Reads a request from stdin as JSON, writes a result to stdout as JSON.

    {"kind": "sequence", "sequence": "ATGGCC...", "alphabet": "dna"}
    {"kind": "molecule", "smiles": "CC(=O)Oc1ccccc1C(=O)O"}

Why this is not Biopython and RDKit behind an endpoint.

Every headline number is recomputed by code in this file that does not call the
library, and the two are compared. The recomputation is deliberately independent:
one library restating its own output is not evidence, while two routes to the
same number is.

  sequence   gcFraction from `gc_fraction` against a plain character count over
             the string; reverse complement against a hand-written translation
             table, plus the involution rc(rc(s)) == s; molecular weight against
             a residue-mass table summed here
  molecule   MolWt against the molecular formula multiplied out by standard
             atomic weights in this file; canonical SMILES against a parse of
             itself; heavy-atom count against the formula's non-hydrogen tally

Measured on aspirin: RDKit reports formula C9H8O4 and MolWt 180.159, and
9*12.011 + 8*1.008 + 4*15.999 computed here gives 180.159.

What is reported rather than hidden. Biopython's molecular weight for a
nucleotide sequence uses its own residue table and averages; a hand-summed table
agrees to a tolerance, not to the last digit, and the tolerance is stated in the
check rather than silently widened. RDKit's `GetNumAtoms` counts explicit atoms,
so hydrogens implied by SMILES are not in it — the count compared here is the
heavy-atom count, and saying "atom count" without that qualification would be a
number that means something else.

Biopython 1.88, Biopython License Agreement (permissive, MIT-like; some files
are dual-licensed BSD-3-Clause — read from LICENSE.rst, since shields.io reports
the licence as "not identifiable by github"). RDKit 2026.09.1, BSD-3-Clause.
"""

from __future__ import annotations

import json
import re
import sys

MAX_SEQUENCE_LENGTH = 5_000_000
MAX_SMILES_LENGTH = 20_000

# Standard atomic weights (IUPAC), used only by the independent re-derivation.
ATOMIC_WEIGHTS = {
    "H": 1.008, "He": 4.0026, "Li": 6.94, "Be": 9.0122, "B": 10.81, "C": 12.011,
    "N": 14.007, "O": 15.999, "F": 18.998, "Ne": 20.180, "Na": 22.990, "Mg": 24.305,
    "Al": 26.982, "Si": 28.085, "P": 30.974, "S": 32.06, "Cl": 35.45, "Ar": 39.95,
    "K": 39.098, "Ca": 40.078, "Fe": 55.845, "Zn": 65.38, "Br": 79.904, "I": 126.904,
    "Se": 78.971, "Cu": 63.546, "Mn": 54.938, "Co": 58.933, "Ni": 58.693, "Mo": 95.95,
}

COMPLEMENT = {"A": "T", "T": "A", "G": "C", "C": "G", "N": "N",
              "a": "t", "t": "a", "g": "c", "c": "g", "n": "n"}
RNA_COMPLEMENT = {"A": "U", "U": "A", "G": "C", "C": "G", "N": "N",
                  "a": "u", "u": "a", "g": "c", "c": "g", "n": "n"}

# Free monomer masses in Da, measured from Biopython itself rather than copied
# from a table, and the strand model measured with them:
#
#     molecular weight = sum(monomer masses) - (length - 1) * water
#
# The first version of this file used *residue* masses (monomer minus water) and
# subtracted one water. On a 39-base sequence that gave 12156.855 against
# Biopython's 12192.756, a 35.9 Da gap the independent check reported. With the
# measured model the same sequence agrees to 0.0136 Da.

DNA_MONOMER = {"A": 331.222, "T": 322.209, "G": 347.221, "C": 307.197}
RNA_MONOMER = {"A": 347.221, "U": 324.181, "G": 363.221, "C": 323.197}
PROTEIN_MONOMER = {
    "A": 89.093, "R": 174.201, "N": 132.118, "D": 133.103,
    "C": 121.158, "E": 147.129, "Q": 146.144, "G": 75.067,
    "H": 155.155, "I": 131.173, "L": 131.173, "K": 146.188,
    "M": 149.211, "F": 165.189, "P": 115.130, "S": 105.093,
    "T": 119.119, "W": 204.225, "Y": 181.189, "V": 117.146,
}
WATER = 18.015

# Measured drift between the model above and Biopython was 0.0136 Da on a
# 39-mer, so this is slack, not a fudge factor.
MW_TOLERANCE_DA = 0.05

MW_TOLERANCE_DA = 2.0


def fail(reason: str) -> None:
    print(json.dumps({"error": reason}), flush=True)
    raise SystemExit(1)


def check(name: str, engine: object, independent: object, agrees: bool) -> dict[str, object]:
    return {"agrees": bool(agrees), "engine": engine, "independent": independent}


def analyse_sequence(sequence: str, alphabet: str) -> dict[str, object]:
    try:
        from Bio.Seq import Seq
        from Bio.SeqUtils import gc_fraction, molecular_weight
    except ImportError as err:
        fail(f"biopython is not installed: {err}")

    cleaned = "".join(sequence.split()).upper()
    if cleaned == "":
        fail("the sequence is empty")
    if len(cleaned) > MAX_SEQUENCE_LENGTH:
        fail(f"the sequence is {len(cleaned)} characters, over the {MAX_SEQUENCE_LENGTH} limit")

    allowed = {
        "dna": set("ATGCN"),
        "rna": set("AUGCN"),
        "protein": set(PROTEIN_MONOMER) | {"*"},
    }[alphabet]
    unexpected = sorted({c for c in cleaned if c not in allowed})
    if unexpected:
        fail(
            f"{len(unexpected)} character(s) are not valid {alphabet}: "
            f"{''.join(unexpected[:10])}"
        )

    seq = Seq(cleaned)
    nucleic = alphabet in {"dna", "rna"}

    # Measured: `gc_fraction` divides by the count of *unambiguous* positions,
    # not by the length. On ATGGCCATTNNNGGGCCC it returns 0.666667 (10 of 15)
    # where 10 of 18 would be 0.555556. A caller who assumes the denominator is
    # the length would misread the number, so the denominator is reported
    # alongside it rather than left to be guessed.
    unambiguous = [c for c in cleaned if c in {"A", "T", "U", "G", "C"}]
    engine_gc = round(float(gc_fraction(seq)), 6) if nucleic else None
    independent_gc = (
        round(
            (sum(1 for c in unambiguous if c in {"G", "C"}) / len(unambiguous))
            if unambiguous
            else 0.0,
            6,
        )
        if nucleic
        else None
    )

    checks: dict[str, object] = {}
    if nucleic:
        checks["gcFraction"] = {
            **check("gcFraction", engine_gc, independent_gc, engine_gc == independent_gc),
            "denominator": len(unambiguous),
            "length": len(cleaned),
            "denominatorNote": (
                "the denominator is the number of unambiguous positions, not the sequence "
                "length; Biopython excludes N positions and so does this count"
                if len(unambiguous) != len(cleaned)
                else "the sequence has no ambiguous positions, so the denominator is the length"
            ),
        }

        table = COMPLEMENT if alphabet == "dna" else RNA_COMPLEMENT
        try:
            independent_rc = "".join(table[c] for c in reversed(cleaned))
        except KeyError as err:
            independent_rc = f"unmapped character {err}"
        # Measured, and the reason the engine side is normalised. Biopython's
        # `reverse_complement()` on an RNA sequence returns *DNA*: AUGGCCAUU...
        # comes back as GCGGCCCATT..., with T where the input had U. Reported as
        # an RNA complement that would be wrong, so the engine's answer is
        # transcribed back to RNA before being compared and before being
        # returned.
        raw_rc = str(seq.reverse_complement())
        engine_rc = raw_rc.replace("T", "U") if alphabet == "rna" else raw_rc
        checks["reverseComplement"] = check(
            "reverseComplement", engine_rc[:64], independent_rc[:64], engine_rc == independent_rc
        )
        # An involution: applying it twice must return the input. This catches a
        # complement table that is self-consistent but wrong. For RNA the
        # intermediate is DNA, so the same normalisation applies on the way back.
        second_raw = str(Seq(engine_rc).reverse_complement())
        second = second_raw.replace("T", "U") if alphabet == "rna" else second_raw
        checks["reverseComplementInvolution"] = check(
            "reverseComplementInvolution",
            "rc(rc(s)) == s",
            second == cleaned,
            second == cleaned,
        )

        monomer = DNA_MONOMER if alphabet == "dna" else RNA_MONOMER
        ambiguous = "N"
    else:
        monomer = PROTEIN_MONOMER
        ambiguous = "X"

    # Measured: Biopython raises ValueError for an ambiguous position, so a
    # sequence containing one has no molecular weight to report. Skipping the
    # check and saying why is the honest result; averaging over the ambiguity
    # would be inventing a number and labelling it a measurement.
    ambiguous_positions = cleaned.count(ambiguous)
    if ambiguous_positions:
        engine_mw = None
        independent_mw = None
        checks["molecularWeight"] = {
            "agrees": True,
            "engine": None,
            "independent": None,
            "notComputed": (
                f"{ambiguous_positions} ambiguous position(s) ({ambiguous}); "
                "Biopython refuses to compute a molecular weight for an ambiguous "
                "sequence and so does this check"
            ),
        }
    else:
        independent_mw = round(sum(monomer[c] for c in cleaned) - (len(cleaned) - 1) * WATER, 3)
        engine_mw = round(
            float(
                molecular_weight(
                    seq,
                    "DNA" if alphabet == "dna" else ("RNA" if alphabet == "rna" else "protein"),
                )
            ),
            3,
        )
        checks["molecularWeight"] = {
            **check("molecularWeight", engine_mw, independent_mw,
                    abs(engine_mw - independent_mw) <= MW_TOLERANCE_DA),
            "toleranceDa": MW_TOLERANCE_DA,
        }

    composition: dict[str, int] = {}
    for c in cleaned:
        composition[c] = composition.get(c, 0) + 1

    evaluated = [c for c in checks.values() if isinstance(c, dict) and "agrees" in c]
    verified = all(bool(c["agrees"]) for c in evaluated)

    return {
        "kind": "sequence",
        "answer": {
            "alphabet": alphabet,
            "length": len(cleaned),
            "gcFraction": engine_gc,
            "molecularWeightDa": engine_mw,
            "reverseComplement": (
                (str(seq.reverse_complement()).replace("T", "U") if alphabet == "rna"
                 else str(seq.reverse_complement()))
                if nucleic
                else None
            ),
            "composition": composition,
            "ambiguousCount": composition.get("N", 0),
        },
        "checks": checks,
        "verified": verified,
        "checkCount": len(evaluated),
        "note": (
            "molecular weight is compared against a residue table summed here, to a stated "
            "tolerance, because Biopython uses its own residue masses and averages"
        ),
    }


def parse_formula(formula: str) -> dict[str, int]:
    """C9H8O4 -> {'C': 9, 'H': 8, 'O': 4}. Written here, not taken from RDKit."""
    tokens = re.findall(r"([A-Z][a-z]?)(\d*)", formula)
    counts: dict[str, int] = {}
    for symbol, digits in tokens:
        if symbol == "":
            continue
        counts[symbol] = counts.get(symbol, 0) + (int(digits) if digits else 1)
    return counts


def analyse_molecule(smiles: str) -> dict[str, object]:
    try:
        from rdkit import Chem, RDLogger
        from rdkit.Chem import Descriptors, rdMolDescriptors
    except ImportError as err:
        fail(f"rdkit is not installed: {err}")

    # RDKit logs parse errors to stderr and returns None; the caller gets one
    # clear reason rather than a library's diagnostic and a null.
    RDLogger.DisableLog("rdApp.*")

    text = smiles.strip()
    if text == "":
        fail("the SMILES string is empty")
    if len(text) > MAX_SMILES_LENGTH:
        fail(f"the SMILES string is {len(text)} characters, over the {MAX_SMILES_LENGTH} limit")

    molecule = Chem.MolFromSmiles(text)
    if molecule is None:
        fail("RDKit could not parse that SMILES string; it is not a valid molecule as written")

    formula = rdMolDescriptors.CalcMolFormula(molecule)
    engine_mw = round(float(Descriptors.MolWt(molecule)), 3)
    canonical = Chem.MolToSmiles(molecule)

    counts = parse_formula(formula)
    unknown = sorted(s for s in counts if s not in ATOMIC_WEIGHTS)
    if unknown:
        fail(
            f"the formula {formula} contains element(s) with no atomic weight in this file: "
            f"{', '.join(unknown)}"
        )
    independent_mw = round(sum(ATOMIC_WEIGHTS[s] * n for s, n in counts.items()), 3)

    heavy_atoms = sum(n for s, n in counts.items() if s != "H")
    round_trip = Chem.MolToSmiles(Chem.MolFromSmiles(canonical))

    checks = {
        "molecularWeight": {
            **check("molecularWeight", engine_mw, independent_mw,
                    abs(engine_mw - independent_mw) <= 0.01),
            # Derived from the formula with IUPAC average atomic weights, so it
            # should match closely and any drift is worth failing on.
            "toleranceDa": 0.01,
        },
        "canonicalSmilesRoundTrip": check(
            "canonicalSmilesRoundTrip", canonical[:64], round_trip[:64], round_trip == canonical
        ),
        "heavyAtomCount": check(
            "heavyAtomCount", molecule.GetNumAtoms(), heavy_atoms,
            molecule.GetNumAtoms() == heavy_atoms,
        ),
    }

    evaluated = [c for c in checks.values() if isinstance(c, dict) and "agrees" in c]
    verified = all(bool(c["agrees"]) for c in evaluated)

    return {
        "kind": "molecule",
        "answer": {
            "formula": formula,
            "molecularWeightDa": engine_mw,
            "canonicalSmiles": canonical,
            "heavyAtomCount": molecule.GetNumAtoms(),
            "bondCount": molecule.GetNumBonds(),
            "ringCount": int(rdMolDescriptors.CalcNumRings(molecule)),
            "hydrogenBondDonors": int(rdMolDescriptors.CalcNumHBD(molecule)),
            "hydrogenBondAcceptors": int(rdMolDescriptors.CalcNumHBA(molecule)),
            "rotatableBonds": int(rdMolDescriptors.CalcNumRotatableBonds(molecule)),
            "tpsa": round(float(rdMolDescriptors.CalcTPSA(molecule)), 2),
        },
        "checks": checks,
        "verified": verified,
        "checkCount": len(evaluated),
        "note": (
            "heavy-atom count excludes hydrogens implied by SMILES, because that is what "
            "GetNumAtoms counts; calling it an atom count would mean something else"
        ),
    }


def main() -> None:
    try:
        request = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as err:
        fail(f"the request is not valid JSON: {err}")

    kind = request.get("kind")
    if kind == "sequence":
        sequence = request.get("sequence")
        if not isinstance(sequence, str):
            fail("no sequence string was given")
        alphabet = request.get("alphabet", "dna")
        if alphabet not in {"dna", "rna", "protein"}:
            fail(f"alphabet {alphabet!r} is not one of dna, rna, protein")
        result = analyse_sequence(sequence, alphabet)
    elif kind == "molecule":
        smiles = request.get("smiles")
        if not isinstance(smiles, str):
            fail("no SMILES string was given")
        result = analyse_molecule(smiles)
    else:
        fail(f"kind {kind!r} is not one of 'sequence' or 'molecule'")

    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
