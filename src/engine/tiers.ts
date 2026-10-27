/**
 * The tier decision table (ADR-0001 §5). First matching row wins. Guard before fade:
 * a paragraph is faded only if nothing load-bearing differs, and ambiguity resolves to lit.
 */
import type { DriftFinding } from './guard';
import type { Thresholds } from './thresholds';
import { THRESHOLDS } from './thresholds';

export type Tier = 'new' | 'seen' | 'similar' | 'changed';

export interface TierInput {
  /** MinHash Jaccard estimate with the best LSH candidate (m_j). 0 when there is none. */
  j: number;
  /** Guard findings between p and m_j. */
  gj: readonly DriftFinding[];
  /** len(p) / len(m_j). */
  lenRatio: number;
  /** Cosine with the best embedding candidate (m_c). 0 when there is none or the model is off. */
  c: number;
  /** MinHash Jaccard between p and m_c (for the C >= C_dup and J >= J_near row). */
  jc: number;
  /** Guard findings between p and m_c. */
  gc: readonly DriftFinding[];
  /** A "Not old news" feedback entry exists for a candidate pair. */
  feedback: boolean;
}

export type TierBasis = 'jaccard' | 'cosine' | null;

export interface TierDecision {
  tier: Tier;
  /** Which candidate the decision is about: m_j ('jaccard') or m_c ('cosine'). */
  basis: TierBasis;
  /** Row of the table that fired (1-based), for tests and the playground's tier table. */
  row: number;
}

export function decideTier(input: TierInput, t: Thresholds = THRESHOLDS): TierDecision {
  const { j, gj, lenRatio, c, jc, gc, feedback } = input;
  const jHit = j >= t.jSeen;
  const cDup = c >= t.cDup;
  const cSim = c >= t.cSim;

  // 1. Reader said "Not old news" for this pair.
  if (feedback) return { tier: 'new', basis: null, row: 1 };
  // 2. Same wording or duplicated meaning, but a fact differs.
  if (jHit && gj.length > 0) return { tier: 'changed', basis: 'jaccard', row: 2 };
  if (cDup && gc.length > 0) return { tier: 'changed', basis: 'cosine', row: 2 };
  // 3. Similar meaning, but a fact differs.
  if (cSim && gc.length > 0) return { tier: 'changed', basis: 'cosine', row: 3 };
  // 4. Same wording, nothing differs, similar length.
  if (jHit && gj.length === 0 && lenRatio >= t.lenMin && lenRatio <= t.lenMax) {
    return { tier: 'seen', basis: 'jaccard', row: 4 };
  }
  // 5. Duplicated meaning with overlapping wording, nothing differs.
  if (cDup && jc >= t.jNear && gc.length === 0) return { tier: 'seen', basis: 'cosine', row: 5 };
  // 6. Similar meaning, nothing differs.
  if (cSim && gc.length === 0) return { tier: 'similar', basis: 'cosine', row: 6 };
  // 7. Otherwise new.
  return { tier: 'new', basis: null, row: 7 };
}

/** True for tiers that lower the paragraph's ink. */
export function isFaded(tier: Tier): boolean {
  return tier === 'seen' || tier === 'similar';
}
