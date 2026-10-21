"""Document text extraction, routed by document type. Tesseract 5.5.0 + poppler.

Reads a request from stdin as JSON, writes a result to stdout as JSON.

    {"path": "/abs/doc.pdf", "languages": "tur+eng", "psm": 3, "maxPages": 20}

Two routes, chosen by the caller and reported back so nothing is silently
assumed:

  mode "image" — an image is OCR'd directly.
  mode "pdf"   — each page is rendered to a temporary PNG by pdftoppm and
                 then OCR'd. Used for SCANNED pdfs only; a pdf that carries a
                 real text layer is handled in TypeScript by the repository's
                 own extractor, which is faster and lossless.

Why the confidence figure is reported as legibility and NOT as accuracy —
this was measured, not assumed. On the same image, a Turkish line rendered
correctly scored 85.2 mean confidence under `-l tur+eng`, while the identical
line rendered as garbage ("Turkce glsi6g") scored 84.3 under `-l eng`. A 0.9
point gap between a correct transcription and a wrong one. A badly rendered
image did drop to 54.5. So the number tracks whether the image was legible,
not whether the transcription is right, and treating it as accuracy would be
the exact failure mode this repository spends its effort on.

Language selection is load-bearing for the same reason: `-l eng` on Turkish
text does not fail loudly, it produces plausible-looking garbage. So the
language list is an explicit input with no silent default hiding inside.

Path handling: the path arrives as JSON, is resolved and checked to be an
existing file, and is passed to the tools as an argv element. There is no
shell anywhere in this file. Rendered pages go into a temporary directory
created here and removed before exit.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

MAX_OUTPUT_CHARS = 400_000
MAX_FILE_BYTES = 128 * 1024 * 1024
MAX_PAGES = 50
RENDER_DPI = 300

# Tesseract's own language tag form: letters, digits, plus and underscore,
# joined by '+'. Checked here so a malformed tag cannot reach argv.
LANGUAGE_TAG = re.compile(r"^[A-Za-z0-9_+]{1,64}$")

IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp", ".gif",
    ".pbm", ".pgm", ".ppm",
}


def fail(reason: str) -> None:
    print(json.dumps({"error": reason}), flush=True)
    raise SystemExit(1)


def parse_tsv(raw: str) -> tuple[str, list[float], list[str]]:
    """Split tesseract's TSV into text, per-word confidences, and weak words."""
    lines: list[str] = []
    confidences: list[float] = []
    weak: list[str] = []

    current_line: list[str] = []
    current_line_no = -1

    for row in raw.split("\n")[1:]:
        parts = row.split("\t")
        if len(parts) < 12:
            continue
        level, line_no, conf, text = parts[0], parts[4], parts[10], parts[11]
        if level != "5" or not text.strip():
            continue

        if line_no != current_line_no:
            if current_line:
                lines.append(" ".join(current_line))
            current_line = []
            current_line_no = line_no

        current_line.append(text)
        try:
            value = float(conf)
        except ValueError:
            continue
        # Tesseract uses -1 for non-word rows; only real scores count.
        if value < 0:
            continue
        confidences.append(value)
        if value < 60.0:
            weak.append(text)

    if current_line:
        lines.append(" ".join(current_line))

    return "\n".join(lines), confidences, weak


