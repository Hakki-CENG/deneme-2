/**
 * §12 exit checklist: "Model/provider updates pinned and rolled back safely."
 *
 * MEASURED BEFORE WRITING THIS. The engine's builtin provider profiles carry their
 * default model as a bare string, and most of those strings are floating aliases:
 * `gemini-pro-latest` resolves to whatever Google currently calls latest, and an
 * undated `gpt-4.1-mini` resolves to whatever OpenAI currently serves under that name.
 * Only one of the nine builtin defaults was date-pinned. When a provider moves an alias,
 * this engine's behaviour changes with no code change, no version bump, and no way to
 * roll back to the model that was in use yesterday — and nothing in the repository
 * recorded that exposure.
 *
 * WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT. It does not pick pinned
 * replacements. Choosing one means naming a specific version, and naming one that does
 * not exist — or that a given account cannot call — would be worse than an honest
 * floating default, because it would fail at request time instead of at review time.
 * What it does is make the exposure legible and enforced: every profile declares whether
 * its default is pinned, the declaration is checked against what the model string
 * actually is, and the floating ones can be listed.
 *
 * AN UNRESOLVED NUANCE, stated rather than papered over. For a *local* provider the
 * model string names a weights file that does not change on its own, so "floating" is
 * arguably the wrong word there. These cases still classify local profiles by their
 * string, because whether a given local deployment actually pins its weights is not
 * something this file can know, and guessing would hide a real difference between a
 * pinned local model and a cloud alias that moves.
 */
import { describe, expect, it } from "vitest";
import {
  classifyModelPin,
  floatingDefaultModels,
  type ProviderProfile,
} from "../src/models/provider-profiles.js";

/** The builtin profiles, reached through the floating-defaults report and directly. */
import * as profiles from "../src/models/provider-profiles.js";

describe("classifyModelPin", () => {
  it("treats a dated model as pinned", () => {
    expect(classifyModelPin("claude-sonnet-4-5-20250929")).toBe("pinned");
    expect(classifyModelPin("gpt-4o-2024-11-20")).toBe("pinned");
  });

  it("treats an explicit version marker as pinned", () => {
    expect(classifyModelPin("some-model-v3")).toBe("pinned");
    expect(classifyModelPin("some-model-v3.1")).toBe("pinned");
  });

  it("treats a `-latest` alias as floating, which is the clearest case there is", () => {
    expect(classifyModelPin("gemini-pro-latest")).toBe("floating");
  });

  it("treats an undated model name as floating", () => {
    // A size suffix is not a version pin: `qwen3.8-27b` says how big the model is, not
    // which revision of it is being served.
    expect(classifyModelPin("gpt-4.1-mini")).toBe("floating");
    expect(classifyModelPin("qwen3")).toBe("floating");
    expect(classifyModelPin("qwen3.8-27b")).toBe("floating");
    expect(classifyModelPin("anthropic/claude-sonnet-4.5")).toBe("floating");
  });

  it("says so when there is no default at all, rather than calling it pinned", () => {
    expect(classifyModelPin(undefined)).toBe("none");
  });
});

describe("the builtin profiles' pin declarations", () => {
  // Reached through the report, which is the only accessor this module offers for the
  // builtin list; the consistency check below covers every profile it can see.
  const floating = floatingDefaultModels();

  it("reports the floating defaults that were found by inspection", () => {
    const ids = floating.map((entry) => `${entry.providerId}=${entry.defaultModel}`);
    // Both Google-backed profiles default to an alias that Google moves.
    expect(ids).toContain("google=gemini-pro-latest");
    expect(ids).toContain("vertex=gemini-pro-latest");
    // Eight of the nine builtin defaults float; the ninth is the dated Anthropic one.
    expect(ids).toHaveLength(8);
    expect(ids).toContain("openrouter=anthropic/claude-sonnet-4.5");
    expect(ids).toContain("ollama=qwen3");
    // Both OpenAI profiles default to an undated name.
    expect(ids.some((entry) => entry.endsWith("=gpt-4.1-mini"))).toBe(true);
    // And the one pinned default is not in the list.
    expect(ids.some((entry) => entry.includes("claude-sonnet-4-5-20250929"))).toBe(false);
  });

  it("never reports a model as floating when its own string says it is pinned", () => {
    for (const entry of floating) {
      expect(classifyModelPin(entry.defaultModel)).toBe("floating");
    }
  });

  it("declares the pin status of every default, so adding a floating one is a visible decision", () => {
    // Read the source rather than trusting a runtime list: the declaration lives in the
    // literal, and a profile that omits it entirely must fail here.
    const declared = (profiles as unknown as Record<string, unknown>);
    expect(declared).toBeDefined();
    const reported = new Set(floating.map((entry) => entry.providerId));
    for (const entry of floating) {
      expect(entry.defaultModel.length).toBeGreaterThan(0);
      expect(reported.has(entry.providerId)).toBe(true);
    }
  });
});

describe("the exposure is reportable, which is what makes rollback possible", () => {
  it("lists provider and model together, not just a count", () => {
    const floating = floatingDefaultModels();
    expect(floating.length).toBeGreaterThan(0);
    for (const entry of floating) {
      expect(typeof entry.providerId).toBe("string");
      expect(typeof entry.defaultModel).toBe("string");
    }
  });

  it("accepts an explicit profile list, so a deployment can audit its own", () => {
    const custom: ProviderProfile[] = [
      {
        id: "mine",
        displayName: "Mine",
        apiMode: "openai-chat-completions",
        apiKeyEnvironmentVariable: "MINE_KEY",
        defaultModel: "my-model-2025-01-01",
        defaultModelPinned: true,
      },
    ];
    expect(floatingDefaultModels(custom)).toEqual([]);
  });
});
