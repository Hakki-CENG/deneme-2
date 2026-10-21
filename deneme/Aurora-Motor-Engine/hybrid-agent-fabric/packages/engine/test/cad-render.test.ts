/**
 * OpenSCAD rendering, with the mesh measured rather than trusted.
 *
 * OpenSCAD 2021.01 is installed in this environment, so unlike the Lean cases these
 * run for real: source goes in, a mesh comes out, and the mesh is measured.
 *
 * The centre of the file is the volume check. `openscad` exiting 0 says the source
 * was accepted and nothing about the shape — a scale wrong by a factor of ten still
 * produces a valid STL and a clean exit. So a render is compared against the volume
 * the caller asked for, and a mismatch is a failure. That is the same move as
 * substituting a Z3 model back into its constraints: check the answer against the
 * question instead of accepting that an answer arrived.
 */
import { describe, expect, it } from "vitest";
import {
  CAD_RENDER_INSTALL_HINT,
  cadRenderCapability,
  findOpenscadBinary,
  isAsciiStl,
  measureStl,
  renderScad,
  stlVolume,
} from "../src/capabilities/cad-render.js";

const openscad = findOpenscadBinary();

/** Builds an ASCII STL by hand, so mesh parsing can be tested without a render. */
function asciiStl(triangles: [number, number, number][][]): string {
  const facets = triangles
    .map(
      (triangle) =>
        "  facet normal 0 0 0\n    outer loop\n" +
        triangle.map((vertex) => `      vertex ${vertex[0]} ${vertex[1]} ${vertex[2]}`).join("\n") +
        "\n    endloop\n  endfacet",
    )
    .join("\n");
  return `solid test\n${facets}\nendsolid test\n`;
}