def ocr_one(path: str, languages: str, psm: int) -> tuple[str, list[float], list[str]]:
    try:
        completed = subprocess.run(
            ["tesseract", path, "stdout", "-l", languages, "--psm", str(psm), "tsv"],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        fail("tesseract is not installed or not on PATH")
    except subprocess.TimeoutExpired:
        fail("tesseract did not finish within 120 seconds")

    if completed.returncode != 0:
        fail(f"tesseract exited {completed.returncode}: {completed.stderr.strip()[:400]}")

    return parse_tsv(completed.stdout)


def ocr_pdf(path: str, languages: str, psm: int, max_pages: int) -> dict:
    """Render each page to a PNG and OCR it. For scanned documents only."""
    workdir = tempfile.mkdtemp(prefix="haf-doc-")
    try:
        prefix = os.path.join(workdir, "page")
        try:
            rendered = subprocess.run(
                [
                    "pdftoppm", "-png", "-r", str(RENDER_DPI),
                    "-f", "1", "-l", str(max_pages),
                    path, prefix,
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )
        except FileNotFoundError:
            fail("poppler's pdftoppm is not installed or not on PATH")
        except subprocess.TimeoutExpired:
            fail("pdftoppm did not finish within 300 seconds")

        if rendered.returncode != 0:
            fail(f"pdftoppm exited {rendered.returncode}: {rendered.stderr.strip()[:400]}")

        pages = sorted(
            os.path.join(workdir, name)
            for name in os.listdir(workdir)
            if name.endswith(".png")
        )
        if not pages:
            fail("pdftoppm produced no pages, so the pdf could not be rendered")

        texts: list[str] = []
        confidences: list[float] = []
        weak: list[str] = []
        for index, page_path in enumerate(pages, start=1):
            text, page_conf, page_weak = ocr_one(page_path, languages, psm)
            texts.append(f"--- page {index} ---\n{text}")
            confidences.extend(page_conf)
            weak.extend(page_weak)

        return {
            "text": "\n\n".join(texts),
            "pages": len(pages),
            "pageLimitReached": len(pages) >= max_pages,
            "confidences": confidences,
            "weak": weak,
        }
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main() -> None:
    try:
        request = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as err:
        fail(f"the request is not valid JSON: {err}")

    path = request.get("path")
    if not isinstance(path, str) or path.strip() == "":
        fail("no path was given")

    mode = request.get("mode")
    if mode not in {"image", "pdf"}:
        fail(f"the mode {mode!r} must be 'image' or 'pdf'")

    languages = request.get("languages", "tur+eng")
    if not isinstance(languages, str) or not LANGUAGE_TAG.match(languages):
        fail(f"the language list {languages!r} is not a valid tesseract tag")

    psm = request.get("psm", 3)
    if not isinstance(psm, int) or not 0 <= psm <= 13:
        fail(f"the page segmentation mode {psm!r} must be an integer 0..13")

    max_pages = request.get("maxPages", 20)
    if not isinstance(max_pages, int) or not 1 <= max_pages <= MAX_PAGES:
        fail(f"maxPages {max_pages!r} must be an integer 1..{MAX_PAGES}")

    if not os.path.isfile(path):
        fail(f"no such file: {path}")

    try:
        size = os.path.getsize(path)
    except OSError as err:
        fail(f"the file could not be sized: {err}")
    if size == 0:
        fail("the file is empty")
    if size > MAX_FILE_BYTES:
        fail(f"the file is {size} bytes, over the {MAX_FILE_BYTES} byte limit")

    extension = os.path.splitext(path)[1].lower()
    if mode == "image" and extension not in IMAGE_EXTENSIONS:
        fail(
            f"{extension or 'this file'} is not an image tesseract can read; "
            "supported: " + ", ".join(sorted(IMAGE_EXTENSIONS))
        )
    if mode == "pdf" and extension != ".pdf":
        fail(f"{extension or 'this file'} is not a pdf")

    if mode == "pdf":
        result = ocr_pdf(path, languages, psm, max_pages)
        pages = result["pages"]
        page_limit_reached = result["pageLimitReached"]
        text = result["text"]
        confidences = result["confidences"]
        weak = result["weak"]
    else:
        text, confidences, weak = ocr_one(path, languages, psm)
        pages = 1
        page_limit_reached = False

    if not text.strip():
        fail("no text was found in the document")

    mean = sum(confidences) / len(confidences) if confidences else None

    print(
        json.dumps(
            {
                "text": text[:MAX_OUTPUT_CHARS],
                "truncated": len(text) > MAX_OUTPUT_CHARS,
                "route": "ocr-scanned-pdf" if mode == "pdf" else "ocr-image",
                "languages": languages,
                "psm": psm,
                "pages": pages,
                "pageLimitReached": page_limit_reached,
                "wordCount": len(confidences),
                # A legibility figure. See the module docstring for the
                # measurement that says why it is not an accuracy figure.
                "meanConfidence": round(mean, 2) if mean is not None else None,
                "lowConfidenceWords": weak[:25],
                "lowConfidenceWordCount": len(weak),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
