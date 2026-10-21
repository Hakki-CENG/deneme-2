/**
 * P4 — Expert Fabric: the registry.
 *
 * The load-bearing claim in expert-registry.ts is that validation is not a
 * one-off gate at registration: capabilities arrive after startup, so every read
 * re-checks. These tests hold that claim to it with a capability source that
 * changes between registration and read.
 */

import { describe, expect, it } from "vitest";

import { ExpertRegistry, type CapabilitySource } from "../src/experts/expert-registry.js";
import type { ExpertDefinition } from "../src/experts/expert-definition.js";
import type { CapabilityDescriptor, CapabilityRisk } from "../src/types.js";

function descriptor(id: string, risk: CapabilityRisk): CapabilityDescriptor {
  return {
    id,
    version: "1.0.0",
    description: id,
    risk,
    sideEffect: false,
    inputSchema: {},
    source: "core",
  };
}

/** A capability source whose contents a test can change under the registry. */
function mutableSource(initial: CapabilityDescriptor[] = []): CapabilitySource & { set(next: CapabilityDescriptor[]): void } {
  let current = [...initial];
  return {
    list: () => current,
    set(next) {
      current = [...next];
    },
  };
}

function expert(overrides: Partial<ExpertDefinition> = {}): ExpertDefinition {
  return {
    id: "coding",
    domain: "software-engineering",
    tools: ["agent.list"],
    safety: { maxCapabilityRisk: "workspace_read" },
    memoryNamespace: "expert.coding",
    ...overrides,
  };
}

const BASE = [descriptor("agent.list", "pure"), descriptor("agent.spawn", "process")];

describe("registration", () => {
  it("reports problems at the moment of registration", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    const registration = registry.register(expert({ tools: ["agent.list", "ghost.tool"] }));
    expect(registration.usable).toBe(false);
    expect(registration.problems.some((p) => p.includes("ghost.tool"))).toBe(true);
  });

  it("accepts a clean expert", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    const registration = registry.register(expert());
    expect(registration.problems).toEqual([]);
    expect(registration.usable).toBe(true);
  });

  it("says when an id was replaced", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    expect(registry.register(expert()).replaced).toBe(false);
    expect(registry.register(expert({ memoryNamespace: "expert.coding.v2" })).replaced).toBe(true);
    expect(registry.get("coding")?.memoryNamespace).toBe("expert.coding.v2");
  });
});

describe("re-validation on read", () => {
  it("an expert that was fine becomes unusable when its capability disappears", () => {
    const source = mutableSource(BASE);
    const registry = new ExpertRegistry(source);
    expect(registry.register(expert()).usable).toBe(true);

    // The broker can drop or replace capabilities at runtime.
    source.set([descriptor("agent.spawn", "process")]);

    expect(registry.usable("coding")).toBeUndefined();
    expect(registry.problemsFor("coding").some((p) => p.includes("not a registered capability"))).toBe(true);
    // The declaration itself did not change; only the world did.
    expect(registry.get("coding")).toBeDefined();
  });

  it("an expert that looked broken becomes usable when its capability arrives", () => {
    const source = mutableSource(BASE);
    const registry = new ExpertRegistry(source);
    const registration = registry.register(expert({ tools: ["mcp.late.tool"] }));
    expect(registration.usable).toBe(false);
    expect(registry.usable("coding")).toBeUndefined();

    source.set([...BASE, descriptor("mcp.late.tool", "pure")]);

    expect(registry.usable("coding")).toBeDefined();
    expect(registry.problemsFor("coding")).toEqual([]);
  });

  it("a tool that grows riskier than the ceiling makes the expert unusable", () => {
    const source = mutableSource([descriptor("agent.list", "pure")]);
    const registry = new ExpertRegistry(source);
    expect(registry.register(expert()).usable).toBe(true);

    source.set([descriptor("agent.list", "privileged")]);

    expect(registry.usable("coding")).toBeUndefined();
    expect(registry.problemsFor("coding").some((p) => p.includes("above its risk ceiling"))).toBe(true);
  });
});

