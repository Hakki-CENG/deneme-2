/**
 * Speech-to-text (V2 integration plan, wave 2 item 10: "Audio ASR; faster-whisper /
 * Whisper with Turkish tests").
 *
 * `audio.transcribe` was one of the capabilities Aurora declared and had no backend
 * for. This wires one.
 *
 * Why Vosk and not the faster-whisper the plan names: faster-whisper needs PyTorch,
 * which cannot be installed in this environment. Vosk is CPU-only, needs no API key
 * and ships Turkish acoustic models, so it is the candidate that can actually be
 * measured here.
 *
 * Every result carries `verified: false` and `unchecked: true`, and the reason is a
 * measurement rather than a precaution. A Turkish sentence synthesised with
 * espeak-ng — "Merhaba dünya. Bugün hava çok güzel." — came back as "ama çoğu"
 * through this exact pipeline. The chain ran end to end and produced text; the text
 * was wrong. Whether that is the synthetic voice being unlike human speech or the
 * model being weak cannot be separated without recorded human speech, which was not
 * available. So this capability states what it can defend — audio of a given
 * duration was decoded by a given model — and refuses to endorse the words.
 *
 * No confidence figure is reported either. Vosk can emit per-word confidences, but
 * those measure how sure the decoder was, not whether it was right; presenting one
 * as accuracy would repeat the mistake this repository already measured with
 * Tesseract, where a correct Turkish line scored 85.2 and a garbage line scored
 * 84.3.
 */
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineCapability } from "./schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const AUDIO_TRANSCRIBE_WORKER_PATH = resolve(HERE, "../../external-workers/audio_transcribe.py");
export const AUDIO_TRANSCRIBE_CAPABILITY_ID = "audio.transcribe";

export interface AudioTranscribeServiceOptions {
  /** Absolute path to an unpacked Vosk model directory. Required. */
  modelPath: string;
  /** Python interpreter. Defaults to `python3`. */
  pythonPath?: string;
  /** Kill switch for the worker. */
  timeoutMs?: number;
}

interface WorkerResult {
  ok: boolean;
  text?: string;
  segments?: string[];
  durationSeconds?: number;
  sourceSampleRate?: number;
  decodedSampleRate?: number;
  resampledFrom?: number;
  modelPath?: string;
  accuracyVerified?: boolean;
  error?: string;
}

/**
 * Runs the Vosk worker over one PCM WAV file.
 *
 * Kept separate from the capability so a test can exercise the worker contract
 * without an engine, and so the capability stays a thin adapter.
 */
