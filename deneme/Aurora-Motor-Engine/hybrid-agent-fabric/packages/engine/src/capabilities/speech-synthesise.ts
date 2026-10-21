/**
 * Speech synthesis (V2 integration plan, wave 2 item 11: "Local TTS; voice
 * quality/license test").
 *
 * `audio.speak` did not exist; this adds it. Piper 1.8.0 over ONNX Runtime — MIT
 * licensed, no PyTorch, no GPU, no API key. The plan names coqui-ai/TTS, which is
 * MPL-2.0 and unmaintained; the licence and the maintenance state were both reasons
 * to look elsewhere, and the plan's own wave-2 item says to test voice
 * quality *and* licence.
 *
 * Measured before relying on it: the `en_US-lessac-medium` voice loads in about 1.6 s
 * and turns a sentence into 2.69 s of 22 kHz mono WAV.
 *
 * WHAT THIS VERIFIES AND WHAT IT CANNOT, stated plainly because the gap is the whole
 * shape of the result. It can establish that audio of a stated length was produced
 * from the given text and that the file is a well-formed WAV — the output is read
 * back rather than assumed written. It cannot establish that the speech sounds like
 * the text. There is no reference recording to compare against, and feeding the
 * output to a speech recogniser would only measure that recogniser, which in this
 * repository is Vosk and was itself measured to transcribe a known Turkish sentence
 * as "ama çoğu". So every result carries `verified: false` for quality with a
 * `checkDetail` naming what was actually checked.
 *
 * A quality score would be inventing a number to fill that hole — the exact failure
 * this repository keeps finding elsewhere.
 */
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineCapability } from "./schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEXT_TO_SPEECH_WORKER_PATH = resolve(HERE, "../../external-workers/text_to_speech.py");
export const AUDIO_SPEAK_CAPABILITY_ID = "audio.speak";
export const PIPER_VOICE_SOURCE = "https://huggingface.co/rhasspy/piper-voices";

export interface SpeechSynthesiseServiceOptions {
  /** Path to a Piper `.onnx` voice. Required — Piper 1.8.0 ships no downloader. */
  voicePath: string;
  /** The matching `.onnx.json`. Piper usually needs it. */
  voiceConfigPath?: string;
  pythonPath?: string;
  timeoutMs?: number;
}

interface WorkerResult {
  ok: boolean;
  outputPath?: string;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  sampleWidth?: number;
  frames?: number;
  characterCount?: number;
  qualityVerified?: boolean;
  error?: string;
}

