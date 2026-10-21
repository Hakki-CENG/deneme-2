/**
 * FAZ 6 3/4 — the built-in experts are reachable, and the gaps are named.
 *
 * The load-bearing test reads src/capabilities/ and asks whether a host that
 * registered everything the engine ships can actually run the coding expert. If
 * the answer were no, the expert would be a definition nothing could use.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BUILT_IN_EXPERT_FACTORIES,
  builtInExpertRegistry,
  builtInExpertToolRecords,
  builtInExperts,
  missingCapabilitiesForBuiltIns,
} from "../src/experts/built-in-experts.js";
import type { CapabilitySource } from "../src/experts/expert-registry.js";
import type { CapabilityDescriptor, CapabilityRisk } from "../src/types.js";

/** Every capability id registered anywhere under src/capabilities/. */
async function registeredIds(): Promise<string[]> {
  const dir = join(process.cwd(), "src", "capabilities");
  const ids: string[] = [];
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith(".ts")) continue;
    const text = await readFile(join(dir, entry), "utf8");
    for (const match of text.matchAll(/id:\s*"([a-z][a-z0-9.-]*)"/g)) ids.push(match[1] as string);
  }
  return [...new Set(ids)];
}

function source(ids: readonly string[], risk: CapabilityRisk = "process"): CapabilitySource {
  const descriptors: CapabilityDescriptor[] = ids.map((id) => ({
    id,
    version: "1.0.0",
    description: id,
    risk,
    sideEffect: false,
    inputSchema: {},
    source: "core",
  }));
  return { list: () => descriptors };
}

describe("a host with everything the engine ships can run the coding expert", () => {
  it("validates clean against the real capability set", async () => {
    const ids = await registeredIds();
    expect(ids.length).toBeGreaterThan(50);

    const { standing, usable, registry } = builtInExpertRegistry(source(ids));
    expect(standing.map((entry) => [entry.expertId, entry.problems])).toEqual([["coding", []]]);
    expect(usable).toEqual(["coding"]);
    expect(registry.usable("coding")).toBeDefined();
    expect(missingCapabilitiesForBuiltIns(source(ids))).toEqual([]);
  });
});

describe("an unsupported host is told, not silently served", () => {
  it("registers the expert anyway so the gap is reportable", async () => {
    const ids = await registeredIds();
    const withoutCodeTools = ids.filter((id) => !id.startsWith("code."));

    const { standing, usable, registry } = builtInExpertRegistry(source(withoutCodeTools));

    // Registered, so `standing` can explain what is wrong...
    expect(registry.get("coding")).toBeDefined();
    // ...but not handed out.
    expect(registry.usable("coding")).toBeUndefined();
    expect(usable).toEqual([]);
    expect(standing[0]?.problems.some((p) => p.includes("code.symbols"))).toBe(true);
  });

  it("names exactly the capabilities that are missing", async () => {
    const ids = await registeredIds();
    const missing = missingCapabilitiesForBuiltIns(source(ids.filter((id) => id !== "verify.run")));
    expect(missing).toEqual(["verify.run"]);
  });

  it("reports nothing missing for an empty host only when there is nothing to report", async () => {
    const missing = missingCapabilitiesForBuiltIns(source([]));
    // An empty host is missing everything the expert declares — not nothing.
    expect(missing.length).toBe(BUILT_IN_EXPERT_FACTORIES[0]!().tools.length);
  });
});

describe("the built-in list itself", () => {
  it("ships the coding expert", () => {
    expect(builtInExperts().map((expert) => expert.id)).toEqual(["coding"]);
  });

  it("exposes tool records for hosts that validate by hand", () => {
    const records = builtInExpertToolRecords();
    expect(records.map((record) => record.id)).toEqual(builtInExperts()[0]!.tools);
  });

  it("declares no duplicate tools", () => {
    // A duplicate would be counted twice by a coverage report and hide a gap.
    for (const expert of builtInExperts()) {
      expect(new Set(expert.tools).size, expert.id).toBe(expert.tools.length);
    }
  });

  it("serves code_change, so FAZ 5 routing can reach it", () => {
    // Without this the 2/4 rule could never fire in a real deployment: routing
    // keys on servesCapabilities, not on the expert's id.
    expect(builtInExperts()[0]!.servesCapabilities).toContain("code_change");
  });
});
