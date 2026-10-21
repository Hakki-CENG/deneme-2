/**
 * Local embeddings, and the gap they close, measured side by side.
 *
 * The case that matters here is `the hash provider cannot tell a paraphrase from an
 * unrelated sentence`. Before this existed, the hybrid index had two embedding
 * providers: an OpenAI one needing a key, and `hash-embedding-v1`, a feature hash
 * that buckets tokens by SHA-256. With no API key the hash provider was the default,
 * so retrieval produced similarity scores with no semantics behind them. Rather than
 * assert the new provider is good, this asserts the two differ on a case where the
 * difference is unambiguous — a paraphrase versus an unrelated sentence — which is a
 * claim that can be checked rather than a taste.
 *
 * The model is downloaded on first use, so the cases needing it are skipped when
 * fastembed is absent. A skipped case says "this machine has no fastembed"; a red one
 * would claim something is broken.
 */
import { describe, expect, it } from "vitest";
import { HashEmbeddingProvider } from "../src/search/hybrid-index.js";
import {
  DEFAULT_DENSE_EMBEDDING_MODEL,
  DEFAULT_SPARSE_EMBEDDING_MODEL,
  LocalEmbeddingProvider,
  LocalSparseEmbeddingProvider,
  cosineSimilarity,
  isLocalEmbeddingAvailable,
  isLocalEmbeddingAvailableSync,
  ResolvingEmbeddingProvider,
} from "../src/search/local-embedding-provider.js";

// Synchronous on purpose: a top-level await here stopped the vitest worker pool
// from starting, and the suite died before running a single file.
const available = isLocalEmbeddingAvailableSync();

describe("cosine similarity, which is pure logic", () => {
  it("is 1 for identical directions and 0 for orthogonal ones", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 9);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 9);
    expect(cosineSimilarity([1, 1], [2, 2])).toBeCloseTo(1, 9);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 9);
  });

  it("treats a zero vector as having no similarity rather than dividing by zero", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("refuses to compare vectors of different lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/different lengths/);
  });
});

describe.skipIf(!available)("real embeddings from a local model", () => {
  it("embeds text and reports which model produced the vectors", async () => {
    const provider = new LocalEmbeddingProvider();
    const vectors = await provider.embed(["Merhaba dünya", "Aurora borealis"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]!.length).toBeGreaterThan(0);
    expect(vectors[0]!.length).toBe(vectors[1]!.length);
    // Provenance is reported rather than left implicit, so a caller can see which
    // model produced a score instead of inheriting an unexamined default.
    expect(provider.lastModel).toBe(DEFAULT_DENSE_EMBEDDING_MODEL);
    expect(provider.lastDimensions).toBe(vectors[0]!.length);
  });

  it("returns an empty list for no input rather than calling the worker", async () => {
    const provider = new LocalEmbeddingProvider();
    expect(await provider.embed([])).toEqual([]);
  });

  /**
   * The case this provider exists for. Two sentences that mean the same thing using
   * different words, against a sentence that shares words but not meaning.
   */
  it("ranks a paraphrase above an unrelated sentence", async () => {
    const provider = new LocalEmbeddingProvider();
    const [query, paraphrase, unrelated] = await provider.embed([
      "a dog is running in the park",
      "a canine sprints across a green field",
      "the stock market closed higher today",
    ]);

    const paraphraseScore = cosineSimilarity(query!, paraphrase!);
    const unrelatedScore = cosineSimilarity(query!, unrelated!);
    expect(paraphraseScore).toBeGreaterThan(unrelatedScore);
  });

  it("does the same job the hash provider could not", async () => {
    const query = "a dog is running in the park";
    const paraphrase = "a canine sprints across a green field";
    const unrelated = "the stock market closed higher today";

    const local = new LocalEmbeddingProvider();
    const [localQuery, localParaphrase, localUnrelated] = await local.embed([
      query,
      paraphrase,
      unrelated,
    ]);
    const localGap =
      cosineSimilarity(localQuery!, localParaphrase!) - cosineSimilarity(localQuery!, localUnrelated!);

    const hash = new HashEmbeddingProvider();
    const [hashQuery, hashParaphrase, hashUnrelated] = await hash.embed([
      query,
      paraphrase,
      unrelated,
    ]);
    const hashGap =
      cosineSimilarity(hashQuery!, hashParaphrase!) - cosineSimilarity(hashQuery!, hashUnrelated!);

    // Both are asserted, because the point is the contrast. The hash provider sees
    // only shared tokens, and the paraphrase shares almost none, so it cannot
    // separate the two. This is not a claim that hashing is useless — it is exact
    // for literal term overlap — only that it is not semantics.
    expect(localGap).toBeGreaterThan(0.1);
    expect(hashGap).toBeLessThan(localGap);
  });

  it("produces sparse lexical weights for the other half of a hybrid search", async () => {
    const provider = new LocalSparseEmbeddingProvider();
    const vectors = await provider.embed(["a dog runs quickly"]);

    expect(vectors).toHaveLength(1);
    expect(vectors[0]!.indices.length).toBeGreaterThan(0);
    expect(vectors[0]!.indices.length).toBe(vectors[0]!.values.length);
    expect(provider.lastModel).toBe(DEFAULT_SPARSE_EMBEDDING_MODEL);
    // Indices are integers, which is what a sparse index needs.
    expect(vectors[0]!.indices.every((index) => Number.isInteger(index))).toBe(true);
  });
});

