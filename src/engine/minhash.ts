import { fmix32, mulberry32 } from './hash';

/** Number of hash permutations (ADR-0001 §Decision 4). */
export const NUM_PERM = 128;

const MASTER_SEED = 0x01d5eed;

/** Per-permutation seeds. Fixed forever: changing them invalidates every stored signature. */
const SEEDS: Uint32Array = (() => {
  const rand = mulberry32(MASTER_SEED);
  const seeds = new Uint32Array(NUM_PERM);
  for (let i = 0; i < NUM_PERM; i++) seeds[i] = Math.floor(rand() * 4294967296) >>> 0;
  return seeds;
})();

/**
 * MinHash signature of a set of 32-bit shingle hashes. Each permutation is
 * h_i(x) = fmix32(x XOR seed_i), a standard independent-hash-family construction.
 * An empty set yields a signature of all 0xffffffff.
 */
export function minhash(shingleHashes: Uint32Array, numPerm = NUM_PERM): Uint32Array {
  const sig = new Uint32Array(numPerm).fill(0xffffffff);
  for (let j = 0; j < shingleHashes.length; j++) {
    const x = shingleHashes[j] as number;
    for (let i = 0; i < numPerm; i++) {
      const h = fmix32((x ^ (SEEDS[i] as number)) >>> 0);
      if (h < (sig[i] as number)) sig[i] = h;
    }
  }
  return sig;
}

/** Estimated Jaccard similarity: the fraction of equal signature slots. */
export function jaccardEstimate(a: Uint32Array, b: Uint32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let eq = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i] && a[i] !== 0xffffffff) eq++;
  }
  return eq / n;
}
