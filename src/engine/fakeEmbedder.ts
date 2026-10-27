/**
 * Deterministic stand-in for MiniLM used by unit and fixture tests (ADR-0001 §8):
 * hashed bag of words (unigrams + bigrams, stopwords dropped) into 384 dims, L2-normalised.
 * It has no semantic knowledge: paraphrases with different words score low. Only the corpus
 * eval and e2e use the real model.
 */
import type { Embedder } from './embedder';
import { EMBED_DIM } from './embedder';
import { hash32 } from './hash';
import { tokenize } from './normalize';

const STOP = new Set(
  'a an the of to in on at for by and or but is are was were be been has have had it its this that with as from said says'.split(
    ' ',
  ),
);

export function fakeEmbed(text: string, dim = EMBED_DIM): Float32Array {
  const v = new Float32Array(dim);
  const words = tokenize(text).filter((w) => !STOP.has(w));
  const add = (feature: string, weight: number): void => {
    const h = hash32(feature, 0x5eed);
    const idx = h % dim;
    const sign = h >>> 31 === 1 ? -1 : 1;
    v[idx] = (v[idx] as number) + sign * weight;
  };
  for (let i = 0; i < words.length; i++) {
    add(words[i] as string, 1);
    if (i + 1 < words.length) add(`${words[i]} ${words[i + 1]}`, 0.5);
  }
  let n = 0;
  for (let i = 0; i < dim; i++) n += (v[i] as number) ** 2;
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < dim; i++) v[i] = (v[i] as number) / n;
  return v;
}

export class FakeEmbedder implements Embedder {
  readonly id = 'fake-bow-384';
  calls = 0;
  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    this.calls++;
    return texts.map((t) => fakeEmbed(t));
  }
}
