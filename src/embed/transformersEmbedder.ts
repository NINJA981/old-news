/**
 * transformers.js adapter (ADR-0001 §4.3): all-MiniLM-L6-v2, int8, mean pooling + L2 normalise,
 * entirely from bundled files. Runs in the Chrome offscreen document, the Firefox background
 * page, Node (corpus eval) and the web app. The engine never imports this module.
 *
 * Zero network: remote models are disabled, the browser cache is off, and the ONNX runtime's
 * wasm/mjs come from the extension package (never the jsDelivr default). `useWasmCache` is off
 * because it would re-host the ORT module as a blob: URL, which the extension CSP forbids.
 */
import type { Backend } from './backend';
import { ORT_FILES } from './backend';
import type { DisposableEmbedder } from './lazyEmbedder';

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const MODEL_DTYPE = 'q8';
export const MODEL_FILE = 'onnx/model_quantized.onnx';
export const EMBED_BATCH = 16;

export interface TransformersEmbedderOptions {
  /** Absolute URL of the folder that contains `Xenova/all-MiniLM-L6-v2/...` (ends with "/"). */
  modelBaseUrl: string;
  /** Absolute URL of the folder with the ORT .mjs/.wasm files (ends with "/"). */
  ortBaseUrl: string;
  backend: Backend;
  /** ORT wasm threads. Extension pages are not cross-origin isolated, so 1 is the default. */
  numThreads?: number;
}

interface Extractor {
  (
    texts: string[],
    opts: { pooling: 'mean'; normalize: boolean },
  ): Promise<{
    data: Float32Array;
    dims: number[];
  }>;
  dispose?: () => Promise<void> | void;
}

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Groups text indices into batches of similar length. Padding to the longest text in a batch is
 * the main waste in a transformer forward pass, so sorting by length first cuts the work; callers
 * put each vector back at its original index.
 */
export function planBatches(texts: readonly string[], size: number): number[][] {
  const order = texts
    .map((_, i) => i)
    .sort((a, b) => (texts[a] as string).length - (texts[b] as string).length);
  const batches: number[][] = [];
  for (let i = 0; i < order.length; i += size) batches.push(order.slice(i, i + size));
  return batches;
}

/** Splits a flat [n, dim] tensor into n vectors. */
export function splitRows(data: Float32Array, rows: number, dim: number): Float32Array[] {
  if (data.length !== rows * dim) {
    throw new Error(`Unexpected embedding shape: ${data.length} values for ${rows}x${dim}.`);
  }
  return Array.from({ length: rows }, (_, i) => data.slice(i * dim, (i + 1) * dim));
}

export async function createTransformersEmbedder(
  opts: TransformersEmbedderOptions,
): Promise<DisposableEmbedder> {
  const { env, pipeline } = await import('@huggingface/transformers');
  const ort = withSlash(opts.ortBaseUrl);
  const files = ORT_FILES[opts.backend];

  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = withSlash(opts.modelBaseUrl);
  env.useBrowserCache = false;
  env.useWasmCache = false;
  const onnx = env.backends.onnx as {
    wasm?: { wasmPaths?: unknown; numThreads?: number; proxy?: boolean };
  };
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = { mjs: `${ort}${files.mjs}`, wasm: `${ort}${files.wasm}` };
    onnx.wasm.numThreads = opts.numThreads ?? 1;
    onnx.wasm.proxy = false;
  }

  const extractor = (await pipeline('feature-extraction', MODEL_ID, {
    dtype: MODEL_DTYPE,
    device: opts.backend,
  })) as unknown as Extractor;

  return {
    id: `${MODEL_ID}:${MODEL_DTYPE}:${opts.backend}`,
    async embed(texts) {
      const out: Float32Array[] = new Array<Float32Array>(texts.length);
      for (const indices of planBatches(texts, EMBED_BATCH)) {
        const t = await extractor(
          indices.map((i) => texts[i] as string),
          { pooling: 'mean', normalize: true },
        );
        const dim = t.dims[t.dims.length - 1] as number;
        splitRows(t.data as Float32Array, indices.length, dim).forEach((row, k) => {
          out[indices[k] as number] = row;
        });
      }
      return out;
    },
    async dispose() {
      await extractor.dispose?.();
    },
  };
}
