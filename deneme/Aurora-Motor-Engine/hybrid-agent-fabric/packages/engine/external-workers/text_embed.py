"""Text embeddings via fastembed 0.9.0. Reads JSON on stdin, writes JSON on stdout.

    {"texts": ["..."], "model": "BAAI/bge-small-en-v1.5", "mode": "dense"}

WHY FASTEMBED AND NOT THE SENTENCE-TRANSFORMERS STACK THE PLAN NAMES. That stack
needs PyTorch. fastembed runs the same family of models through ONNX Runtime, so it
needs no torch, no GPU and no API key — which makes it the candidate that can be
measured here rather than the one that reads better in a plan. Measured before
relying on it: `BAAI/bge-small-en-v1.5` downloads in about two seconds and produces
384-dimensional vectors on CPU.

WHY THIS EXISTS AT ALL. The engine's hybrid index had two embedding providers: an
OpenAI one that needs an API key, and `hash-embedding-v1`. The second is a feature
hash — it buckets tokens by SHA-256 and adds signed counts. Two texts are similar
under it only if they share literal tokens, so a paraphrase scores no better than an
unrelated sentence. On a machine with no API key that hash provider was the default,
which means retrieval had no semantics behind it while still reporting similarity
scores. Those scores are not wrong; they just do not mean what a reader would assume.

MODES:
  "dense"  — a normalised float vector per text, for cosine similarity.
  "sparse" — term weights with indices, for the lexical half of a hybrid search.

Both are offered because a hybrid index needs both, and because reporting only the
dense half would leave the lexical side still running on hashes.

MODEL PROVENANCE IS REPORTED BACK. The model name and vector dimension come back in
the response so a caller can detect that it got a different model than it asked for,
which would otherwise show up later as similarity scores that quietly changed scale.

Caching: fastembed downloads models on first use into its cache directory. That is a
network fetch, so a first call is slower than later ones and a caller in a sealed
network will see a download error rather than a bad vector. The cache directory can be
overridden with `cacheDir`.
"""
from __future__ import annotations

import json
import sys


def fail(message: str, **extra: object) -> None:
    print(json.dumps({"ok": False, "error": message, **extra}))


def main() -> int:
    try:
        request = json.load(sys.stdin)
    except Exception as error:  # noqa: BLE001 - the message is the deliverable
        fail(f"request is not valid JSON: {error}")
        return 0

    texts = request.get("texts")
    if not isinstance(texts, list) or not texts:
        fail("texts must be a non-empty list")
        return 0
    if not all(isinstance(item, str) for item in texts):
        fail("every entry in texts must be a string")
        return 0
    # A hard cap rather than an OOM. A caller that needs more should batch, and
    # saying so beats being killed by the OS with no message.
    if len(texts) > 1024:
        fail(f"at most 1024 texts per call, got {len(texts)}; batch instead")
        return 0

    # Parsed before the model name, because the default model depends on the mode.
    mode = request.get("mode", "dense")
    if mode not in ("dense", "sparse"):
        fail(f"unknown mode {mode!r}; expected 'dense' or 'sparse'")
        return 0

    # The two model families do not overlap: a dense model cannot be used for sparse
    # embedding, and the error for trying is about the model rather than the mode,
    # which reads like a bug. So the default follows the mode. Qdrant/bm25 is the
    # sparse default because the lexical half of a hybrid search is exactly what
    # BM25 is for, and it needs no neural weights.
    model_name = request.get("model") or (
        "BAAI/bge-small-en-v1.5" if mode == "dense" else "Qdrant/bm25"
    )
    if not isinstance(model_name, str):
        fail("model must be a string")
        return 0
    try:
        if mode == "dense":
            from fastembed import TextEmbedding
        else:
            from fastembed import SparseTextEmbedding
    except Exception as error:  # noqa: BLE001
        fail(f"fastembed is not importable: {error}. Install it with: pip install fastembed")
        return 0

    kwargs: dict[str, object] = {}
    cache_dir = request.get("cacheDir")
    if isinstance(cache_dir, str) and cache_dir:
        kwargs["cache_dir"] = cache_dir

    try:
        model = (TextEmbedding if mode == "dense" else SparseTextEmbedding)(model_name, **kwargs)
    except Exception as error:  # noqa: BLE001 - covers a failed model download
        fail(
            f"the model {model_name!r} could not be loaded: {error}. "
            "This is usually a network fetch of the model weights; a machine with no "
            "outbound access needs the cache pre-populated.",
        )
        return 0

    try:
        if mode == "dense":
            vectors = [list(map(float, vector)) for vector in model.embed(texts)]
        else:
            results = []
            for entry in model.embed(texts):
                results.append({
                    "indices": [int(index) for index in entry.indices],
                    "values": [float(value) for value in entry.values],
                })
    except Exception as error:  # noqa: BLE001
        fail(f"embedding failed: {error}")
        return 0

    if mode == "dense":
        dimensions = {len(vector) for vector in vectors}
        if len(dimensions) != 1:
            fail(f"the model returned inconsistent vector lengths: {sorted(dimensions)}")
            return 0
        print(json.dumps({
            "ok": True,
            "mode": "dense",
            "model": model_name,
            "dimensions": dimensions.pop(),
            "vectors": vectors,
        }))
    else:
        print(json.dumps({
            "ok": True,
            "mode": "sparse",
            "model": model_name,
            "vectors": results,
        }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
