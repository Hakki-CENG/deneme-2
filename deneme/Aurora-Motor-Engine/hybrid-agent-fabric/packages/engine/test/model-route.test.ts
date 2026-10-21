/**
 * The canonical provider:model identity.
 *
 * The cases that matter are the disagreements this module exists to end: a bare
 * model id containing a colon, which one caller used to cut in half, one used to
 * throw on, and six used to misread.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_MODEL_ROUTE_LENGTH,
  formatModelRoute,
  isModelRoute,
  modelNameOf,
  modelNameOr,
  parseModelRoute,
  providerOf,
} from "../src/models/model-route.js";

describe("parseModelRoute", () => {
  it("splits a well-formed route", () => {
    expect(parseModelRoute("openai:gpt-4o")).toEqual({ provider: "openai", model: "gpt-4o" });
    expect(parseModelRoute("aws-bedrock:llama")).toEqual({ provider: "aws-bedrock", model: "llama" });
  });

  it("keeps everything after the first colon, so a routed Bedrock id survives", () => {
    // `bedrock` is the provider; the inference-profile id keeps its own colon.
    expect(parseModelRoute("aws-bedrock:anthropic.claude-v2:0")).toEqual({
      provider: "aws-bedrock",
      model: "anthropic.claude-v2:0",
    });
  });

  it("refuses a bare model id that merely contains a colon", () => {
    // This is the string model-router used to parse as provider
    // "anthropic.claude-v2" / model "0". A dot is not a provider-id character.
    expect(parseModelRoute("anthropic.claude-v2:0")).toBeNull();
    expect(isModelRoute("anthropic.claude-v2:0")).toBe(false);
  });

  it("refuses malformed routes rather than guessing", () => {
    expect(parseModelRoute("gpt-4o")).toBeNull(); // no provider
    expect(parseModelRoute(":gpt-4o")).toBeNull(); // empty provider
    expect(parseModelRoute("openai:")).toBeNull(); // empty model
    expect(parseModelRoute("")).toBeNull();
    expect(parseModelRoute("open ai:gpt-4o")).toBeNull(); // space in provider
    expect(parseModelRoute("o".repeat(MAX_MODEL_ROUTE_LENGTH + 1))).toBeNull();
  });

  it("accepts every provider id the registry actually uses", () => {
    for (const provider of [
      "anthropic", "aws-bedrock", "azure-openai", "deepseek", "google", "groq",
      "mistral", "ollama", "openai", "openai-responses", "openrouter", "qwen",
      "qwen-local", "vertex", "xai",
    ]) {
      expect(isModelRoute(`${provider}:some-model`), provider).toBe(true);
    }
  });
});

describe("modelNameOf", () => {
  it("strips the provider from a route", () => {
    expect(modelNameOf("openai:gpt-4o")).toBe("gpt-4o");
  });

  it("returns a bare id untouched, colon or not", () => {
    expect(modelNameOf("gpt-4o")).toBe("gpt-4o");
    expect(modelNameOf("anthropic.claude-v2:0")).toBe("anthropic.claude-v2:0");
  });

  it("falls back only when there is nothing to use", () => {
    expect(modelNameOr(undefined, "default-model")).toBe("default-model");
    expect(modelNameOr("", "default-model")).toBe("default-model");
    expect(modelNameOr("openai:gpt-4o", "default-model")).toBe("gpt-4o");
  });
});

describe("providerOf and formatModelRoute", () => {
  it("reports the provider only for a real route", () => {
    expect(providerOf("openai:gpt-4o")).toBe("openai");
    expect(providerOf("gpt-4o")).toBeUndefined();
    expect(providerOf("anthropic.claude-v2:0")).toBeUndefined();
  });

  it("round-trips through the single construction point", () => {
    const route = formatModelRoute("aws-bedrock", "anthropic.claude-v2:0");
    expect(route).toBe("aws-bedrock:anthropic.claude-v2:0");
    expect(parseModelRoute(route)).toEqual({ provider: "aws-bedrock", model: "anthropic.claude-v2:0" });
  });
});
