/**
 * Real MiniLM (int8) embedder for Node build scripts, from the model files at the repo root.
 * transformers.js lives in the repo root's node_modules, so it is resolved from there.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Embedder } from '@engine';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function nodeEmbedder(): Promise<Embedder> {
  const req = createRequire(join(ROOT, 'package.json'));
  const tf = (await import(
    pathToFileURL(req.resolve('@huggingface/transformers')).href
  )) as typeof import('@huggingface/transformers');
  tf.env.allowRemoteModels = false;
  tf.env.allowLocalModels = true;
  tf.env.localModelPath = `${join(ROOT, 'public', 'models')}/`;
  const extractor = (await tf.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'q8',
  })) as unknown as (
    t: string[],
    o: { pooling: 'mean'; normalize: boolean },
  ) => Promise<{ data: Float32Array; dims: number[] }>;
  return {
    id: 'Xenova/all-MiniLM-L6-v2:q8:node',
    async embed(texts) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += 16) {
        const batch = texts.slice(i, i + 16);
        const t = await extractor(batch, { pooling: 'mean', normalize: true });
        const dim = t.dims[t.dims.length - 1] as number;
        for (let r = 0; r < batch.length; r++) out.push(t.data.slice(r * dim, (r + 1) * dim));
      }
      return out;
    },
  };
}
