import { hash32 } from './hash';
import { tokenize } from './normalize';

/** Shingle width in words (ADR-0001 §Decision 4). */
export const SHINGLE_SIZE = 5;

/**
 * Word k-shingles of a paragraph. A paragraph shorter than k words yields one shingle
 * made of all its words, so very short texts still compare.
 */
export function shingles(text: string, k = SHINGLE_SIZE): string[] {
  const words = tokenize(text);
  if (words.length === 0) return [];
  if (words.length <= k) return [words.join(' ')];
  const out: string[] = [];
  for (let i = 0; i + k <= words.length; i++) {
    out.push(words.slice(i, i + k).join(' '));
  }
  return out;
}

/** Distinct 32-bit hashes of the shingles. */
export function shingleHashes(text: string, k = SHINGLE_SIZE): Uint32Array {
  const set = new Set<number>();
  for (const s of shingles(text, k)) set.add(hash32(s, 0x9747b28c));
  return Uint32Array.from(set);
}

/** Exact Jaccard similarity of two shingle-hash sets. Used by tests and the corpus eval. */
export function exactJaccard(a: Uint32Array, b: Uint32Array): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  let inter = 0;
  const setB = new Set(b);
  for (const x of setB) if (setA.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}
