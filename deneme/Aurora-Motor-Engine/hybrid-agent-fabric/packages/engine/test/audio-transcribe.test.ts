/**
 * Speech-to-text through the Vosk worker.
 *
 * The model is 36 MB and is not in the repository, so the cases that need one are
 * skipped when it is absent rather than failing — a skipped integration case says
 * "this machine has no model", where a red one would say "this is broken".
 *
 * What is asserted about accuracy, and what is not: a Turkish sentence synthesised
 * with espeak-ng came back as "ama çoğu" from this pipeline. That measurement is why
 * every result here is expected to carry `unchecked: true`, and why no test asserts
 * that a transcript matches its source audio. Asserting the words would be asserting
 * something this environment measured to be false.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUDIO_TRANSCRIBE_WORKER_PATH,
  audioTranscribeCapability,
  readWavFormat,
  transcribeAudio,
} from "../src/capabilities/audio-transcribe.js";

const MODEL_PATH = process.env.HAF_VOSK_MODEL_PATH ?? "/tmp/vosk-tr/vosk-model-small-tr-0.3";
const hasModel = spawnSync("test", ["-d", MODEL_PATH]).status === 0;

let workDir = "";

/** Writes a PCM WAV. Stereo and 8-bit variants exist to prove they are refused. */
function writeWav(name: string, samples: number[], options: { channels?: number; sampleWidth?: number; rate?: number } = {}): string {
  const channels = options.channels ?? 1;
  const sampleWidth = options.sampleWidth ?? 2;
  const rate = options.rate ?? 16000;
  const byteRate = rate * channels * sampleWidth;
  const data = Buffer.alloc(samples.length * sampleWidth);
  samples.forEach((value, index) => {
    if (sampleWidth === 2) data.writeInt16LE(value, index * 2);
    else data.writeUInt8(Math.max(0, Math.min(255, value)), index);
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * sampleWidth, 32);
  header.writeUInt16LE(sampleWidth * 8, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  const path = join(workDir, name);
  writeFileSync(path, Buffer.concat([header, data]));
  return path;
}

function runWorker(payload: unknown): { status: number | null; stdout: string } {
  const child = spawnSync("python3", [AUDIO_TRANSCRIBE_WORKER_PATH], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: child.status, stdout: child.stdout ?? "" };
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "haf-asr-"));
});

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("the transcription worker refuses input it cannot honour", () => {
  it("says so when the request is not JSON", () => {
    const run = runWorker("this is not json");
    const body = JSON.parse(run.stdout);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("not valid JSON");
  });

  it("says so when a required field is missing", () => {
    const body = JSON.parse(runWorker({ modelPath: "/nonexistent" }).stdout);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("path is required");
  });

  it("refuses stereo instead of silently averaging the channels", () => {
    // Averaging would change the audio the model hears and nobody would be told.
    const stereo = writeWav("stereo.wav", [0, 0, 0, 0], { channels: 2 });
    const body = JSON.parse(runWorker({ path: stereo, modelPath: "/nonexistent" }).stdout);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("2 channels");
    expect(String(body.error)).toContain("mix it down explicitly");
  });

  it("refuses a sample width it was not written for", () => {
    const eightBit = writeWav("eight.wav", [128, 128], { sampleWidth: 1 });
    const body = JSON.parse(runWorker({ path: eightBit, modelPath: "/nonexistent" }).stdout);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("16-bit PCM");
  });

  it("reports a file that is not a WAV at all", () => {
    const notWav = join(workDir, "notes.txt");
    writeFileSync(notWav, "hello");
    const body = JSON.parse(runWorker({ path: notWav, modelPath: "/nonexistent" }).stdout);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("PCM WAV");
  });

  it("reads back the format it just wrote", async () => {
    const stereo = writeWav("fmt.wav", [0, 0, 0, 0], { channels: 2, rate: 44100 });
    expect(await readWavFormat(stereo)).toEqual({ sampleRate: 44100, channels: 2, sampleWidth: 2 });
  });
});

describe("the capability fails with a usable message when there is no model", () => {
  it("names what to unpack rather than reporting a generic error", async () => {
    const capability = audioTranscribeCapability({ modelPath: "/nonexistent/vosk-model" });
    const audio = writeWav("silence.wav", new Array(1600).fill(0));
    const output = (await capability.execute({ path: audio })) as Record<string, unknown>;

    expect(output.status).toBe("failed");
    expect(String(output.reason)).toContain("Vosk model not found");
    expect(String(output.reason)).toContain("vosk-model-small-tr-0.3");
    // A failure is still reported as unverified rather than quietly succeeding.
    expect(output.verified).toBe(false);
  });

  it("says when the audio file itself is missing", async () => {
    const capability = audioTranscribeCapability({ modelPath: MODEL_PATH });
    const output = (await capability.execute({ path: join(workDir, "absent.wav") })) as Record<string, unknown>;
    expect(output.status).toBe("failed");
    expect(String(output.reason)).toContain("audio file not found");
  });
});

describe.skipIf(!hasModel)("a real decode, with the accuracy question left open", () => {
  it("decodes audio and returns the words unchecked", async () => {
    const capability = audioTranscribeCapability({ modelPath: MODEL_PATH });
    // A tone rather than speech: enough to prove the decoder runs over real
    // samples. It is deliberately not asserted to produce any particular text.
    const samples = Array.from({ length: 16000 }, (_, index) =>
      Math.round(4000 * Math.sin((2 * Math.PI * 220 * index) / 16000)));
    const audio = writeWav("tone.wav", samples);
    const output = (await capability.execute({ path: audio })) as Record<string, unknown>;

    expect(output.status).toBe("executed");
    expect(output.decodedSampleRate).toBe(16000);
    expect(output.durationSeconds).toBe(1);
    // The load-bearing assertions: whatever came back, it is not endorsed.
    expect(output.verified).toBe(false);
    expect(output.unchecked).toBe(true);
    expect(String(output.checkDetail)).toContain("unchecked");
  });

  it("reports a resample rather than letting the timings shift unexplained", async () => {
    const capability = audioTranscribeCapability({ modelPath: MODEL_PATH });
    const samples = Array.from({ length: 22050 }, () => 0);
    const audio = writeWav("rate.wav", samples, { rate: 22050 });
    const output = (await capability.execute({ path: audio })) as Record<string, unknown>;

    expect(output.status).toBe("executed");
    expect(output.sourceSampleRate).toBe(22050);
    expect(output.resampledFrom).toBe(22050);
    expect(output.decodedSampleRate).toBe(16000);
  });

  it("treats audio that decoded to nothing as a failure, not as a silent success", async () => {
    const capability = audioTranscribeCapability({ modelPath: MODEL_PATH });
    const audio = writeWav("quiet.wav", new Array(8000).fill(0));
    const output = (await capability.execute({ path: audio })) as Record<string, unknown>;
    const verdict = await capability.verify(output, { path: audio }, {} as never);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("no words");
  });

  it("passes a non-empty decode while still refusing to endorse it", async () => {
    const capability = audioTranscribeCapability({ modelPath: MODEL_PATH });
    const verdict = await capability.verify(
      { status: "executed", text: "merhaba dünya", verified: false, unchecked: true, durationMs: 1 },
      { path: "unused.wav" },
      {} as never,
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain("unchecked");
  });
});
