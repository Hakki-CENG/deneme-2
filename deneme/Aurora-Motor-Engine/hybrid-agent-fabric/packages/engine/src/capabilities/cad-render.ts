/**
 * Parametric 3D model rendering (V2 integration plan, wave 3 item 18: "Creative
 * 3D/CAD: Blender/FreeCAD/OpenSCAD").
 *
 * Of the three the plan names, OpenSCAD is the one that is measurable here: it is a
 * single headless binary that turns source into a mesh with no display and no GPU.
 * Blender is GUI-first and FreeCAD is heavy; neither is integrated, and this file
 * does not pretend otherwise.
 *
 * WHY A RENDER NEEDS VERIFYING AT ALL. `openscad` exiting 0 says the source was
 * accepted. It does not say anything about the shape that came out — a scale that is
 * wrong by a factor of ten, a difference() that ate the whole model, or a file
 * truncated on the way out all still produce a valid STL and a clean exit. So the
 * mesh is parsed back and measured: triangle count, volume, bounding box, and whether
 * every edge is shared by exactly two triangles. Those are properties of the geometry
 * itself rather than of the process that produced it, which is the same move as
 * substituting a Z3 model back into the constraints that produced it.
 *
 * The volume is the strongest of them. For a closed mesh it is computed from the
 * triangles alone, so a caller who knows the intended dimensions can compare — a
 * 10x20x30 box must come back as 6000, and a render at the wrong scale cannot fake
 * that. Measured before relying on it: a centred 10x20x30 cube rendered by
 * OpenSCAD 2021.01 gives exactly 6000 from twelve triangles.
 *
 * WHAT THIS DOES NOT SANDBOX, stated plainly because the opposite would be a lie.
 * OpenSCAD source is code, and `include`, `use` and `import` read files from disk.
 * There is no shell execution in the language, but a `.scad` file can still pull in
 * anything the process can read, and a failing `import` echoes paths into the error
 * output. So untrusted source should not be rendered by this capability. That is a
 * real limitation and it is reported in the manifest rather than left for someone to
 * discover.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { defineCapability } from "./schema.js";

export const CAD_RENDER_CAPABILITY_ID = "cad.render";
export const CAD_RENDER_INSTALL_HINT =
  "a system package: apt-get install openscad (macOS: brew install --cask openscad)";

/** Finds the OpenSCAD binary. */
export function findOpenscadBinary(): string | null {
  try {
    for (const candidate of ["openscad", "openscad-nightly"]) {
      if (spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0) return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

export interface MeshMetrics {
  triangles: number;
  /** Signed volume from the divergence theorem; zero for an empty or flat mesh. */
  volume: number;
  boundingBox: { x: number; y: number; z: number };
  min: [number, number, number];
  max: [number, number, number];
  /**
   * True when every edge is shared by exactly two triangles. This is what
   * "watertight" means, and it is what makes the volume figure trustworthy: the
   * divergence theorem needs a closed surface, so an open mesh gives a number that
   * looks like a volume and means nothing.
   */
  watertight: boolean;
  /** Edges not shared by exactly two faces; empty when watertight. */
  boundaryEdges: number;
}

type Vec3 = [number, number, number];

/**
 * Parses an ASCII STL and measures the mesh.
 *
 * Returns `null` rather than throwing when the file is not an ASCII STL, so a caller
 * can tell "the render produced something unreadable" from "the render produced an
 * empty model" — those need different answers.
 */
export function measureStl(contents: string): MeshMetrics | null {
  if (!contents.startsWith("solid")) return null;

  const vertices: Vec3[] = [];
  const pattern = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  for (const match of contents.matchAll(pattern)) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const z = Number(match[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    vertices.push([x, y, z]);
  }
  if (vertices.length === 0) return null;
  // A triangle needs three vertices; a count that is not a multiple of three means
  // the file was truncated, which is worth reporting rather than silently dropping
  // the remainder.
  if (vertices.length % 3 !== 0) return null;

  const triangles = vertices.length / 3;
  let volume = 0;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  /** Edge → how many triangles use it, keyed so a-b and b-a collide. */
  const edges = new Map<string, number>();

  const key = (point: Vec3): string => point.map((value) => value.toFixed(6)).join(",");

  for (let index = 0; index < vertices.length; index += 3) {
    const a = vertices[index]!;
    const b = vertices[index + 1]!;
    const c = vertices[index + 2]!;

    // Signed tetrahedron volume against the origin; the sum over a closed mesh is
    // the enclosed volume regardless of where the mesh sits.
    const cross: Vec3 = [
      b[1] * c[2] - b[2] * c[1],
      b[2] * c[0] - b[0] * c[2],
      b[0] * c[1] - b[1] * c[0],
    ];
    volume += (a[0] * cross[0] + a[1] * cross[1] + a[2] * cross[2]) / 6;

    for (const point of [a, b, c]) {
      for (let axis = 0; axis < 3; axis++) {
        const current = point[axis]!;
        if (current < min[axis]!) min[axis] = current;
        if (current > max[axis]!) max[axis] = current;
      }
    }

    for (const [start, end] of [[a, b], [b, c], [c, a]] as [Vec3, Vec3][]) {
      const startKey = key(start);
      const endKey = key(end);
      const edgeKey = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
      edges.set(edgeKey, (edges.get(edgeKey) ?? 0) + 1);
    }
  }

  let boundaryEdges = 0;
  for (const count of edges.values()) {
    if (count !== 2) boundaryEdges++;
  }

  return {
    triangles,
    volume,
    boundingBox: {
      x: max[0]! - min[0]!,
      y: max[1]! - min[1]!,
      z: max[2]! - min[2]!,
    },
    min: [min[0]!, min[1]!, min[2]!],
    max: [max[0]!, max[1]!, max[2]!],
    watertight: boundaryEdges === 0,
    boundaryEdges,
  };
}

export interface CadRenderServiceOptions {
  openscadPath?: string;
  timeoutMs?: number;
}

/** Renders OpenSCAD source to an ASCII STL in a temporary directory. */
export async function renderScad(
  source: string,
  options: CadRenderServiceOptions = {},
): Promise<
  | { status: "executed"; stl: string; stderr: string; durationMs: number }
  | { status: "unavailable"; stderr: string; durationMs: number }
  | { status: "failed"; stderr: string; exitCode?: number; durationMs: number }
> {
  const startedAt = Date.now();
  const binary = options.openscadPath ?? findOpenscadBinary();
  if (!binary) {
    return {
      status: "unavailable",
      stderr: `OpenSCAD is not installed. It is ${CAD_RENDER_INSTALL_HINT}.`,
      durationMs: Date.now() - startedAt,
    };
  }

  const directory = await mkdtemp(join(tmpdir(), "haf-cad-"));
  const sourceFile = join(directory, "Model.scad");
  const outputFile = join(directory, "Model.stl");
  try {
    await writeFile(sourceFile, source, "utf8");
    let stderr = "";
    // No --enable flags: the experimental features are not needed for solid
    // geometry and widening the language surface here buys nothing.
    const child = spawn(binary, ["-o", outputFile, sourceFile], {
      cwd: directory,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 120_000);
    try {
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      // `error` as well as `exit`: spawning a path that does not exist emits only
      // `error`, and waiting on `exit` alone hangs forever.
      const exitCode = await new Promise<number | null>((resolveExit) => {
        child.on("error", () => resolveExit(null));
        child.on("exit", (code) => resolveExit(code));
      });
      if (exitCode === null) {
        return {
          status: "unavailable",
          stderr: `OpenSCAD could not be started at ${binary}. It is ${CAD_RENDER_INSTALL_HINT}.`,
          durationMs: Date.now() - startedAt,
        };
      }
      if (exitCode !== 0) {
        return {
          status: "failed",
          stderr: stderr.trim() || `openscad exited with code ${exitCode} and produced no message`,
          exitCode,
          durationMs: Date.now() - startedAt,
        };
      }
      if (!existsSync(outputFile)) {
        // A clean exit with no output file is not a success. OpenSCAD does this for
        // source that parses but describes no geometry.
        return {
          status: "failed",
          stderr:
            "OpenSCAD exited 0 but wrote no STL. The source parses but produces no geometry " +
            "(an empty model, or a difference() that removed everything).",
          exitCode,
          durationMs: Date.now() - startedAt,
        };
      }
      const stl = await readFile(outputFile, "utf8");
      return { status: "executed", stl, stderr: stderr.trim(), durationMs: Date.now() - startedAt };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return {
      status: "failed",
      stderr: `the render could not be run: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * The `cad.render` capability.
 *
 * Verification is about the geometry, not the process. A render that produced no
 * triangles fails. One that produced an open mesh is reported with the volume marked
 * untrustworthy rather than being handed over as a number that looks like a volume.
 */
export function cadRenderCapability(options: CadRenderServiceOptions = {}) {
  return defineCapability(
    {
      id: CAD_RENDER_CAPABILITY_ID,
      version: "1.0.0",
      description:
        "Render OpenSCAD source to an STL mesh and measure the result: triangle count, volume, " +
        "bounding box and watertightness. Returns 'unavailable' if OpenSCAD is not installed. " +
        "Note that OpenSCAD source can read files via include/import, so untrusted source " +
        "should not be rendered.",
      risk: "workspace_write",
      sideEffect: false,
      source: "core",
      idempotency: "inherent",
    },
    z.object({
      source: z.string().min(1).max(500_000),
      /**
       * The volume the caller expects, so the render can be checked against intent
       * rather than merely reported. Compared with a relative tolerance.
       */
      expectedVolume: z.number().positive().optional(),
    }),
    async (input) => {
      const run = await renderScad(input.source, options);
      if (run.status === "unavailable") {
        return { status: "unavailable", reason: run.stderr, verified: false, durationMs: run.durationMs };
      }
      if (run.status === "failed") {
        return { status: "failed", reason: run.stderr, verified: false, durationMs: run.durationMs };
      }

      const metrics = measureStl(run.stl);
      if (!metrics) {
        return {
          status: "failed",
          reason:
            "OpenSCAD produced output that is not a readable ASCII STL. A truncated or binary " +
            "mesh cannot be measured, and an unmeasured mesh is not reported as a success.",
          verified: false,
          durationMs: run.durationMs,
        };
      }
      if (metrics.triangles === 0) {
        return {
          status: "failed",
          reason: "the render produced a mesh with no triangles, so there is no model",
          verified: false,
          durationMs: run.durationMs,
        };
      }

      const volume = Math.abs(metrics.volume);
      let volumeMatches: boolean | undefined;
      if (input.expectedVolume !== undefined) {
        const tolerance = input.expectedVolume * 0.001;
        volumeMatches = Math.abs(volume - input.expectedVolume) <= Math.max(tolerance, 1e-9);
      }

      // An open mesh has no well-defined volume: the divergence theorem needs a
      // closed surface. Reporting the number anyway would hand over something that
      // looks like a measurement and is not one.
      const trustworthyVolume = metrics.watertight;

      const failures: string[] = [];
      if (!trustworthyVolume) {
        failures.push(
          `the mesh is not watertight (${metrics.boundaryEdges} edge(s) are not shared by exactly ` +
          "two triangles), so its volume is not meaningful",
        );
      }
      if (volumeMatches === false) {
        failures.push(
          `the measured volume ${volume.toFixed(6)} does not match the expected ` +
          `${input.expectedVolume} — the render is not the shape that was asked for`,
        );
      }

      return {
        status: "executed",
        triangles: metrics.triangles,
        volume,
        volumeMeasured: trustworthyVolume,
        ...(volumeMatches === undefined ? {} : { volumeMatchesExpected: volumeMatches }),
        boundingBox: metrics.boundingBox,
        watertight: metrics.watertight,
        boundaryEdges: metrics.boundaryEdges,
        stl: run.stl,
        verified: failures.length === 0,
        ...(failures.length === 0 ? {} : { unchecked: true }),
        checkDetail:
          failures.length === 0
            ? `${metrics.triangles} triangle(s), volume ${volume.toFixed(6)} from a watertight mesh` +
              (volumeMatches === true ? ", matching the expected volume" : "")
            : failures.join("; "),
        durationMs: run.durationMs,
      };
    },
    {
      idempotency: "inherent",
      output: z.object({
        status: z.string(),
        triangles: z.number().optional(),
        volume: z.number().optional(),
        volumeMeasured: z.boolean().optional(),
        volumeMatchesExpected: z.boolean().optional(),
        boundingBox: z
          .object({ x: z.number(), y: z.number(), z: z.number() })
          .optional(),
        watertight: z.boolean().optional(),
        boundaryEdges: z.number().optional(),
        stl: z.string().optional(),
        reason: z.string().optional(),
        verified: z.boolean(),
        unchecked: z.boolean().optional(),
        checkDetail: z.string().optional(),
        durationMs: z.number(),
      }),
      /**
       * A render is verified when it produced a watertight mesh of non-zero size
       * and, if the caller stated an intended volume, the mesh matches it. An open
       * mesh or a volume mismatch is a failure, not a warning: both mean the thing
       * that came out is not the thing that was asked for.
       */
      verify: async (output) => {
        const value = output as Record<string, unknown>;
        const status = String(value.status ?? "");
        if (status === "unavailable") {
          return { ok: true, reason: String(value.reason ?? "OpenSCAD is not installed") };
        }
        if (status !== "executed") {
          return { ok: true, reason: String(value.reason ?? status) || "the capability reported its own failure" };
        }
        if (value.verified === false) {
          return { ok: false, reason: String(value.checkDetail ?? "the rendered mesh did not measure up") };
        }
        return { ok: true, reason: String(value.checkDetail ?? "the mesh was measured and holds together") };
      },
    },
  );
}

/** Re-exported so a caller can measure a mesh it already has, without a render. */
export function stlVolume(stl: string): number | null {
  const metrics = measureStl(stl);
  return metrics ? Math.abs(metrics.volume) : null;
}

/** Kept for symmetry with the other capabilities' install reporting. */
export function cadInstallHint(): string {
  return CAD_RENDER_INSTALL_HINT;
}

/** True if a file looks like an ASCII STL, for callers routing between formats. */
export function isAsciiStl(contents: string): boolean {
  return contents.startsWith("solid") && contents.includes("facet normal");
}

/** Exposed so the temporary-directory convention is testable. */
export function scadTempRoot(): string {
  return dirname(join(tmpdir(), "haf-cad-"));
}
