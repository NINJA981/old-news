/**
 * Starts the engine inside an extension page that has DOM + IndexedDB: the Chrome offscreen
 * document, or the Firefox background page. This is the only module that wires the pure engine to
 * chrome.runtime and to the bundled model files.
 *
 * Model policy (ADR-0001 §4.3, SPEC F5):
 *  - nothing loads until the first article needs it (LazyEmbedder) and it unloads after 5 min idle;
 *  - on the first load, WebGPU (if usable) and WASM are timed on the same 32-text warm-up and the
 *    faster one is used and remembered in `meta.modelInfo`;
 *  - if the model cannot load, the engine runs degraded (seen and changed tiers only).
 */
import { browser } from 'wxt/browser';
import type { Engine } from '../core/engine';
import { createEngine } from '../core/engine';
import type { Backend, BackendTiming } from '../embed/backend';
import { chooseBackend, warmupTexts, webgpuUsable } from '../embed/backend';
import type { DisposableEmbedder } from '../embed/lazyEmbedder';
import { LazyEmbedder } from '../embed/lazyEmbedder';
import { createTransformersEmbedder } from '../embed/transformersEmbedder';
import { parseEngineEnvelope } from '../messaging/protocol';
import { openOldNewsDb } from '../store/db';
import { getMeta, setMeta } from '../store/repo';
import type { Db } from '../store/db';

/** Stored in `meta.modelInfo`; shown on the Memory page. */
export interface ModelInfo {
  backend: Backend;
  embedderId: string;
  timings: BackendTiming[];
  /** (wasm - webgpu) / wasm, when both ran. */
  webgpuGain: number | null;
  reason: string;
  decidedAt: number;
}

const MODEL_INFO_KEY = 'modelInfo';

/** Several WASM threads only where the page is cross-origin isolated (Chrome; see wxt.config.ts). */
function wasmThreads(): number {
  if (!globalThis.crossOriginIsolated) return 1;
  return Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
}

function open(backend: Backend): Promise<DisposableEmbedder> {
  const base = browser.runtime.getURL('/');
  return createTransformersEmbedder({
    modelBaseUrl: `${base}models/`,
    ortBaseUrl: `${base}ort/`,
    backend,
    numThreads: wasmThreads(),
  });
}

async function time(
  backend: Backend,
): Promise<{ timing: BackendTiming; embedder: DisposableEmbedder | null }> {
  try {
    const embedder = await open(backend);
    const texts = warmupTexts(32);
    await embedder.embed(texts.slice(0, 4)); // compile kernels, not timed
    const t0 = performance.now();
    await embedder.embed(texts);
    return { timing: { backend, ok: true, ms: performance.now() - t0 }, embedder };
  } catch {
    return { timing: { backend, ok: false, ms: 0 }, embedder: null };
  }
}

/** Loads the remembered backend, or benchmarks and remembers the faster one. */
export async function createBestEmbedder(db: Db): Promise<DisposableEmbedder> {
  const known = await getMeta<ModelInfo>(db, MODEL_INFO_KEY);
  if (known && (known.backend === 'wasm' || webgpuUsable())) {
    try {
      return await open(known.backend);
    } catch {
      // Fall through to a fresh benchmark.
    }
  }
  const candidates: Backend[] = webgpuUsable() ? ['webgpu', 'wasm'] : ['wasm'];
  const runs = [];
  for (const b of candidates) runs.push(await time(b));
  const choice = chooseBackend(runs.map((r) => r.timing));
  const winner = runs.find((r) => r.timing.backend === choice.backend)?.embedder ?? null;
  for (const r of runs) if (r.embedder && r.embedder !== winner) await r.embedder.dispose();
  if (!winner || !choice.backend) throw new Error('The embedding model could not be loaded.');
  const info: ModelInfo = {
    backend: choice.backend,
    embedderId: winner.id,
    timings: runs.map((r) => r.timing),
    webgpuGain: choice.webgpuGain,
    reason: choice.reason,
    decidedAt: Date.now(),
  };
  await setMeta(db, MODEL_INFO_KEY, info);
  return winner;
}

export async function readModelInfo(db: Db): Promise<ModelInfo | undefined> {
  return getMeta<ModelInfo>(db, MODEL_INFO_KEY);
}

/**
 * Creates the engine and answers `{target:'engine', message}` envelopes from the background.
 * Returns the engine so a Firefox background page can also call it directly.
 */
export async function startExtensionEngine(): Promise<Engine> {
  const db = await openOldNewsDb();
  const embedder = new LazyEmbedder({ create: () => createBestEmbedder(db) });
  const engine = await createEngine({ db, embedder });
  browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const envelope = parseEngineEnvelope(raw);
    if (!envelope) return undefined;
    void engine.handle(envelope.message).then(sendResponse);
    return true;
  });
  return engine;
}
