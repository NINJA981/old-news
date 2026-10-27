/**
 * Single source of matching constants (ADR-0001 §5).
 *
 * Provenance: these are the architect's STARTING values (Stage 1, 2026-10-20). They have not
 * been tuned on the real-model corpus yet: tuning needs `pnpm eval` with the MiniLM weights
 * and the full corpus (ADR §8). When they are tuned, record the corpus hash and date here.
 */
export interface Thresholds {
  /** MinHash Jaccard at or above which wording counts as the same ("seen"). */
  jSeen: number;
  /** Lower Jaccard that, together with C >= cDup, still counts as the same wording. */
  jNear: number;
  /** Cosine at or above which meaning counts as duplicated. */
  cDup: number;
  /** Cosine at or above which meaning counts as similar. */
  cSim: number;
  /** Length ratio window for a pure-Jaccard "seen". */
  lenMin: number;
  lenMax: number;
}

export const THRESHOLDS: Readonly<Thresholds> = Object.freeze({
  jSeen: 0.6,
  jNear: 0.35,
  cDup: 0.93,
  cSim: 0.82,
  lenMin: 0.7,
  lenMax: 1.4,
});

export const THRESHOLDS_PROVENANCE = {
  status: 'untuned-starting-values',
  source: 'docs/adr/0001-architecture.md §5',
  corpusHash: null as string | null,
  tunedAt: null as string | null,
} as const;

/** Number of embedding candidates considered per paragraph. */
export const TOP_K = 5;

/** Memory retention (SPEC F17). */
export const TTL_DAYS = 30;
export const DAILY_TTL_DAYS = 35;
export const DAY_MS = 86_400_000;

/** Story linking window and rules (SPEC F14). */
export const STORY_WINDOW_DAYS = 7;
export const STORY_MIN_SHARED_PARAGRAPHS = 2;
export const STORY_CENTROID_COSINE = 0.75;
