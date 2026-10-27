import { hash32 } from './hash';
import { NUM_PERM } from './minhash';

/** 32 bands x 4 rows over a 128-slot signature (ADR-0001 §Decision 4). */
export const BANDS = 32;
export const ROWS = NUM_PERM / BANDS;

/**
 * LSH band keys for a MinHash signature: one string per band, "b<band>:<hash>".
 * Two signatures that share any key are candidates. With 32x4, the probability of
 * becoming a candidate is about 0.99 at Jaccard 0.6 and about 0.38 at 0.35.
 */
export function bandKeys(signature: Uint32Array): string[] {
  const keys: string[] = [];
  for (let b = 0; b < BANDS; b++) {
    let s = '';
    for (let r = 0; r < ROWS; r++) {
      s += `${(signature[b * ROWS + r] as number).toString(36)}.`;
    }
    keys.push(`b${b}:${hash32(s, b).toString(36)}`);
  }
  return keys;
}

/** Probability that a pair with true Jaccard `j` shares at least one band. */
export function candidateProbability(j: number, bands = BANDS, rows = ROWS): number {
  return 1 - (1 - j ** rows) ** bands;
}

/** In-memory inverted index from band key to item ids. */
export class BandIndex {
  private readonly buckets = new Map<string, Set<string>>();

  add(id: string, keys: readonly string[]): void {
    for (const key of keys) {
      let set = this.buckets.get(key);
      if (!set) {
        set = new Set();
        this.buckets.set(key, set);
      }
      set.add(id);
    }
  }

  remove(id: string, keys: readonly string[]): void {
    for (const key of keys) {
      const set = this.buckets.get(key);
      if (!set) continue;
      set.delete(id);
      if (set.size === 0) this.buckets.delete(key);
    }
  }

  /** Ids sharing at least one band key, with the number of shared bands. */
  candidates(keys: readonly string[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const key of keys) {
      const set = this.buckets.get(key);
      if (!set) continue;
      for (const id of set) out.set(id, (out.get(id) ?? 0) + 1);
    }
    return out;
  }

  clear(): void {
    this.buckets.clear();
  }

  get bucketCount(): number {
    return this.buckets.size;
  }
}
