/**
 * P2: per-stage model routing.
 *
 * The properties under test are the refusal cases — a malformed route must not
 * be accepted as a configuration, and an unconfigured stage must not be given an
 * invented model.
 */
import { describe, expect, it } from "vitest";
import {
  MODEL_STAGES,
  distinctRoutes,
  isModelStage,
  providerOfRoute,
  resolveStageRoute,
  validateStageModelPolicy,
} from "../src/models/stage-model-policy.js";

describe("the stage vocabulary", () => {
  it("names the stages the plan routes separately", () => {
    expect([...MODEL_STAGES]).toEqual(["understanding", "planning", "execution", "verification", "critic", "vision"]);
    expect(isModelStage("verification")).toBe(true);
    expect(isModelStage("coding")).toBe(false);
  });
});

describe("validateStageModelPolicy", () => {
  it("accepts a well-formed policy", () => {
    expect(
      validateStageModelPolicy({
        stages: {
          understanding: { route: "openai:gpt-4o" },
          planning: { route: "aws-bedrock:claude", fallbackRoutes: ["ollama:qwen"] },
        },
        defaultRoute: "ollama:qwen",
      }),
    ).toEqual([]);
  });

  it("rejects a route that is not canonical provider:model", () => {
    // This is the case that would otherwise look configured and then send work
    // to a model that does not exist.
    const problems = validateStageModelPolicy({ stages: { planning: { route: "bonsai" } } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("not a canonical provider:model route");
  });

  it("rejects a bare model id that merely contains a colon", () => {
    const problems = validateStageModelPolicy({ stages: { vision: { route: "anthropic.claude-v2:0" } } });
    expect(problems).toHaveLength(1);
  });

  it("rejects bad fallbacks and a bad default", () => {
    const problems = validateStageModelPolicy({
      stages: { critic: { route: "openai:gpt-4o", fallbackRoutes: ["gpt-4o"] } },
      defaultRoute: "local",
    });
    expect(problems).toHaveLength(2);
  });

  it("rejects an unknown stage name", () => {
    const problems = validateStageModelPolicy({
      stages: { coding: { route: "openai:gpt-4o" } } as never,
    });
    expect(problems[0]).toContain("unknown stage");
  });
});

describe("resolveStageRoute", () => {
  const policy = {
    stages: { verification: { route: "aws-bedrock:claude", reason: "strongest at judging" } },
    defaultRoute: "ollama:qwen",
  };

  it("uses the stage entry when there is one", () => {
    const resolved = resolveStageRoute(policy, "verification");
    expect(resolved.route).toBe("aws-bedrock:claude");
    expect(resolved.source).toBe("stage");
    expect(resolved.reason).toBe("strongest at judging");
  });

  it("falls back to the default for an unconfigured stage", () => {
    const resolved = resolveStageRoute(policy, "planning");
    expect(resolved.route).toBe("ollama:qwen");
    expect(resolved.source).toBe("default");
  });

  it("resolves to none rather than inventing a model", () => {
    const resolved = resolveStageRoute({ stages: {} }, "execution");
    expect(resolved.route).toBeUndefined();
    expect(resolved.source).toBe("none");
    expect(resolved.reason).toContain("keeping the current route");
  });

  it("ignores a malformed stage entry instead of routing to it", () => {
    const resolved = resolveStageRoute({ stages: { execution: { route: "bonsai" } } }, "execution");
    expect(resolved.source).toBe("none");
  });
});

describe("distinctRoutes", () => {
  it("shows when six stages are really one model", () => {
    const same = {
      stages: {
        understanding: { route: "ollama:qwen" },
        planning: { route: "ollama:qwen" },
        execution: { route: "ollama:qwen" },
      },
    };
    expect(distinctRoutes(same)).toEqual(["ollama:qwen"]);
  });

  it("counts a genuinely per-stage policy", () => {
    expect(
      distinctRoutes({
        stages: { understanding: { route: "openai:gpt-4o" }, vision: { route: "google:gemini" } },
        defaultRoute: "ollama:qwen",
      }),
    ).toEqual(["google:gemini", "ollama:qwen", "openai:gpt-4o"]);
  });
});

describe("providerOfRoute", () => {
  it("exposes the provider for locality checks", () => {
    expect(providerOfRoute("ollama:qwen")).toBe("ollama");
    expect(providerOfRoute("gpt-4o")).toBeUndefined();
  });
});
