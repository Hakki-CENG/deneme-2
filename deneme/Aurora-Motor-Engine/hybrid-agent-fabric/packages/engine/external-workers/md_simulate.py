"""Molecular dynamics via OpenMM 8.6.1. Reads JSON on stdin, writes JSON on stdout.

    {"pdbPath": "/abs/system.pdb",
     "forcefields": ["amber14/protein.ffxml", "amber14/tip3p.xml"],
     "steps": 1000, "temperatureKelvin": 300, "timestepFs": 2, "platform": "CPU"}

    or, for a system with no input file:
    {"lennardJones": {"count": 8, "sigmaNm": 0.42, "epsilonKjMol": 1.0, "boxNm": 3},
     "steps": 200, "temperatureKelvin": 94}

WHY OPENMM AND NOT THE PLAIN "NEEDS A GPU" ANSWER. OpenMM was assumed to be
hardware-blocked. Measured instead: `pip install openmm` pulls no PyTorch, and the
package ships a CPU platform that runs a real simulation here — 200 steps of an
eight-atom Lennard-Jones system in about half a second. There is no CUDA or OpenCL
platform on a machine without a GPU, so throughput is what suffers, not capability.

WHAT IS VERIFIED, AND IT IS MORE THAN "IT RAN". A simulation that completes is not a
simulation that was sane: a timestep too large for the system produces an
integrator that happily runs while the potential energy diverges. So the run is
checked physically — the potential energy after minimisation is compared with the
energy during dynamics, and a blow-up is reported as a failure rather than handed
back as a result. The measured temperature is reported against the target, since a
thermostat that is not holding is a visible symptom.

WHAT IS NOT VERIFIED, stated because the gap is large. Whether the numbers are
*physically right* depends entirely on the force field and the input structure, and
nothing here can judge either. A clean run of the wrong model is a clean run of the
wrong model. So the result names the force field files and the platform that
produced it, and carries `physicallyValidated: false`.

Input handling: paths arrive as JSON and are opened as files. There is no shell in
this file and nothing caller-supplied is evaluated — which matters because OpenMM's
API would otherwise be reachable as arbitrary Python.
"""
from __future__ import annotations

import json
import os
import sys


def fail(message: str, **extra: object) -> None:
    print(json.dumps({"ok": False, "error": message, **extra}))