export async function transcribeAudio(
  filePath: string,
  options: AudioTranscribeServiceOptions,
): Promise<{ ok: true; result: WorkerResult; durationMs: number } | { ok: false; error: string; durationMs: number }> {
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  try {
    await access(filePath);
  } catch {
    return { ok: false, error: `audio file not found: ${filePath}`, durationMs: Date.now() - startedAt };
  }
  try {
    await access(options.modelPath);
  } catch {
    return {
      ok: false,
      error: `Vosk model not found at ${options.modelPath}. Unpack a model (e.g. vosk-model-small-tr-0.3) and pass its directory.`,
      durationMs: Date.now() - startedAt,
    };
  }

  const child = spawn(options.pythonPath ?? "python3", [AUDIO_TRANSCRIBE_WORKER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 120_000);
  try {
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.stdin.write(JSON.stringify({ path: resolve(filePath), modelPath: options.modelPath }));
    child.stdin.end();
    const code = await new Promise<number | null>((resolveExit) => {
      child.on("exit", (exitCode) => resolveExit(exitCode));
    });
    const parsed = stdout.trim() === "" ? undefined : (JSON.parse(stdout.trim()) as WorkerResult);
    if (parsed?.ok === true) return { ok: true, result: parsed, durationMs: Date.now() - startedAt };
    return {
      ok: false,
      error: parsed?.error ?? `the transcription worker exited with code ${code ?? "null"}. ${stderr.trim().slice(-400)}`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      error: `the transcription worker could not be run: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The `audio.transcribe` capability.
 *
 * Verification: it is a real failure for audio to decode to nothing at all, so an
 * empty transcript fails. It passes when the decoder produced text, carrying
 * `unchecked: true`, because nothing available here can establish that the words
 * are the words that were spoken.
 */
export function audioTranscribeCapability(options: AudioTranscribeServiceOptions) {
  return defineCapability(
    {
      id: AUDIO_TRANSCRIBE_CAPABILITY_ID,
      version: "1.0.0",
      description:
        "Transcribe a PCM WAV file in the workspace to text using a local Vosk model. " +
        "Requires mono 16-bit WAV; other rates are resampled and that is reported. " +
        "The transcript is always returned unchecked: no check available here can establish it is correct.",
      risk: "workspace_read",
      sideEffect: false,
      // The capability is part of the engine even though it shells out to a
      // Python worker; the closed source union has no "external" member and
      // document-parse, which also shells out, uses "core".
      source: "core",
      idempotency: "inherent",
    },
    z.object({
      path: z.string().min(1).max(1000),
    }),
    async (input) => {
      const run = await transcribeAudio(input.path, options);
      if (!run.ok) {
        return {
          status: "failed",
          reason: run.error,
          verified: false,
          unchecked: true,
          durationMs: run.durationMs,
        };
      }
      const result = run.result;
      const text = (result.text ?? "").trim();
      const wordCount = text === "" ? 0 : text.split(/\s+/).length;
      return {
        status: "executed",
        text,
        segments: result.segments ?? [],
        wordCount,
        durationSeconds: result.durationSeconds ?? 0,
        sourceSampleRate: result.sourceSampleRate,
        decodedSampleRate: result.decodedSampleRate,
        ...(result.resampledFrom ? { resampledFrom: result.resampledFrom } : {}),
        modelPath: result.modelPath,
        verified: false,
        unchecked: true,
        checkDetail:
          `Vosk decoded ${(result.durationSeconds ?? 0).toFixed(1)}s of audio into ${wordCount} word(s). ` +
          "The words are returned unchecked: measured on Turkish speech synthesised with espeak-ng, this " +
          "pipeline produced a transcript that did not match what was said, and nothing available here can " +
          "tell a correct transcription from an incorrect one.",
        durationMs: run.durationMs,
      };
    },
    {
      idempotency: "inherent",
      output: z.object({
        status: z.string(),
        text: z.string().optional(),
        segments: z.array(z.string()).optional(),
        wordCount: z.number().optional(),
        durationSeconds: z.number().optional(),
        sourceSampleRate: z.number().optional(),
        decodedSampleRate: z.number().optional(),
        resampledFrom: z.number().optional(),
        modelPath: z.string().optional(),
        reason: z.string().optional(),
        verified: z.boolean().optional(),
        unchecked: z.boolean().optional(),
        checkDetail: z.string().optional(),
        durationMs: z.number(),
      }),
      /**
       * An empty transcript is a failure — audio that decoded to no words at all
       * means the backend did not do its job. A non-empty one passes, but only
       * ever carrying `unchecked: true`.
       */
      verify: async (output) => {
        const value = output as Record<string, unknown>;
        const status = String(value.status ?? "");
        if (status !== "executed") {
          return {
            ok: true,
            reason: String(value.reason ?? status) || "the capability reported its own failure",
          };
        }
        const text = typeof value.text === "string" ? value.text.trim() : "";
        if (text === "") {
          return { ok: false, reason: "the audio decoded to no words at all, so the backend did not transcribe it" };
        }
        return {
          ok: true,
          reason:
            `${text.split(/\s+/).length} word(s) decoded; returned unchecked because no check available ` +
            "here can establish that they are the words that were spoken",
        };
      },
    },
  );
}

/**
 * Reads a WAV file's header to report its format. Used by tests to build fixtures
 * that the worker will accept, and by callers who want to know why a file was
 * rejected before sending it.
 */
export async function readWavFormat(filePath: string): Promise<{ sampleRate: number; channels: number; sampleWidth: number }> {
  const head = await readFile(filePath);
  // The fmt chunk is at a fixed offset in the canonical layout this worker accepts.
  const channels = head.readUInt16LE(22);
  const sampleRate = head.readUInt32LE(24);
  const sampleWidth = head.readUInt16LE(34) / 8;
  return { sampleRate, channels, sampleWidth };
}