describe("usable", () => {
  it("returns undefined for an id that was never registered", () => {
    expect(new ExpertRegistry(mutableSource(BASE)).usable("nobody")).toBeUndefined();
  });

  it("reports nothing wrong for an id that was never registered", () => {
    // "Nothing is wrong with it" and "it exists" are different facts; problemsFor
    // answers the first. `get` answers the second.
    const registry = new ExpertRegistry(mutableSource(BASE));
    expect(registry.problemsFor("nobody")).toEqual([]);
    expect(registry.get("nobody")).toBeUndefined();
  });

  it("withholds an expert whose tools are over its ceiling", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    registry.register(expert({ tools: ["agent.spawn"] })); // process > workspace_read
    expect(registry.usable("coding")).toBeUndefined();
  });
});

describe("resolveRoute delegates to the P2 policy resolver", () => {
  it("returns the expert's stage route", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    registry.register(
      expert({
        modelPolicy: {
          stages: { planning: { route: "openai:gpt-5", reason: "planning needs the strong model" } },
        },
      }),
    );
    const resolution = registry.resolveRoute("coding", "planning");
    expect(resolution.source).toBe("stage");
    expect(resolution.route).toBe("openai:gpt-5");
  });

  it("falls back to the expert's default route for an unnamed stage", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    registry.register(expert({ modelPolicy: { stages: {}, defaultRoute: "openai:gpt-5-mini" } }));
    const resolution = registry.resolveRoute("coding", "execution");
    expect(resolution.source).toBe("default");
    expect(resolution.route).toBe("openai:gpt-5-mini");
  });

  it("invents nothing for an expert with no model policy", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    registry.register(expert());
    const resolution = registry.resolveRoute("coding", "planning");
    expect(resolution.source).toBe("none");
    expect(resolution.route).toBeUndefined();
    expect(resolution.reason).toContain("declares no model policy");
  });

  it("says why an unregistered expert resolves to none", () => {
    const resolution = new ExpertRegistry(mutableSource(BASE)).resolveRoute("nobody", "planning");
    expect(resolution.source).toBe("none");
    expect(resolution.reason).toContain("no expert \"nobody\" is registered");
  });

  it("says why an unusable expert resolves to none, rather than routing through it", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    registry.register(expert({ tools: ["ghost.tool"], modelPolicy: { stages: {}, defaultRoute: "openai:gpt-5" } }));
    const resolution = registry.resolveRoute("coding", "planning");
    expect(resolution.source).toBe("none");
    expect(resolution.route).toBeUndefined();
    expect(resolution.reason).toContain("unusable");
  });
});

describe("strategyCriteria", () => {
  it("converts the expert's ceiling for the P3 selector", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    registry.register(expert({ safety: { maxCapabilityRisk: "process" }, tools: ["agent.list", "agent.spawn"] }));
    expect(registry.strategyCriteria("coding")).toEqual({ maxRisk: "medium" });
  });

  it("is undefined for an unusable expert", () => {
    // A broken expert must not get to loosen anyone's strategy limits.
    const registry = new ExpertRegistry(mutableSource(BASE));
    registry.register(expert({ tools: ["ghost.tool"] }));
    expect(registry.strategyCriteria("coding")).toBeUndefined();
  });

  it("is undefined for an unregistered expert", () => {
    expect(new ExpertRegistry(mutableSource(BASE)).strategyCriteria("nobody")).toBeUndefined();
  });
});

describe("memoryNamespaceCollisions", () => {
  it("reports two experts claiming the same namespace", () => {
    // Nothing partitions memory by namespace yet, so this is the part of the
    // contract enforceable today: shared recall between two experts.
    const registry = new ExpertRegistry(mutableSource(BASE));
    registry.register(expert());
    registry.register(expert({ id: "research", domain: "research" })); // same namespace
    expect(registry.memoryNamespaceCollisions()).toEqual([
      { namespace: "expert.coding", experts: ["coding", "research"] },
    ]);
  });

  it("reports nothing when namespaces are distinct", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    registry.register(expert());
    registry.register(expert({ id: "research", domain: "research", memoryNamespace: "expert.research" }));
    expect(registry.memoryNamespaceCollisions()).toEqual([]);
  });
});

describe("list", () => {
  it("reports every expert with its current standing", () => {
    const registry = new ExpertRegistry(mutableSource(BASE));
    registry.register(expert());
    registry.register(expert({ id: "research", domain: "research", tools: ["ghost.tool"], memoryNamespace: "expert.research" }));
    const standing = registry.list().map((r) => [r.expert.id, r.usable] as const);
    expect(standing).toEqual([
      ["coding", true],
      ["research", false],
    ]);
  });
});