def main() -> int:
    try:
        request = json.load(sys.stdin)
    except Exception as error:  # noqa: BLE001 - the message is the deliverable
        fail(f"request is not valid JSON: {error}")
        return 0

    try:
        import openmm
        import openmm.app as app
        from openmm import unit
    except Exception as error:  # noqa: BLE001
        fail(f"openmm is not importable: {error}. Install it with: pip install openmm")
        return 0

    steps = request.get("steps", 100)
    if not isinstance(steps, int) or steps < 1 or steps > 10_000_000:
        fail(f"steps must be an integer between 1 and 10000000, got {steps!r}")
        return 0
    temperature = request.get("temperatureKelvin", 300.0)
    if not isinstance(temperature, (int, float)) or not 0 < temperature < 2000:
        fail(f"temperatureKelvin must be a number between 0 and 2000, got {temperature!r}")
        return 0
    timestep = request.get("timestepFs", 2.0)
    if not isinstance(timestep, (int, float)) or not 0 < timestep <= 10:
        fail(f"timestepFs must be a number between 0 and 10, got {timestep!r}")
        return 0

    pdb_path = request.get("pdbPath")
    lj = request.get("lennardJones")
    if bool(pdb_path) == bool(lj):
        fail("provide exactly one of pdbPath or lennardJones, not both and not neither")
        return 0

    platform_name = request.get("platform")
    available = [openmm.Platform.getPlatform(i).getName() for i in range(openmm.Platform.getNumPlatforms())]
    if isinstance(platform_name, str) and platform_name and platform_name not in available:
        fail(f"platform {platform_name!r} is not available here; available: {available}")
        return 0
    if not platform_name:
        # Prefer a GPU platform when one exists, because that is the point of
        # installing OpenMM, and fall back to CPU rather than failing.
        platform_name = "CUDA" if "CUDA" in available else "OpenCL" if "OpenCL" in available else "CPU"

    try:
        if pdb_path:
            if not isinstance(pdb_path, str) or not os.path.isfile(pdb_path):
                fail(f"the PDB file was not found at {pdb_path!r}")
                return 0
            forcefields = request.get("forcefields") or ["amber14/protein.ffxml", "amber14/tip3p.xml"]
            if not isinstance(forcefields, list) or not forcefields:
                fail("forcefields must be a non-empty list of OpenMM force field file names")
                return 0
            pdb = app.PDBFile(pdb_path)
            modeller = app.Modeller(pdb.topology, pdb.positions)
            # Hydrogens are added because most deposited structures omit them and a
            # force field cannot be applied without them. Reported so the caller
            # knows the particle count is not the one in their file.
            modeller.addHydrogens(app.ForceField(*forcefields))
            system = app.ForceField(*forcefields).createSystem(
                modeller.topology,
                nonbondedMethod=app.PME,
                nonbondedCutoff=1.0 * unit.nanometer,
                constraints=app.HBonds,
            )
            topology = modeller.topology
            positions = modeller.positions
            hydrogensAdded = True
        else:
            count = lj.get("count")
            if not isinstance(count, int) or not 1 < count <= 100_000:
                fail(f"lennardJones.count must be an integer between 2 and 100000, got {count!r}")
                return 0
            sigma = float(lj.get("sigmaNm", 0.42))
            epsilon = float(lj.get("epsilonKjMol", 1.0))
            box = float(lj.get("boxNm", 3.0))
            mass = float(lj.get("massAmu", 39.948))

            system = openmm.System()
            for _ in range(count):
                system.addParticle(mass)
            nonbonded = openmm.NonbondedForce()
            nonbonded.setNonbondedMethod(openmm.NonbondedForce.CutoffPeriodic)
            nonbonded.setCutoffDistance(min(1.0, box / 2.5) * unit.nanometer)
            for _ in range(count):
                nonbonded.addParticle(0.0, sigma, epsilon)
            system.addForce(nonbonded)
            system.setDefaultPeriodicBoxVectors(
                openmm.Vec3(box, 0, 0), openmm.Vec3(0, box, 0), openmm.Vec3(0, 0, box),
            )
            topology = app.Topology()
            chain = topology.addChain()
            residue = topology.addResidue("AR", chain)
            element = app.Element.getBySymbol("Ar")
            for _ in range(count):
                topology.addAtom("Ar", element, residue)
            # Spread the particles on a grid so they do not start on top of each
            # other, which would give an enormous initial energy that says nothing.
            side = max(1, int(round(count ** (1.0 / 3.0))))
            spacing = box / (side + 1)
            positions = [
                openmm.Vec3(
                    spacing * (1 + (index % side)),
                    spacing * (1 + ((index // side) % side)),
                    spacing * (1 + (index // (side * side))),
                )
                for index in range(count)
            ]
            forcefields = []
            hydrogensAdded = False

        integrator = openmm.LangevinMiddleIntegrator(
            temperature * unit.kelvin,
            1 / unit.picosecond,
            timestep * unit.femtoseconds,
        )
        simulation = app.Simulation(topology, system, integrator, openmm.Platform.getPlatformByName(platform_name))
        simulation.context.setPositions(positions)
        if pdb_path:
            pass  # box vectors come from the PDB/force field
        else:
            simulation.context.setPeriodicBoxVectors(*system.getDefaultPeriodicBoxVectors())

        simulation.minimizeEnergy(maxIterations=int(request.get("minimiseIterations", 500)))
        minimised = simulation.context.getState(getEnergy=True).getPotentialEnergy().value_in_unit(
            unit.kilojoule_per_mole
        )

        simulation.reporters.append(
            app.StateDataReporter(
                sys.stderr,
                max(1, steps // 5),
                step=True,
                potentialEnergy=True,
                temperature=True,
            )
        )
        simulation.step(steps)
        final = simulation.context.getState(getEnergy=True, getVelocities=True, getPositions=True)
        final_potential = final.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)
        # Taken from the same state that carries the energies. Asking a state built
        # with only getVelocities() for its kinetic energy raises, which is how the
        # first version of this failed on a run that had in fact completed.
        kinetic = final.getKineticEnergy().value_in_unit(unit.kilojoule_per_mole)
        degrees_of_freedom = 3 * system.getNumParticles()
        kb = 0.008314462618  # kJ/(mol K)
        temperature_measured = (2.0 * kinetic / (degrees_of_freedom * kb)) if degrees_of_freedom else 0.0
    except Exception as error:  # noqa: BLE001 - OpenMM raises its own exception types
        fail(f"the simulation could not be run: {error}")
        return 0

    # An energy that grows without bound means the integrator is unstable for this
    # system — usually a timestep too large. The simulation still "succeeded", so
    # reporting it as a result would hand back numbers that mean nothing.
    diverged = abs(final_potential) > max(1e6, abs(minimised) * 1000)
    if diverged:
        fail(
            f"the potential energy diverged during dynamics: {minimised:.3f} kJ/mol after minimisation, "
            f"{final_potential:.3f} kJ/mol after {steps} steps. The timestep is probably too large for this system.",
            minimisedKjMol=round(minimised, 6),
            finalKjMol=round(final_potential, 6),
        )
        return 0

    print(json.dumps({
        "ok": True,
        "platform": platform_name,
        "availablePlatforms": available,
        "particles": system.getNumParticles(),
        "forcefields": forcefields,
        "hydrogensAdded": hydrogensAdded,
        "steps": steps,
        "timestepFs": timestep,
        "simulatedTimePs": round(steps * timestep / 1000.0, 6),
        "minimisedPotentialKjMol": round(minimised, 6),
        "finalPotentialKjMol": round(final_potential, 6),
        "targetTemperatureKelvin": temperature,
        "measuredTemperatureKelvin": round(temperature_measured, 3),
        # Reported rather than claimed: the force field and the input structure
        # decide whether these numbers describe reality, and nothing here can judge
        # either.
        "physicallyValidated": False,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
