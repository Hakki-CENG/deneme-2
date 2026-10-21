"""Speech synthesis via Piper 1.8.0. Reads JSON on stdin, writes JSON on stdout.

    {"text": "...", "voicePath": "/abs/voice.onnx", "voiceConfigPath": "/abs/voice.onnx.json",
     "outputPath": "/abs/out.wav", "sampleRate": 22050}

WHY PIPER AND NOT THE COQUI STACK THE PLAN NAMES. coqui-ai/TTS is MPL-2.0 and no
longer maintained. Piper is MIT, runs on ONNX Runtime, needs no PyTorch and no GPU,
and produces intelligible speech on CPU. Measured before relying on it: the
`en_US-lessac-medium` voice loads in about 1.6 s and synthesises a sentence into
2.69 s of 22 kHz mono audio.

Piper ships no downloader in 1.8.0 — `PiperVoice.load` takes a path, so the voice
files have to be fetched separately. The capability's error message names the two
files needed and where they come from rather than reporting a bare "not found".

WHAT IS AND IS NOT VERIFIED, because the distinction is the whole point. This worker
can establish that audio of a given length was produced from the text it was given,
and that the container is a well-formed WAV. It cannot establish that the speech
*sounds like* the text. Nothing available here can — there is no reference recording
to compare against, and running the output back through a speech recogniser would
only measure that recogniser. So the result carries `qualityVerified: false` and the
caller is told what was actually checked.

Reporting a confidence or a quality score here would be inventing a number to fill a
hole, which is the exact failure this repository keeps finding elsewhere: a figure
that looks like a measurement and is not one.

Input handling: the text is passed to Piper as data. There is no shell in this file
and no string is ever parsed as code. The output path is created by the caller's
request but the parent directory must already exist, so a typo cannot scatter files.
"""
from __future__ import annotations

import json
import os
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

    text = request.get("text")
    if not isinstance(text, str) or not text.strip():
        fail("text must be a non-empty string")
        return 0
    # A hard cap rather than an unbounded synthesis. Long input should be split by
    # the caller, who knows where the sentence boundaries are; this worker does not
    # guess them.
    if len(text) > 10_000:
        fail(f"at most 10000 characters per call, got {len(text)}; split on sentence boundaries instead")
        return 0

    voice_path = request.get("voicePath")
    if not isinstance(voice_path, str) or not voice_path:
        fail("voicePath is required")
        return 0
    if not os.path.isfile(voice_path):
        fail(
            f"the voice model was not found at {voice_path!r}. Piper 1.8.0 ships no downloader, so "
            "fetch the .onnx and the matching .onnx.json for a voice from "
            "https://huggingface.co/rhasspy/piper-voices and pass both paths.",
        )
        return 0

    output_path = request.get("outputPath")
    if not isinstance(output_path, str) or not output_path:
        fail("outputPath is required")
        return 0
    parent = os.path.dirname(os.path.abspath(output_path))
    if not os.path.isdir(parent):
        fail(f"the output directory does not exist: {parent}")
        return 0

    try:
        from piper import PiperVoice
        from piper.config import SynthesisConfig
    except Exception as error:  # noqa: BLE001
        fail(f"piper is not importable: {error}. Install it with: pip install piper-tts")
        return 0

    config_path = request.get("voiceConfigPath")
    if isinstance(config_path, str) and config_path and not os.path.isfile(config_path):
        fail(f"the voice config was not found at {config_path!r}")
        return 0

    try:
        voice = PiperVoice.load(
            voice_path,
            config_path if isinstance(config_path, str) and config_path else None,
        )
    except Exception as error:  # noqa: BLE001
        fail(f"the voice at {voice_path!r} could not be loaded: {error}")
        return 0

    syn_kwargs: dict[str, object] = {}
    for key, field in (("length_scale", "lengthScale"), ("noise_scale", "noiseScale"), ("noise_w", "noiseW")):
        value = request.get(field)
        if isinstance(value, (int, float)):
            syn_kwargs[key] = float(value)

    try:
        with wave.open(output_path, "wb") as wav_file:
            voice.synthesize_wav(
                text,
                wav_file,
                SynthesisConfig(**syn_kwargs) if syn_kwargs else None,
            )
    except Exception as error:  # noqa: BLE001
        fail(f"synthesis failed: {error}")
        return 0

    # Read the file back rather than trusting that the write happened. A zero-length
    # or headerless file is a failure, not a short recording.
    try:
        with wave.open(output_path, "rb") as produced:
            frames = produced.getnframes()
            rate = produced.getframerate()
            channels = produced.getnchannels()
            width = produced.getsampwidth()
    except Exception as error:  # noqa: BLE001
        fail(f"the output file could not be read back as a WAV: {error}")
        return 0

    if frames == 0:
        fail("synthesis produced a WAV with no audio frames", outputPath=output_path)
        return 0

    print(json.dumps({
        "ok": True,
        "outputPath": output_path,
        "durationSeconds": round(frames / rate, 3) if rate else 0,
        "sampleRate": rate,
        "channels": channels,
        "sampleWidth": width,
        "frames": frames,
        "characterCount": len(text),
        # Reported so a caller cannot mistake "audio was produced" for "the speech is
        # right". See the module docstring for why nothing here can check that.
        "qualityVerified": False,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
