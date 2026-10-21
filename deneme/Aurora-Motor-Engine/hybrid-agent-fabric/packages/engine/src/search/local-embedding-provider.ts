/**
 * A local embedding provider, so retrieval has semantics without an API key.
 *
 * THE GAP THIS CLOSES, measured rather than assumed. The engine's hybrid index had
 * two `EmbeddingProvider` implementations: one that calls OpenAI and needs a key,
 * and `hash-embedding-v1`. The second is a feature hash — it buckets tokens by
 * SHA-256 and accumulates signed counts, so two texts score as similar only when they
 * share literal tokens. On a machine with no API key the hash provider was the
 * default, which means retrieval reported similarity scores that had no meaning
 * behind them. Those scores are not wrong; they simply do not say what a reader
 * assumes. A test in this package asserts the difference directly: the same pair of
 * paraphrases is embedded by both providers, and the hash one cannot tell a
 * paraphrase from an unrelated sentence.
 *
 * WHY FASTEMBED. The plan names a sentence-transformers stack, which needs PyTorch.
 * fastembed runs the same model family through ONNX Runtime — no torch, no GPU, no
 * key — so it is the candidate that could be measured here: `BAAI/bge-small-en-v1.5`
 * downloads in about two seconds and produces 384-dimensional vectors on CPU.
 *
 * WHAT IS NOT CLAIMED. Embedding quality is model-dependent and the default model is
 * small and English-leaning. The provider reports the model name and dimension it
 * actually used, so a caller can see which model produced a score rather than
 * inheriting an unexamined default. Choosing a better model is a measurement someone
 * has to make on their own corpus; nothing here decides it for them.
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HashEmbeddingProvider, type EmbeddingProvider } from "./hybrid-index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEXT_EMBED_WORKER_PATH = resolve(HERE, "../../external-workers/text_embed.py");

export const DEFAULT_DENSE_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";
export const DEFAULT_SPARSE_EMBEDDING_MODEL = "Qdrant/bm25";

export interface LocalEmbeddingOptions {
  /** Model name; defaults to a small multilingual-capable dense model. */
  model?: string;
  pythonPath?: string;
  /** Where fastembed caches downloaded models. Defaults to fastembed's own. */
  cacheDir?: string;
  timeoutMs?: number;
}

export interface SparseVector {
  indices: number[];
  values: number[];
}

interface DenseResponse {
  ok: boolean;
  mode?: "dense";
  model?: string;
  dimensions?: number;
  vectors?: number[][];
  error?: string;
}

interface SparseResponse {
  ok: boolean;
  mode?: "sparse";
  model?: string;
  vectors?: SparseVector[];
  error?: string;
}