describe("the provider that picks a backend on first use", () => {
  it("prefers the local model when fastembed is importable", async () => {
    const provider = new ResolvingEmbeddingProvider();
    // Nothing is decided until the first embed, which is the point: the engine's
    // constructor is synchronous and must not pay for a subprocess spawn that most
    // engines would never use.
    expect(provider.activeProviderId).toBeUndefined();

    const vectors = await provider.embed(["a dog is running"]);
    expect(vectors).toHaveLength(1);
    expect(provider.activeProviderId).toBe(available ? "local-embedding-fastembed" : "hash-embedding-v1");
  });

  it("caches the decision instead of re-checking on every call", async () => {
    const provider = new ResolvingEmbeddingProvider();
    await provider.embed(["first"]);
    const first = provider.activeProviderId;
    await provider.embed(["second"]);
    expect(provider.activeProviderId).toBe(first);
  });

  it("says why it fell back, rather than downgrading silently", async () => {
    // A python that does not exist, so fastembed cannot be importable.
    const provider = new ResolvingEmbeddingProvider({ pythonPath: "/nonexistent/python3" });
    const vectors = await provider.embed(["a dog is running"]);

    expect(vectors).toHaveLength(1);
    expect(provider.activeProviderId).toBe("hash-embedding-v1");
    // The downgrade is the defect this exposes: hash similarity has no semantics,
    // so a caller has to be able to see that is what they got.
    expect(provider.fallbackReason).toContain("fastembed is not importable");
    expect(provider.fallbackReason).toContain("pip install fastembed");
  });

  it("does not spawn anything for an empty batch", async () => {
    const provider = new ResolvingEmbeddingProvider({ pythonPath: "/nonexistent/python3" });
    expect(await provider.embed([])).toEqual([]);
    expect(provider.activeProviderId).toBeUndefined();
  });
});

describe("failure paths that do not need a model", () => {
  it("reports a missing worker rather than hanging", async () => {
    // A python that does not exist: the spawn emits `error` and never `exit`, so a
    // provider that only waited on `exit` would hang here.
    const provider = new LocalEmbeddingProvider({ pythonPath: "/nonexistent/python3" });
    await expect(provider.embed(["text"])).rejects.toThrow(/could not be started|could not be run/);
  });

  it("says when fastembed is importable, without downloading a model", async () => {
    // A health check must not trigger a multi-hundred-megabyte download, so this
    // checks the import and nothing more.
    const result = await isLocalEmbeddingAvailable({ pythonPath: "/nonexistent/python3" });
    expect(result).toBe(false);
  });

  it("exposes the model defaults so a caller can override them deliberately", () => {
    expect(DEFAULT_DENSE_EMBEDDING_MODEL).toContain("bge");
    expect(DEFAULT_SPARSE_EMBEDDING_MODEL).toContain("bm25");
  });
});
