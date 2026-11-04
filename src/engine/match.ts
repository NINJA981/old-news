/**
 * Article matching: prepare paragraphs, find candidates, guard, decide tiers (ADR-0001 §3 flow 2).
 * Pure apart from the injected Embedder. Nothing is persisted here.
 */
import type { Embedder } from './embedder';
import type { Fact } from './facts';
import { capFacts, extractFacts } from './facts';
import type { DriftFinding } from './guard';
import { guard } from './guard';
import { hash32 } from './hash';
import { bandKeys } from './lsh';
import type { EntryFilter, IndexEntry, MemoryIndex, Scored } from './memoryIndex';
import { jaccardEstimate, minhash } from './minhash';
import { isSkippable, mappingKey, normalizeText, wordCount } from './normalize';
import type { QuantizedVector } from './quantize';
import { quantize } from './quantize';
import { shingleHashes } from './shingle';
import type { Thresholds } from './thresholds';
import { THRESHOLDS, TOP_K } from './thresholds';
import type { Tier, TierBasis } from './tiers';
import { decideTier } from './tiers';

export interface InputParagraph {
  ordinal: number;
  text: string;
}

export interface PreparedParagraph {
  ordinal: number;
  /** Normalised text. Held in memory only, never persisted. */
  text: string;
  /** Stable fingerprint of the text, used in feedback pair keys and the ingest cache. */
  fingerprint: string;
  chars: number;
  words: number;
  skip: boolean;
  minhash: Uint32Array;
  bands: string[];
  facts: Fact[];
  vec: QuantizedVector | null;
}

export function textFingerprint(text: string): string {
  const key = mappingKey(text);
  return `${hash32(key, 1).toString(36)}${hash32(key, 2).toString(36)}-${key.length.toString(36)}`;
}

export function prepareParagraph(p: InputParagraph): PreparedParagraph {
  const text = normalizeText(p.text);
  const skip = isSkippable(text);
  const sig = minhash(shingleHashes(text));
  return {
    ordinal: p.ordinal,
    text,
    fingerprint: textFingerprint(text),
    chars: text.length,
    words: wordCount(text),
    skip,
    minhash: sig,
    bands: bandKeys(sig),
    // Capped like stored facts, so the guard compares like with like: an extra fact past the
    // cap on one side only would be a leftover and could pair into a false change.
    facts: skip ? [] : capFacts(extractFacts(text)),
    vec: null,
  };
}

/** Key for "Not old news" feedback: the new paragraph's fingerprint and the old paragraph id. */
export function feedbackPairKey(newFingerprint: string, oldParagraphId: string): string {
  return `${newFingerprint}|${oldParagraphId}`;
}

export interface ParagraphMatch {
  ordinal: number;
  tier: Tier;
  row: number;
  basis: TierBasis;
  /** The remembered paragraph this decision is about, when there is one. */
  matchId: string | null;
  matchArticleId: string | null;
  j: number;
  c: number;
  /** Findings for 'changed' paragraphs; empty otherwise. */
  drift: DriftFinding[];
}

export interface MatchOptions {
  /** Entries to consider (e.g. exclude the same article read earlier in this session). */
  keep?: EntryFilter;
  /** "Not old news" pair keys. */
  hasFeedback?: (pairKey: string) => boolean;
  thresholds?: Thresholds;
}

export interface MatchSummary {
  total: number;
  new: number;
  seen: number;
  similar: number;
  changed: number;
}

export interface MatchResult {
  paragraphs: ParagraphMatch[];
  summary: MatchSummary;
  /** True when embeddings were unavailable, so only the seen and changed tiers can fire. */
  degraded: boolean;
}

/** Embeds the non-skipped paragraphs in place. Returns false when the embedder failed or is absent. */
export async function embedPrepared(
  prepared: PreparedParagraph[],
  embedder: Embedder | null,
): Promise<boolean> {
  const todo = prepared.filter((p) => !p.skip && !p.vec);
  if (todo.length === 0) return embedder !== null;
  if (!embedder) return false;
  try {
    const vecs = await embedder.embed(todo.map((p) => p.text));
    todo.forEach((p, i) => {
      const v = vecs[i];
      if (v) p.vec = quantize(v);
    });
    return true;
  } catch {
    return false;
  }
}

/** First candidate at/above `min` whose guard is clean, else the top candidate. */
function pick(
  p: PreparedParagraph,
  candidates: Scored[],
  min: number,
): { entry: IndexEntry; score: number; findings: DriftFinding[] } | null {
  const top = candidates[0];
  if (!top) return null;
  let topFindings: DriftFinding[] | null = null;
  for (const cand of candidates) {
    if (cand.score < min) break;
    const findings = guard(p.facts, cand.entry.facts);
    if (findings.length === 0) return { ...cand, findings };
    if (cand === top) topFindings = findings;
  }
  return { ...top, findings: topFindings ?? guard(p.facts, top.entry.facts) };
}

