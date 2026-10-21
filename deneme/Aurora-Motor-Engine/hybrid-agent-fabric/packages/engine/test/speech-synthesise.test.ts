/**
 * Speech synthesis through the Piper worker.
 *
 * A Piper voice is a ~63 MB download that does not belong in the repository, so the
 * cases that need one are skipped unless `HAF_PIPER_VOICE_PATH` points at an
 * unpacked voice. A skipped case says "this machine has no voice"; a red one would
 * claim something is broken.
 *
 * What is asserted about the output, and what is not: these cases check that audio
 * was produced, that it is a readable WAV of the reported length, and that the
 * capability refuses to endorse its quality. No case asserts that the speech sounds
 * like the text, because nothing available here can check that — and the speech
 * recogniser in this repository was itself measured to transcribe a known Turkish
 * sentence as "ama çoğu", so routing the audio back through it would measure that.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUDIO_SPEAK_CAPABILITY_ID,
  PIPER_VOICE_SOURCE,
  speechSynthesiseCapability,
  synthesiseSpeech,
} from "../src/capabilities/speech-synthesise.js";

const VOICE_PATH = process.env.HAF_PIPER_VOICE_PATH ?? "";
const VOICE_CONFIG = process.env.HAF_PIPER_VOICE_CONFIG_PATH ?? `${VOICE_PATH}.json`;
const hasVoice = VOICE_PATH.length > 0 && existsSync(VOICE_PATH);

let workDir = "";

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "haf-tts-"));
});

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("failure paths that need no voice", () => {
  it("names where to get a voice when none is configured", async () => {
    const capability = speechSynthesiseCapability({ voicePath: join(workDir, "absent.onnx") });
    const output = (await capability.execute({
      text: "hello",
      outputPath: join(workDir, "out.wav"),
    })) as Record<string, unknown>;

    expect(output.status).toBe("failed");
    expect(output.verified).toBe(false);
    // Piper 1.8.0 has no downloader, so "not found" on its own is not actionable.
    expect(String(output.reason)).toContain(PIPER_VOICE_SOURCE);
    expect(String(output.reason)).toContain(".onnx.json");
  });

  it("reports a worker that cannot start rather than hanging", async () => {
    const capability = speechSynthesiseCapability({
      voicePath: VOICE_PATH || "/nonexistent/voice.onnx",
      pythonPath: "/nonexistent/python3",
    });
    // Without a voice the capability fails before spawning, which is the cheaper
    // answer; either way it must not hang on a child that never exits.
    const output = (await capability.execute({
      text: "hello",
      outputPath: join(workDir, "out.wav"),
    })) as Record<string, unknown>;
    expect(output.status).toBe("failed");
    expect(output.verified).toBe(false);
  });

  it("exposes the capability id and the voice source", () => {
    expect(AUDIO_SPEAK_CAPABILITY_ID).toBe("audio.speak");
    expect(PIPER_VOICE_SOURCE).toContain("piper-voices");
  });
});

describe.skipIf(!hasVoice)("real synthesis", () => {
  it("produces audio and reads it back", async () => {
    const outputPath = join(workDir, "real.wav");
    const run = await synthesiseSpeech(
      { text: "This is a test of speech synthesis.", outputPath },
      {
        voicePath: VOICE_PATH,
        ...(existsSync(VOICE_CONFIG) ? { voiceConfigPath: VOICE_CONFIG } : {}),
      },
    );

    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.result.durationSeconds).toBeGreaterThan(0);
    expect(run.result.sampleRate).toBeGreaterThan(0);
    expect(run.result.frames).toBeGreaterThan(0);
    // The worker reports this explicitly, so a caller cannot mistake "audio exists"
    // for "the speech is right".
    expect(run.result.qualityVerified).toBe(false);

    // Independently confirmed here rather than taken on the worker's word: the file
    // is a RIFF/WAVE container of the reported size.
    const bytes = readFileSync(outputPath);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("returns the result unchecked, with what was checked stated", async () => {
    const capability = speechSynthesiseCapability({
      voicePath: VOICE_PATH,
      ...(existsSync(VOICE_CONFIG) ? { voiceConfigPath: VOICE_CONFIG } : {}),
    });
    const output = (await capability.execute({
      text: "Another sentence to synthesise.",
      outputPath: join(workDir, "cap.wav"),
    })) as Record<string, unknown>;

    expect(output.status).toBe("executed");
    expect(output.verified).toBe(false);
    expect(output.unchecked).toBe(true);
    expect(String(output.checkDetail)).toContain("that it sounds like the text is not");
    expect(Number(output.durationSeconds)).toBeGreaterThan(0);
    expect(Number(output.charactersPerSecond)).toBeGreaterThan(0);

    const verdict = await capability.verify(output, { text: "x", outputPath: "y" }, {} as never);
    expect(verdict.ok).toBe(true);
    // The reason states what was checked and what was not, which is the point:
    // a pass here is a pass on "audio was produced", never on "the speech is right".
    expect(verdict.reason).toContain("that it sounds like the text is not");
  });

  it("honours the speed control", async () => {
    const capability = speechSynthesiseCapability({
      voicePath: VOICE_PATH,
      ...(existsSync(VOICE_CONFIG) ? { voiceConfigPath: VOICE_CONFIG } : {}),
    });
    const text = "The same sentence spoken twice.";
    const fast = (await capability.execute({
      text,
      outputPath: join(workDir, "fast.wav"),
      lengthScale: 0.7,
    })) as Record<string, unknown>;
    const slow = (await capability.execute({
      text,
      outputPath: join(workDir, "slow.wav"),
      lengthScale: 1.6,
    })) as Record<string, unknown>;

    // A longer length scale means slower speech, so more audio for the same text.
    // This is the one property of the output that can be checked against intent.
    expect(Number(slow.durationSeconds)).toBeGreaterThan(Number(fast.durationSeconds));
  });

  it("fails when synthesis produces no audio at all", async () => {
    const capability = speechSynthesiseCapability({
      voicePath: VOICE_PATH,
      ...(existsSync(VOICE_CONFIG) ? { voiceConfigPath: VOICE_CONFIG } : {}),
    });
    const verdict = await capability.verify(
      { status: "executed", durationSeconds: 0, verified: false, durationMs: 1 },
      { text: "x", outputPath: "y" },
      {} as never,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("no audio");
  });
});