/** Runs the Piper worker once. */
export async function synthesiseSpeech(
  input: { text: string; outputPath: string; lengthScale?: number | undefined; noiseScale?: number | undefined },
  options: SpeechSynthesiseServiceOptions,
): Promise<{ ok: true; result: WorkerResult; durationMs: number } | { ok: false; error: string; durationMs: number }> {
  const startedAt = Date.now();
  try {
    await access(options.voicePath);
  } catch {
    return {
      ok: false,
      error:
        `the Piper voice was not found at ${options.voicePath}. Piper 1.8.0 ships no downloader, so ` +
        `fetch a voice's .onnx and matching .onnx.json from ${PIPER_VOICE_SOURCE} and configure both paths.`,
      durationMs: Date.now() - startedAt,
    };
  }

  let stdout = "";
  let stderr = "";
  const child = spawn(options.pythonPath ?? "python3", [TEXT_TO_SPEECH_WORKER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 180_000);
  try {
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    // stdin needs its own handler: if the child fails to start the write emits
    // `error` on the stream, and an unhandled stream error takes the process down
    // instead of surfacing as a rejected promise.
    child.stdin.on("error", () => undefined);
    child.stdin.write(
      JSON.stringify({
        text: input.text,
        outputPath: resolve(input.outputPath),
        voicePath: resolve(options.voicePath),
        ...(options.voiceConfigPath ? { voiceConfigPath: resolve(options.voiceConfigPath) } : {}),
        ...(input.lengthScale ? { lengthScale: input.lengthScale } : {}),
        ...(input.noiseScale ? { noiseScale: input.noiseScale } : {}),
      }),
    );
    child.stdin.end();
    // `error` as well as `exit`: a missing interpreter emits only `error`, and
    // waiting on `exit` alone hangs forever.
    const exitCode = await new Promise<number | null>((resolveExit) => {
      child.on("error", () => resolveExit(null));
      child.on("exit", (code) => resolveExit(code));
    });
    if (exitCode === null) {
      return { ok: false, error: `the speech worker could not be started: ${stderr.trim().slice(-300)}`, durationMs: Date.now() - startedAt };
    }
    const parsed = stdout.trim() === "" ? undefined : (JSON.parse(stdout.trim()) as WorkerResult);
    if (parsed?.ok === true) return { ok: true, result: parsed, durationMs: Date.now() - startedAt };
    return {
      ok: false,
      error: parsed?.error ?? `the speech worker exited with code ${exitCode}. ${stderr.trim().slice(-400)}`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      error: `the speech worker could not be run: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The `audio.speak` capability.
 *
 * Verification: producing no audio at all is a real failure. Producing audio is a
 * pass on the question that can be answered — that synthesis happened and the
 * container is valid — and is returned with quality explicitly unchecked.
 */
export function speechSynthesiseCapability(options: SpeechSynthesiseServiceOptions) {
  return defineCapability(
    {
      id: AUDIO_SPEAK_CAPABILITY_ID,
      version: "1.0.0",
      description:
        "Synthesise speech from text into a WAV file using a local Piper voice. " +
        "Requires a Piper .onnx voice to be present; Piper ships no downloader. " +
        "The audio is verified to exist and be a valid WAV, but its quality and its " +
        "fidelity to the text are not verified and nothing here can verify them.",
      risk: "workspace_write",
      sideEffect: true,
      source: "core",
      idempotency: "inherent",
    },
    z.object({
      text: z.string().min(1).max(10_000),
      /** Where to write the WAV. The parent directory must already exist. */
      outputPath: z.string().min(1).max(1000),
      /** Greater than 1 slows the speech down, less than 1 speeds it up. */
      lengthScale: z.number().min(0.1).max(5).optional(),
      noiseScale: z.number().min(0).max(2).optional(),
    }),
    async (input) => {
      const run = await synthesiseSpeech(input, options);
      if (!run.ok) {
        return { status: "failed", reason: run.error, verified: false, durationMs: run.durationMs };
      }
      const result = run.result;
      const duration = result.durationSeconds ?? 0;
      const characters = result.characterCount ?? 0;
      return {
        status: "executed",
        outputPath: result.outputPath,
        durationSeconds: duration,
        sampleRate: result.sampleRate,
        channels: result.channels,
        frames: result.frames,
        characterCount: characters,
        // Rough speaking rate. Reported because a wildly wrong one is a symptom
        // worth seeing, not because any threshold here proves the speech is right.
        charactersPerSecond: duration > 0 ? Math.round((characters / duration) * 10) / 10 : 0,
        verified: false,
        unchecked: true,
        checkDetail:
          `${duration.toFixed(2)}s of ${result.sampleRate ?? "?"} Hz audio was produced and read back as a ` +
          "valid WAV. That the audio was produced is checked; that it sounds like the text is not, and " +
          "nothing available here can check it.",
        durationMs: run.durationMs,
      };
    },
    {
      idempotency: "inherent",
      output: z.object({
        status: z.string(),
        outputPath: z.string().optional(),
        durationSeconds: z.number().optional(),
        sampleRate: z.number().optional(),
        channels: z.number().optional(),
        frames: z.number().optional(),
        characterCount: z.number().optional(),
        charactersPerSecond: z.number().optional(),
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
        const duration = Number(value.durationSeconds ?? 0);
        if (!(duration > 0)) {
          return { ok: false, reason: "synthesis produced no audio, so nothing was spoken" };
        }
        return {
          ok: true,
          reason: String(value.checkDetail ?? `${duration}s of audio was produced`),
        };
      },
    },
  );
}