/**
 * The same text embedded in two different batches scores up to ~0.01 apart (the quantised model's
 * padding), so candidates within this distance of the best one are treated as equally good.
 */
const SCORE_NOISE = 0.02;

/**
 * Orders meaning candidates so the source a tag names does not depend on that noise (or on the
 * order the index was filled in), whichever embedder (live model or build-time vectors) made the
 * vectors. Repeatedly takes the best remaining score and the candidates within the noise of it;
 * inside that group the closer wording wins, then the copy read first (the tag says where you
 * first read it), then the id.
 */
function rankMeaning(p: PreparedParagraph, candidates: Scored[]): Scored[] {
  const rest = [...candidates].sort((a, b) => b.score - a.score);
  const wording = (s: Scored): number => jaccardEstimate(p.minhash, s.entry.minhash);
  const out: Scored[] = [];
  while (rest.length > 0) {
    const floor = (rest[0] as Scored).score - SCORE_NOISE;
    const group: Scored[] = [];
    while (rest.length > 0 && (rest[0] as Scored).score >= floor)
      group.push(rest.shift() as Scored);
    group.sort(
      (a, b) =>
        wording(b) - wording(a) ||
        a.entry.readAt - b.entry.readAt ||
        (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0),
    );
    out.push(...group);
  }
  return out;
}

export function matchPrepared(
  prepared: readonly PreparedParagraph[],
  index: MemoryIndex,
  opts: MatchOptions = {},
): ParagraphMatch[] {
  const t = opts.thresholds ?? THRESHOLDS;
  const fb = opts.hasFeedback ?? (() => false);
  return prepared.map((p): ParagraphMatch => {
    const none: ParagraphMatch = {
      ordinal: p.ordinal,
      tier: 'new',
      row: 7,
      basis: null,
      matchId: null,
      matchArticleId: null,
      j: 0,
      c: 0,
      drift: [],
    };
    if (p.skip) return none;
    const jc = index
      .jaccardCandidates(p.minhash, p.bands, opts.keep)
      .filter((s) => s.score >= t.jNear);
    const mj = pick(p, jc, t.jSeen);
    const cc = p.vec ? rankMeaning(p, index.cosineCandidates(p.vec.q, TOP_K, opts.keep)) : [];
    const mc = pick(p, cc, t.cSim);
    const feedback =
      (mj !== null && fb(feedbackPairKey(p.fingerprint, mj.entry.id))) ||
      (mc !== null && fb(feedbackPairKey(p.fingerprint, mc.entry.id)));
    const decision = decideTier(
      {
        j: mj?.score ?? 0,
        gj: mj?.findings ?? [],
        lenRatio: mj ? p.chars / Math.max(1, mj.entry.chars) : 0,
        c: mc?.score ?? 0,
        jc: mc ? jaccardEstimate(p.minhash, mc.entry.minhash) : 0,
        gc: mc?.findings ?? [],
        feedback,
      },
      t,
    );
    const chosen = decision.basis === 'jaccard' ? mj : decision.basis === 'cosine' ? mc : null;
    return {
      ordinal: p.ordinal,
      tier: decision.tier,
      row: decision.row,
      basis: decision.basis,
      matchId: chosen?.entry.id ?? null,
      matchArticleId: chosen?.entry.articleId ?? null,
      j: mj?.score ?? 0,
      c: mc?.score ?? 0,
      drift: decision.tier === 'changed' ? (chosen?.findings ?? []) : [],
    };
  });
}

export function summarize(matches: readonly ParagraphMatch[]): MatchSummary {
  const s: MatchSummary = { total: matches.length, new: 0, seen: 0, similar: 0, changed: 0 };
  for (const m of matches) s[m.tier]++;
  return s;
}

/** Prepare, embed and match an article's paragraphs. */
export async function matchArticle(
  paragraphs: readonly InputParagraph[],
  index: MemoryIndex,
  embedder: Embedder | null,
  opts: MatchOptions = {},
): Promise<{ prepared: PreparedParagraph[]; result: MatchResult }> {
  const prepared = paragraphs.map(prepareParagraph);
  const embedded = await embedPrepared(prepared, embedder);
  const matches = matchPrepared(prepared, index, opts);
  return {
    prepared,
    result: { paragraphs: matches, summary: summarize(matches), degraded: !embedded },
  };
}
