import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderProfileRegistry } from "../src/models/provider-profiles.js";
import { AnthropicProvider } from "../src/models/anthropic-provider.js";
import { HybridAgentEngine } from "../src/engine.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("provider profiles", () => {
  it("ships a provider-neutral catalog and resolves aliases", () => {
    const registry = new ProviderProfileRegistry();
    expect(registry.get("gemini")?.id).toBe("google");
    expect(registry.list().map((item) => item.id)).toEqual(expect.arrayContaining([
      "openai", "anthropic", "openrouter", "google", "groq", "xai", "deepseek", "mistral", "ollama",
    ]));
    expect(() => registry.createProvider({ profileId: "anthropic", model: "test" })).toThrow("ANTHROPIC_API_KEY");
    const local = registry.createProvider({ profileId: "ollama", model: "local-model" });
    expect(local.modelName).toBe("ollama:local-model");
  });

  it("normalizes native Anthropic text, tool calls and usage", async () => {
    let requestBody: any;
    globalThis.fetch = vi.fn(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      // The provider streams, so the stub has to answer with SSE frames rather
      // than one JSON body. Same content as before: a text block, a tool_use
      // whose arguments arrive as input_json_delta fragments, and usage split
      // across message_start / message_delta the way the real API sends it.
      const frames = [
        'data: {"type":"message_start","message":{"usage":{"input_tokens":10,"cache_read_input_tokens":2,"cache_creation_input_tokens":1}}}\n\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"checking"}}\n\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool-1","name":"filesystem__read"}}\n\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"a.txt\\"}"}}\n\n',
        'data: {"type":"content_block_stop","index":1}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":5}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ].join("");
      return new Response(frames, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch;
    const provider = new AnthropicProvider({ apiKey: "test", model: "claude-test" });
    const events = [];
    for await (const event of provider.stream({
      sessionId: "session",
      turnId: "turn",
      systemPrompt: "system",
      messages: [{ id: "m1", role: "user", timestamp: new Date().toISOString(), content: [{ type: "text", text: "hello" }] }],
      tools: [{
        id: "filesystem.read",
        version: "1",
        description: "read",
        risk: "workspace_read",
        sideEffect: false,
        inputSchema: { type: "object" },
        source: "core",
      }],
    })) events.push(event);
    expect(requestBody.tools[0].name).toBe("filesystem__read");
    expect(events).toContainEqual(expect.objectContaining({ type: "tool_call", call: expect.objectContaining({ name: "filesystem.read" }) }));
    expect(events).toContainEqual({ type: "usage", usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1 } });
  });

  it("persists a provider:model selection per session", async () => {
    const homePath = await mkdtemp(join(tmpdir(), "haf-model-select-"));
    const engine = new HybridAgentEngine({
      homePath,
      kernelServerScript: resolve(process.cwd(), "../../python/kernel_server.py"),
      sandboxBackend: "local",
      model: { provider: "mock" },
    });
    const session = await engine.createSession({ tenantId: "local" });
    const result = await engine.command({
      protocolVersion: 1,
      commandId: randomUUID(),
      clientId: "model-test",
      tenantId: "local",
      sessionId: session.sessionId,
      kind: "model.select",
      source: "api",
      issuedAt: new Date().toISOString(),
      payload: { model: "mock:test-model" },
    });
    expect(result.status).toBe("completed");
    expect((await engine.session(session.sessionId)).modelName).toBe("mock:test-model");
    await engine.shutdown();
  });
});
