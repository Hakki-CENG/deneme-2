/**
 * OpenMM molecular dynamics.
 *
 * OpenMM was assumed to need a GPU and so to be out of reach here. Measured instead:
 * it installs without PyTorch and ships a CPU platform, so these cases run a real
 * simulation — an eight-atom Lennard-Jones system, 200 steps, in well under a second.
 * A machine without a GPU has no CUDA or OpenCL platform, which costs throughput and
 * not capability, and the result reports which platform ran so the difference is
 * visible rather than assumed.
 *
 * What is asserted is that the integration was sane: the energy stayed finite and the
 * measured temperature landed near the target. No case asserts the numbers are
 * physically correct, because that depends on the force field and the input structure
 * and nothing here can judge either.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  MD_SIMULATE_CAPABILITY_ID,
  mdSimulateCapability,
  simulateMd,
} from "../src/capabilities/md-simulate.js";

const hasOpenmm =
  spawnSync("python3", ["-c", "import openmm"], { stdio: "ignore" }).status === 0;

describe("input handling that needs no simulation", () => {
  it("refuses both a structure and a generated system at once", async () => {
    const capability = mdSimulateCapability();
    const output = (await capability.execute({
      pdbPath: "/some/structure.pdb",
      lennardJones: { count: 8 },
    })) as Record<string, unknown>;
    expect(output.status).toBe("failed");
    expect(String(output.reason)).toContain("exactly one");
  });

  it("refuses neither", async () => {
    const capability = mdSimulateCapability();
    const output = (await capability.execute({ steps: 10 })) as Record<string, unknown>;
    expect(output.status).toBe("failed");
    expect(String(output.reason)).toContain("exactly one");
  });

  it("reports a worker that cannot start rather than hanging", async () => {
    const capability = mdSimulateCapability({ pythonPath: "/nonexistent/python3" });
    const output = (await capability.execute({
      lennardJones: { count: 4 },
      steps: 5,
    })) as Record<string, unknown>;
    expect(output.status).toBe("failed");
    expect(output.verified).toBe(false);
  });

  it("exposes the capability id", () => {
    expect(MD_SIMULATE_CAPABILITY_ID).toBe("science.md.simulate");
  });
});

describe.skipIf(!hasOpenmm)("a real simulation on the CPU platform", () => {
  it("runs and reports a finite energy and a temperature near the target", async () => {
    const run = await simulateMd({
      lennardJones: { count: 8, sigmaNm: 0.42, epsilonKjMol: 1.0, boxNm: 3 },
      steps: 200,
      temperatureKelvin: 94,
    });

    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.result.particles).toBe(8);
    expect(run.result.steps).toBe(200);
    expect(run.result.simulatedTimePs).toBeCloseTo(0.4, 3);
    expect(Number.isFinite(run.result.finalPotentialKjMol)).toBe(true);
    // The worker names the platform it used and the ones available, so a caller on a
    // GPU box can tell what is missing instead of guessing.
    expect(run.result.availablePlatforms).toContain("CPU");
    expect(run.result.physicallyValidated).toBe(false);
  });

  it("holds the temperature within a plausible band of the target", async () => {
    const capability = mdSimulateCapability();
    const output = (await capability.execute({
      lennardJones: { count: 8 },
      steps: 400,
      temperatureKelvin: 120,
    })) as Record<string, unknown>;

    expect(output.status).toBe("executed");
    expect(output.verified).toBe(false);
    expect(output.unchecked).toBe(true);
    const measured = Number(output.measuredTemperatureKelvin);
    // A short Langevin run fluctuates, so this is a band rather than an equality.
    expect(measured).toBeGreaterThan(30);
    expect(measured).toBeLessThan(400);
    expect(String(output.checkDetail)).toContain("nothing here can check that");

    const verdict = await capability.verify(output, { lennardJones: { count: 8 } }, {} as never);
    expect(verdict.ok).toBe(true);
  });

  it("rejects a timestep that is out of range instead of simulating with it", async () => {
    const run = await simulateMd({ lennardJones: { count: 4 }, steps: 10, timestepFs: 50 });
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.error).toContain("timestepFs");
  });

  it("rejects a platform that does not exist here and says which do", async () => {
    const run = await simulateMd({ lennardJones: { count: 4 }, steps: 10, platform: "DefinitelyNotAPlatform" });
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.error).toContain("not available here");
    expect(run.error).toContain("CPU");
  });

  it("fails a non-finite energy rather than returning it as a result", async () => {
    const capability = mdSimulateCapability();
    const verdict = await capability.verify(
      { status: "executed", finalPotentialKjMol: Number.NaN, verified: false, durationMs: 1 },
      { lennardJones: { count: 4 } },
      {} as never,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("non-finite");
  });
});
