/**
 * In-memory candidate index over remembered paragraphs (ADR-0001 §Decision 4):
 * LSH bands for wording candidates, brute-force int8 cosine for meaning candidates.
 * Loaded from IndexedDB by the engine host and updated incrementally.
 */
import type { Fact } from './facts';
import { BandIndex } from './lsh';
import { jaccardEstimate } from './minhash';
import { cosine8, normSq8 } from './quantize';
import type { ParagraphRecord } from './types';

export interface IndexEntry {
  id: string;
  articleId: string;
  minhash: Uint32Array;
  bands: string[];
  vec: Int8Array | null;
  normSq: number;
  facts: Fact[];
  chars: number;
  readAt: number;
  expiresAt: number;
}

export type EntryFilter = (entry: IndexEntry) => boolean;

export interface Scored {
  entry: IndexEntry;
  score: number;
}

export function entryFromRecord(r: ParagraphRecord): IndexEntry {
  return {
    id: r.id,
    articleId: r.articleId,
    minhash: r.minhash,
    bands: r.bands,
    vec: r.vec,
    normSq: r.vec ? normSq8(r.vec) : 0,
    facts: r.facts,
    chars: r.chars,
    readAt: r.readAt,
    expiresAt: r.expiresAt,
  };
}

export class MemoryIndex {
  private readonly entries = new Map<string, IndexEntry>();
  private readonly bandIndex = new BandIndex();

  get size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): IndexEntry | undefined {
    return this.entries.get(id);
  }

  add(entry: IndexEntry): void {
    const prev = this.entries.get(entry.id);
    if (prev) this.bandIndex.remove(prev.id, prev.bands);
    this.entries.set(entry.id, entry);
    this.bandIndex.add(entry.id, entry.bands);
  }

  addRecords(records: Iterable<ParagraphRecord>): void {
    for (const r of records) this.add(entryFromRecord(r));
  }

  remove(id: string): boolean {
    const prev = this.entries.get(id);
    if (!prev) return false;
    this.bandIndex.remove(id, prev.bands);
    return this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
    this.bandIndex.clear();
  }

  /** Drops entries whose expiresAt is in the past. Returns how many were removed. */
  removeExpired(now: number): number {
    let n = 0;
    for (const e of [...this.entries.values()]) {
      if (e.expiresAt <= now && this.remove(e.id)) n++;
    }
    return n;
  }

  /** Wording candidates: entries sharing an LSH band, scored by estimated Jaccard, best first. */
  jaccardCandidates(minhash: Uint32Array, bands: readonly string[], keep?: EntryFilter): Scored[] {
    const out: Scored[] = [];
    for (const id of this.bandIndex.candidates(bands).keys()) {
      const entry = this.entries.get(id);
      if (!entry || (keep && !keep(entry))) continue;
      out.push({ entry, score: jaccardEstimate(minhash, entry.minhash) });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /** Meaning candidates: the k entries with the highest int8 cosine, best first. */
  cosineCandidates(q: Int8Array, k: number, keep?: EntryFilter): Scored[] {
    const qNorm = normSq8(q);
    if (qNorm === 0 || k <= 0) return [];
    const top: Scored[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.vec || (keep && !keep(entry))) continue;
      const score = cosine8(q, entry.vec, qNorm, entry.normSq);
      if (top.length < k) {
        top.push({ entry, score });
        top.sort((a, b) => b.score - a.score);
      } else if (score > (top[k - 1] as Scored).score) {
        top[k - 1] = { entry, score };
        top.sort((a, b) => b.score - a.score);
      }
    }
    return top;
  }

  *values(): IterableIterator<IndexEntry> {
    yield* this.entries.values();
  }
}