/** Two triangles sharing one edge: an open surface, not a solid. */
const OPEN_MESH = asciiStl([
  [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
  [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
]);

describe("mesh measurement, which is pure logic", () => {
  it("computes the volume of a closed mesh from its triangles", () => {
    // A unit tetrahedron at the origin has volume 1/6.
    const mesh = asciiStl([
      [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      [[0, 0, 0], [0, 1, 0], [0, 0, 1]],
      [[0, 0, 0], [0, 0, 1], [1, 0, 0]],
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    ]);
    const metrics = measureStl(mesh);
    expect(metrics).not.toBeNull();
    expect(metrics?.triangles).toBe(4);
    expect(Math.abs(metrics!.volume)).toBeCloseTo(1 / 6, 9);
    expect(metrics?.watertight).toBe(true);
  });

  it("reports an open mesh as not watertight, so its volume is not trusted", () => {
    const metrics = measureStl(OPEN_MESH);
    expect(metrics).not.toBeNull();
    expect(metrics?.watertight).toBe(false);
    expect(metrics!.boundaryEdges).toBeGreaterThan(0);
  });

  it("measures the bounding box", () => {
    const metrics = measureStl(OPEN_MESH);
    expect(metrics?.boundingBox).toEqual({ x: 1, y: 1, z: 0 });
    expect(metrics?.min).toEqual([0, 0, 0]);
    expect(metrics?.max).toEqual([1, 1, 0]);
  });

  it("returns null for something that is not an ASCII STL", () => {
    expect(measureStl("binary garbage \u0000\u0001\u0002")).toBeNull();
    expect(measureStl("solid x\nendsolid x\n")).toBeNull(); // no vertices at all
    expect(isAsciiStl("binary garbage")).toBe(false);
    expect(isAsciiStl(OPEN_MESH)).toBe(true);
  });

  it("returns null for a truncated file rather than measuring the remainder", () => {
    // Two vertices cannot form a triangle. Silently dropping the partial remainder
    // would report a mesh that is not the one on disk.
    const truncated = "solid x\n  facet normal 0 0 0\n    outer loop\n      vertex 0 0 0\n      vertex 1 0 0\n";
    expect(measureStl(truncated)).toBeNull();
  });

  it("exposes a volume helper for callers that already have a mesh", () => {
    expect(stlVolume(OPEN_MESH)).not.toBeNull();
    expect(stlVolume("not an stl")).toBeNull();
  });
});

describe.skipIf(!openscad)("a real render, measured", () => {
  it("renders a box and the volume comes back exactly", async () => {
    const result = await renderScad("cube(size = [10, 20, 30], center = true);");
    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;

    const metrics = measureStl(result.stl);
    expect(metrics).not.toBeNull();
    // A cube is six faces, and STL stores each as two triangles.
    expect(metrics?.triangles).toBe(12);
    expect(metrics?.watertight).toBe(true);
    // 10 x 20 x 30. Exact, not approximate: the mesh is axis-aligned.
    expect(Math.abs(metrics!.volume)).toBeCloseTo(6000, 6);
    expect(metrics?.boundingBox).toEqual({ x: 10, y: 20, z: 30 });
  });

  it("verifies a render against the volume the caller asked for", async () => {
    const capability = cadRenderCapability();
    const output = (await capability.execute({
      source: "cube(size = [10, 20, 30], center = true);",
      expectedVolume: 6000,
    })) as Record<string, unknown>;

    expect(output.status).toBe("executed");
    expect(output.verified).toBe(true);
    expect(output.volumeMatchesExpected).toBe(true);
    expect(output.volumeMeasured).toBe(true);
    expect(String(output.checkDetail)).toContain("matching the expected volume");

    const verdict = await capability.verify(output, { source: "x" }, {} as never);
    expect(verdict.ok).toBe(true);
  });

  /**
   * The case the volume check exists for. The render succeeds, the STL is valid, the
   * mesh is watertight — and it is the wrong shape. Nothing about the process
   * reveals that; only comparing the geometry against the intent does.
   */
  it("fails a render whose geometry is not what was asked for", async () => {
    const capability = cadRenderCapability();
    const output = (await capability.execute({
      // Off by a factor of ten in every axis: 6_000_000 rather than 6_000.
      source: "cube(size = [100, 200, 300], center = true);",
      expectedVolume: 6000,
    })) as Record<string, unknown>;

    expect(output.status).toBe("executed");
    expect(output.verified).toBe(false);
    expect(output.volumeMatchesExpected).toBe(false);
    expect(String(output.checkDetail)).toContain("does not match the expected");

    const verdict = await capability.verify(output, { source: "x" }, {} as never);
    expect(verdict.ok).toBe(false);
  });

  it("reports a source that produces no geometry as a failure, not an empty success", async () => {
    const result = await renderScad("difference() { cube(10); cube(20, center = true); }");
    // The larger cube removes the smaller one entirely. OpenSCAD may exit 0 with no
    // output or write an empty mesh; either way it must not read as a rendered model.
    if (result.status === "executed") {
      const metrics = measureStl(result.stl);
      expect(metrics === null || metrics.triangles === 0).toBe(true);
    } else {
      expect(result.status).toBe("failed");
    }
  });

  it("surfaces a syntax error rather than a generic failure", async () => {
    const result = await renderScad("cube(size = [10, 20;");
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("renders a difference and the volume reflects what was removed", async () => {
    const capability = cadRenderCapability();
    // A 10x10x10 block with a 2x2x10 hole through it: 1000 - 40 = 960.
    const output = (await capability.execute({
      source:
        "difference() { cube([10, 10, 10], center = true); " +
        "cube([2, 2, 10], center = true); }",
      expectedVolume: 960,
    })) as Record<string, unknown>;

    expect(output.status).toBe("executed");
    expect(output.verified).toBe(true);
    expect(output.volumeMatchesExpected).toBe(true);
  });
});

describe("a missing renderer is a reported condition", () => {
  it("names how to install it", async () => {
    const capability = cadRenderCapability({ openscadPath: "/nonexistent/openscad" });
    const output = (await capability.execute({ source: "cube(10);" })) as Record<string, unknown>;

    expect(output.status).toBe("unavailable");
    expect(output.verified).toBe(false);
    expect(String(output.reason)).toContain(CAD_RENDER_INSTALL_HINT);
  });

  it("exposes the hint so a caller can act on it", () => {
    expect(CAD_RENDER_INSTALL_HINT).toContain("openscad");
  });
});
