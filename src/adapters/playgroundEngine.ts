/**
 * The playground's engine: the same pipeline as the extension (MinHash, guard, tiers, the bundled
 * MiniLM model), running inside the app page against a separate IndexedDB database, so playing
 * with fixtures never touches what the reader has remembered. WASM only, no network.
 */
import { browser } from 'wxt/browser';
import type { Engine } from '../core/engine';
import { createEngine } from '../core/engine';
import { LazyEmbedder } from '../embed/lazyEmbedder';
import { createTransformersEmbedder } from '../embed/transformersEmbedder';
import type { Embedder } from '../engine/embedder';

export const PLAYGROUND_DB = 'old-news-playground';
const CHUNK = 16;

export interface PlaygroundEngine {
  engine: Engine;
  /** Why the model could not load, once it has failed. */
  readonly modelError: () => string | null;
}

/** Wraps the lazy model so the UI can show "Embedding 23 / 69 paragraphs". */
class CountingEmbedder implements Embedder {
  id = 'playground';
  private total = 0;
  private done = 0;
  constructor(
    private readonly inner: Embedder,
    private readonly onProgress: (done: number, total: number) => void,
  ) {}

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    this.total += texts.length;
    this.onProgress(this.done, this.total);
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += CHUNK) {
      out.push(...(await this.inner.embed(texts.slice(i, i + CHUNK))));
      this.done = Math.min(this.total, this.done + Math.min(CHUNK, texts.length - i));
      this.onProgress(this.done, this.total);
    }
    return out;
  }
}

export async function startPlaygroundEngine(
  onProgress: (done: number, total: number) => void,
): Promise<PlaygroundEngine> {
  let error: string | null = null;
  const base = browser.runtime.getURL('/');
  const threads = globalThis.crossOriginIsolated
    ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
    : 1;
  const lazy = new LazyEmbedder({
    create: async () => {
      try {
        return await createTransformersEmbedder({
          modelBaseUrl: `${base}models/`,
          ortBaseUrl: `${base}ort/`,
          backend: 'wasm',
          numThreads: threads,
        });
      } catch (err) {
        error = err instanceof Error ? err.message : 'unknown error';
        throw err;
      }
    },
  });
  const engine = await createEngine({
    dbName: PLAYGROUND_DB,
    embedder: new CountingEmbedder(lazy, onProgress),
  });
  return { engine, modelError: () => error };
}