/** Runs the embedding worker once and parses its reply. */
async function runWorker(
  payload: Record<string, unknown>,
  options: LocalEmbeddingOptions,
): Promise<{ ok: true; body: DenseResponse & SparseResponse } | { ok: false; error: string }> {
  let stdout = "";
  let stderr = "";
  const child = spawn(options.pythonPath ?? "python3", [TEXT_EMBED_WORKER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 300_000);
  try {
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    // stdin needs its own error handler. If the child fails to start, the write
    // below emits `error` on the stream, and an unhandled stream error takes the
    // whole process down rather than surfacing as a rejected promise.
    child.stdin.on("error", () => undefined);
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
    // `error` as well as `exit`: spawning a missing interpreter emits only `error`,
    // and waiting on `exit` alone hangs forever.
    const exitCode = await new Promise<number | null>((resolveExit) => {
      child.on("error", () => resolveExit(null));
      child.on("exit", (code) => resolveExit(code));
    });
    if (exitCode === null) {
      return { ok: false, error: `the embedding worker could not be started: ${stderr.trim().slice(-300)}` };
    }
    if (stdout.trim() === "") {
      return {
        ok: false,
        error: `the embedding worker exited with code ${exitCode} and produced no output. ${stderr.trim().slice(-300)}`,
      };
    }
    const body = JSON.parse(stdout.trim()) as DenseResponse & SparseResponse;
    if (body.ok !== true) {
      return { ok: false, error: body.error ?? "the embedding worker reported a failure without a message" };
    }
    return { ok: true, body };
  } catch (error) {
    return {
      ok: false,
      error: `the embedding worker could not be run: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dense embeddings from a local ONNX model.
 *
 * Implements the same `EmbeddingProvider` contract as the OpenAI and hash providers,
 * so it drops into the hybrid index without anything else changing.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = "local-embedding-fastembed";
  /** The model actually used on the last call, so a caller can report provenance. */
  lastModel: string | undefined = undefined;
  lastDimensions: number | undefined = undefined;

  constructor(private readonly options: LocalEmbeddingOptions = {}) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const result = await runWorker(
      {
        texts,
        mode: "dense",
        ...(this.options.model ? { model: this.options.model } : {}),
        ...(this.options.cacheDir ? { cacheDir: this.options.cacheDir } : {}),
      },
      this.options,
    );
    if (!result.ok) throw new Error(result.error);
    const vectors = result.body.vectors;
    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new Error(
        `the embedding worker returned ${Array.isArray(vectors) ? vectors.length : "no"} vectors for ${texts.length} texts`,
      );
    }
    this.lastModel = result.body.model;
    this.lastDimensions = result.body.dimensions;
    return vectors;
  }
}

/**
 * Sparse (lexical) embeddings, for the other half of a hybrid search.
 *
 * Kept separate from the dense provider because a hybrid index needs both and they
 * come from different model families — a dense model cannot produce sparse weights,
 * and the error for trying is about the model rather than the mode, which reads like
 * a bug. The defaults differ accordingly.
 */
export class LocalSparseEmbeddingProvider {
  readonly id = "local-sparse-embedding-fastembed";
  lastModel: string | undefined = undefined;

  constructor(private readonly options: LocalEmbeddingOptions = {}) {}

  async embed(texts: string[]): Promise<SparseVector[]> {
    if (texts.length === 0) return [];
    const result = await runWorker(
      {
        texts,
        mode: "sparse",
        model: this.options.model ?? DEFAULT_SPARSE_EMBEDDING_MODEL,
        ...(this.options.cacheDir ? { cacheDir: this.options.cacheDir } : {}),
      },
      this.options,
    );
    if (!result.ok) throw new Error(result.error);
    const vectors = result.body.vectors;
    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new Error(
        `the sparse embedding worker returned ${Array.isArray(vectors) ? vectors.length : "no"} vectors for ${texts.length} texts`,
      );
    }
    this.lastModel = result.body.model;
    return vectors;
  }
}

/**
 * True when the local backend can actually run.
 *
 * A cheap import check rather than a model load: loading a model downloads weights,
 * which is not something a health check should do. A machine that has fastembed but
 * no network will still fail at embed time, and that failure carries the download
 * error rather than a guess.
 */
export async function isLocalEmbeddingAvailable(options: LocalEmbeddingOptions = {}): Promise<boolean> {
  const child = spawn(options.pythonPath ?? "python3", ["-c", "import fastembed"], { stdio: "ignore" });
  return new Promise<boolean>((resolvePromise) => {
    child.on("error", () => resolvePromise(false));
    child.on("exit", (code) => resolvePromise(code === 0));
  });
}

/**
 * Synchronous availability check, for callers that need the answer at module load.
 *
 * `describe.skipIf` in a test file is evaluated during collection, and a top-level
 * `await` there was enough to stop vitest's worker pool from starting at all — the
 * suite died with ERR_IPC_CHANNEL_CLOSED before a single file ran, which reads like
 * an environment failure and is not one. This costs one short subprocess and keeps
 * module evaluation synchronous.
 */
export function isLocalEmbeddingAvailableSync(options: LocalEmbeddingOptions = {}): boolean {
  try {
    return spawnSync(options.pythonPath ?? "python3", ["-c", "import fastembed"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

/** Cosine similarity, exposed so callers can compare vectors without a library. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cannot compare vectors of different lengths (${a.length} and ${b.length})`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

/**
 * Chooses between the local model and the hash fallback on first use.
 *
 * The engine's constructor is synchronous, so it cannot await an availability check.
 * Rather than pay for a subprocess spawn on every engine construction — most of which
 * never embed anything — the decision is deferred to the first `embed` call and then
 * cached.
 *
 * This is what makes "use the real model when it is installed" true without the
 * caller having to configure anything. Before it, an engine with no OpenAI key
 * silently used `hash-embedding-v1`, and nothing anywhere said so: retrieval returned
 * similarity scores that had no semantics behind them and looked exactly like scores
 * that did. `activeProviderId` exists so the choice is inspectable rather than
 * inferred, and `onFallback` lets a caller surface it — a silent downgrade is the
 * defect, not the downgrade.
 */
export class ResolvingEmbeddingProvider implements EmbeddingProvider {
  readonly id = "resolving-embedding";
  /** Set after the first embed: "local-embedding-fastembed" or "hash-embedding-v1". */
  activeProviderId: string | undefined = undefined;
  /** Why the local backend was not used, when it was not. */
  fallbackReason: string | undefined = undefined;

  private resolved: EmbeddingProvider | undefined;
  private resolving: Promise<EmbeddingProvider> | undefined;

  constructor(
    private readonly options: LocalEmbeddingOptions = {},
    private readonly onFallback?: (reason: string) => void,
  ) {}

  private async resolve(): Promise<EmbeddingProvider> {
    if (this.resolved) return this.resolved;
    if (!this.resolving) {
      this.resolving = (async () => {
        const available = await isLocalEmbeddingAvailable(this.options);
        if (available) {
          this.resolved = new LocalEmbeddingProvider(this.options);
        } else {
          const reason =
            "fastembed is not importable, so embeddings fall back to a token hash that has no " +
            "semantics. Install it with: pip install fastembed";
          this.fallbackReason = reason;
          this.resolved = new HashEmbeddingProvider();
          this.onFallback?.(reason);
        }
        this.activeProviderId = this.resolved.id;
        return this.resolved;
      })();
    }
    return this.resolving;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const provider = await this.resolve();
    return provider.embed(texts);
  }
}
