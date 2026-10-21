"""Speech-to-text via Vosk 0.3.45. Reads JSON on stdin, writes JSON on stdout.

    {"path": "/abs/audio.wav", "modelPath": "/abs/vosk-model-small-tr-0.3",
     "sampleRate": 16000}

Why Vosk and not faster-whisper, which the integration plan names: faster-whisper
needs PyTorch, and torch cannot be installed in this environment. Vosk is CPU-only,
needs no API key, and ships Turkish acoustic models, so it is the candidate that
can actually be measured here rather than the one that sounds better.

WHY NOTHING HERE CLAIMS THE TRANSCRIPT IS CORRECT — this was measured, not
assumed. A Turkish sentence synthesised with espeak-ng ("Merhaba dünya. Bugün
hava çok güzel.") was transcribed as "ama çoğu". The pipeline ran end to end and
produced text; the text was wrong. Whether that is the synthetic voice being
unlike human speech or the model being weak cannot be separated without recorded
human speech, which was not available. So this worker reports what it can defend:
that audio of a given duration was decoded by a given model, and the words that
came out. Accuracy is not asserted anywhere, and a confidence figure is not
invented to stand in for it — Vosk's per-word confidence would measure how sure
the decoder was, which is the same mistake as reading Tesseract's confidence as
accuracy.

Input handling: the path arrives as JSON and is opened as a file. There is no
shell in this file. The audio is read through the `wave` module, so the input must
be PCM WAV; anything else is reported as an error rather than guessed at. Mono is
required — a stereo file is rejected with a message saying so, because silently
averaging channels would change the audio the model hears without telling anyone.

Sample rate: Vosk wants the rate the model was trained at (16000 for the small
models). A file at another rate is resampled here by linear interpolation and the
original rate is reported, so a caller can see that a conversion happened instead
of wondering why the timings shifted.
"""
from __future__ import annotations

import json
import sys
import wave


def fail(message: str, **extra: object) -> None:
    print(json.dumps({"ok": False, "error": message, **extra}))


def main() -> int:
    try:
        request = json.load(sys.stdin)
    except Exception as error:  # noqa: BLE001 - the message is the deliverable
        fail(f"request is not valid JSON: {error}")
        return 0

    path = request.get("path")
    model_path = request.get("modelPath")
    if not isinstance(path, str) or not path:
        fail("path is required")
        return 0
    if not isinstance(model_path, str) or not model_path:
        fail("modelPath is required")
        return 0

    try:
        source = wave.open(path, "rb")
    except Exception as error:  # noqa: BLE001
        fail(f"could not open {path!r} as a PCM WAV file: {error}")
        return 0

    with source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        source_rate = source.getframerate()
        frame_count = source.getnframes()
        if channels != 1:
            fail(
                f"expected mono audio but {path!r} has {channels} channels; "
                "mix it down explicitly rather than letting this worker average them silently",
                channels=channels,
            )
            return 0
        if sample_width != 2:
            fail(f"expected 16-bit PCM but {path!r} has a sample width of {sample_width} bytes",
                 sampleWidth=sample_width)
            return 0
        raw = source.readframes(frame_count)

    try:
        from vosk import KaldiRecognizer, Model, SetLogLevel
    except Exception as error:  # noqa: BLE001
        fail(f"vosk is not importable: {error}")
        return 0

    SetLogLevel(-1)  # Vosk logs its model loading to stderr at info level by default.

    try:
        model = Model(model_path)
    except Exception as error:  # noqa: BLE001
        fail(f"could not load the Vosk model at {model_path!r}: {error}")
        return 0

    target_rate = 16000
    samples = _pcm16_to_ints(raw)
    resampled_from = None
    if source_rate != target_rate:
        samples = _resample_linear(samples, source_rate, target_rate)
        resampled_from = source_rate

    recognizer = KaldiRecognizer(model, target_rate)
    recognizer.SetWords(False)
    step = 4000
    segments: list[str] = []
    for start in range(0, len(samples), step):
        chunk = samples[start:start + step]
        if recognizer.AcceptWaveform(_ints_to_pcm16(chunk)):
            text = json.loads(recognizer.Result()).get("text", "")
            if text:
                segments.append(text)
    final_text = json.loads(recognizer.FinalResult()).get("text", "")
    if final_text:
        segments.append(final_text)

    transcript = " ".join(segments).strip()
    print(json.dumps({
        "ok": True,
        "text": transcript,
        "segments": segments,
        "durationSeconds": round(len(samples) / target_rate, 3),
        "sourceSampleRate": source_rate,
        "decodedSampleRate": target_rate,
        **({"resampledFrom": resampled_from} if resampled_from else {}),
        "modelPath": model_path,
        # Reported so a caller cannot mistake "the decoder ran" for "the words are
        # right". See the module docstring for the measurement behind this.
        "accuracyVerified": False,
    }))
    return 0


def _pcm16_to_ints(raw: bytes) -> list[int]:
    import struct

    count = len(raw) // 2
    return list(struct.unpack("<" + "h" * count, raw[: count * 2]))


def _ints_to_pcm16(samples: list[int]) -> bytes:
    import struct

    clamped = [max(-32768, min(32767, int(value))) for value in samples]
    return struct.pack("<" + "h" * len(clamped), *clamped)


def _resample_linear(samples: list[int], source_rate: int, target_rate: int) -> list[int]:
    if not samples:
        return samples
    out_count = int(len(samples) * target_rate / source_rate)
    out: list[int] = []
    last = len(samples) - 1
    for index in range(out_count):
        position = index * source_rate / target_rate
        low = int(position)
        high = min(low + 1, last)
        fraction = position - low
        out.append(int(samples[low] * (1 - fraction) + samples[high] * fraction))
    return out


if __name__ == "__main__":
    sys.exit(main())
