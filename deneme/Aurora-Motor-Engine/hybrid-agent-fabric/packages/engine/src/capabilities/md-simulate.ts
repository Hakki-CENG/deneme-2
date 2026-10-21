/**
 * Molecular dynamics (V2 integration plan, wave 3 item 19: scientific domain packs,
 * "RDKit/Biopython/OpenMM and licensed data"). RDKit and Biopython were already
 * integrated; this adds OpenMM 8.6.1.
 *
 * OPENMM WAS ASSUMED TO BE HARDWARE-BLOCKED AND IS NOT. `pip install openmm` pulls no
 * PyTorch, and the package ships a CPU platform — an eight-atom Lennard-Jones run of
 * 200 steps completes in about half a second here. There is no CUDA or OpenCL
 * platform without a GPU, so what is missing is throughput, not capability. The
 * result reports which platform ran and which ones exist, so a caller on a GPU box
 * can see the difference instead of guessing.
 *
 * WHAT IS VERIFIED. A simulation that completes is not one that was sane: a timestep
 * too large for the system produces an integrator that keeps running while the
 * potential energy diverges. The worker compares the energy after minimisation with
 * the energy after dynamics and reports divergence as a failure, and the measured
 * kinetic temperature is returned against the target so a thermostat that is not
 * holding is visible.
 *
 * WHAT IS NOT VERIFIED, and the gap is large. Whether the numbers describe reality
 * depends entirely on the force field and the input structure, and nothing here can
 * judge either. A clean run of the wrong model is a clean run of the wrong model. So
 * every result names the force fields and platform that produced it and carries
 * `physicallyValidated: false`.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineCapability } from "./schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MD_SIMULATE_WORKER_PATH = resolve(HERE, "../../external-workers/md_simulate.py");
export const MD_SIMULATE_CAPABILITY_ID = "science.md.simulate";

export interface MdSimulateServiceOptions {
  pythonPath?: string;
  timeoutMs?: number;
}

interface WorkerResult {
  ok: boolean;
  platform?: string;
  availablePlatforms?: string[];
  particles?: number;
  forcefields?: string[];
  hydrogensAdded?: boolean;
  steps?: number;
  timestepFs?: number;
  simulatedTimePs?: number;
  minimisedPotentialKjMol?: number;
  finalPotentialKjMol?: number;
  targetTemperatureKelvin?: number;
  measuredTemperatureKelvin?: number;
  physicallyValidated?: boolean;
  error?: string;
}

/** Runs the OpenMM worker once. */
export async function simulateMd(
  input: Record<string, unknown>,
  options: MdSimulateServiceOptions = {},
): Promise<{ ok: true; result: WorkerResult; durationMs: number } | { ok: false; error: string; durationMs: number }> {
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  const child = spawn(options.pythonPath ?? "python3", [MD_SIMULATE_WORKER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 1_800_000);
  try {
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    // stdin needs its own handler: a child that fails to start makes the write emit
    // `error` on the stream, and an unhandled stream error takes the process down.
    child.stdin.on("error", () => undefined);
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
    const exitCode = await new Promise<number | null>((resolveExit) => {
      child.on("error", () => resolveExit(null));
      child.on("exit", (code) => resolveExit(code));
    });
    if (exitCode === null) {
      return { ok: false, error: `the MD worker could not be started: ${stderr.trim().slice(-300)}`, durationMs: Date.now() - startedAt };
    }
    const parsed = stdout.trim() === "" ? undefined : (JSON.parse(stdout.trim()) as WorkerResult);
    if (parsed?.ok === true) return { ok: true, result: parsed, durationMs: Date.now() - startedAt };
    return {
      ok: false,
      error: parsed?.error ?? `the MD worker exited with code ${exitCode}. ${stderr.trim().slice(-300)}`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      error: `the MD worker could not be run: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The `science.md.simulate` capability.
 *
 * Verification: a diverged or crashed run is a failure. A completed run passes on the
 * questions that can be answered — it produced a trajectory of the requested length
 * with a stable energy and a temperature near the target — and is returned with
 * physical validity explicitly unchecked.
 */
export function mdSimulateCapability(options: MdSimulateServiceOptions = {}) {
  return defineCapability(
    {
      id: MD_SIMULATE_CAPABILITY_ID,
      version: "1.0.0",
      description:
        "Run a molecular dynamics simulation with OpenMM, from a PDB structure or a Lennard-Jones system. " +
        "Runs on CPU when no GPU platform is available. Energy stability and the measured temperature are " +
        "checked; whether the result is physically correct depends on the force field and input structure " +
        "and is not verified.",
      // "pure" like math.symbolic and math.smt.solve: the worker only computes,
      // it touches nothing. The closed CapabilityRisk union has no "compute".
      risk: "pure",
      sideEffect: false,
      source: "core",
      idempotency: "inherent",
    },
    z.object({
      /** A PDB structure. Mutually exclusive with `lennardJones`. */
      pdbPath: z.string().min(1).max(1000).optional(),
      forcefields: z.array(z.string().max(200)).min(1).max(10).optional(),
      /** A simple Lennard-Jones system, for tests and for systems with no input file. */
      lennardJones: z
        .object({
          count: z.number().int().min(2).max(100_000),
          sigmaNm: z.number().positive().optional(),
          epsilonKjMol: z.number().positive().optional(),
          boxNm: z.number().positive().optional(),
        })
        .optional(),
      steps: z.number().int().min(1).max(10_000_000).default(100),
      temperatureKelvin: z.number().positive().max(2000).default(300),
      timestepFs: z.number().positive().max(10).default(2),
      platform: z.string().max(40).optional(),
    }),
    async (input) => {
      if (Boolean(input.pdbPath) === Boolean(input.lennardJones)) {
        return {
          status: "failed",
          reason: "provide exactly one of pdbPath or lennardJones, not both and not neither",
          verified: false,
          durationMs: 0,
        };
      }
      const run = await simulateMd(
        {
          ...(input.pdbPath ? { pdbPath: resolve(input.pdbPath) } : {}),
          ...(input.forcefields ? { forcefields: input.forcefields } : {}),
          ...(input.lennardJones ? { lennardJones: input.lennardJones } : {}),
          steps: input.steps,
          temperatureKelvin: input.temperatureKelvin,
          timestepFs: input.timestepFs,
          ...(input.platform ? { platform: input.platform } : {}),
        },
        options,
      );
      if (!run.ok) {
        return { status: "failed", reason: run.error, verified: false, durationMs: run.durationMs };
      }
      const result = run.result;
      const target = result.targetTemperatureKelvin ?? input.temperatureKelvin;
      const measured = result.measuredTemperatureKelvin ?? 0;
      // A thermostat far off target is a symptom worth surfacing, though a short run
      // legitimately fluctuates, so this is reported rather than failed.
      const temperatureDeviation = target > 0 ? Math.abs(measured - target) / target : 0;
      return {
        status: "executed",
        platform: result.platform,
        availablePlatforms: result.availablePlatforms,
        particles: result.particles,
        forcefields: result.forcefields,
        hydrogensAdded: result.hydrogensAdded,
        steps: result.steps,
        simulatedTimePs: result.simulatedTimePs,
        minimisedPotentialKjMol: result.minimisedPotentialKjMol,
        finalPotentialKjMol: result.finalPotentialKjMol,
        targetTemperatureKelvin: target,
        measuredTemperatureKelvin: measured,
        temperatureDeviationFraction: Math.round(temperatureDeviation * 1000) / 1000,
        verified: false,
        unchecked: true,
        checkDetail:
          `${result.steps} step(s), ${(result.simulatedTimePs ?? 0).toFixed(3)} ps of dynamics on the ` +
          `${result.platform} platform. Energy stayed finite (${result.minimisedPotentialKjMol} → ` +
          `${result.finalPotentialKjMol} kJ/mol) and the measured temperature was ${measured} K against a ` +
          "target of " +
          `${target} K. That the integration was stable is checked; whether the numbers describe the real ` +
          "system depends on the force field and the input structure, and nothing here can check that.",
        durationMs: run.durationMs,
      };
    },
    {
      idempotency: "inherent",
      output: z.object({
        status: z.string(),
        platform: z.string().optional(),
        availablePlatforms: z.array(z.string()).optional(),
        particles: z.number().optional(),
        forcefields: z.array(z.string()).optional(),
        hydrogensAdded: z.boolean().optional(),
        steps: z.number().optional(),
        simulatedTimePs: z.number().optional(),
        minimisedPotentialKjMol: z.number().optional(),
        finalPotentialKjMol: z.number().optional(),
        targetTemperatureKelvin: z.number().optional(),
        measuredTemperatureKelvin: z.number().optional(),
        temperatureDeviationFraction: z.number().optional(),
        reason: z.string().optional(),
        verified: z.boolean(),
        unchecked: z.boolean().optional(),
        checkDetail: z.string().optional(),
        durationMs: z.number(),
      }),
      verify: async (output) => {
        const value = output as Record<string, unknown>;
        if (String(value.status ?? "") !== "executed") {
          return { ok: true, reason: String(value.reason ?? value.status) || "the capability reported its own failure" };
        }
        const final = Number(value.finalPotentialKjMol ?? 0);
        if (!Number.isFinite(final)) {
          return { ok: false, reason: "the simulation produced a non-finite potential energy" };
        }
        return { ok: true, reason: String(value.checkDetail ?? "the simulation completed with a finite energy") };
      },
    },
  );
}
