import { describe, expect, it } from 'vitest';
import type { Embedder } from '../../../src/engine/embedder';
import { FakeEmbedder } from '../../../src/engine/fakeEmbedder';
import {
  feedbackPairKey,
  matchArticle,
  prepareParagraph,
  summarize,
  textFingerprint,
} from '../../../src/engine/match';
import { MemoryIndex } from '../../../src/engine/memoryIndex';
import { rememberPrepared } from '../../helpers/remember';

const WIRE = [
  'Firefighters battled a blaze at a warehouse in Port Alder for six hours on Tuesday before bringing it under control, the regional fire service said.',
  'Twelve people were treated for smoke inhalation at the scene and two were taken to hospital as a precaution, according to officials.',
  'The warehouse, owned by Port Alder Logistics, stored furniture and packaging materials, the company said in a short statement.',
  'Investigators have not yet determined the cause of the fire, and the building will remain closed while the inquiry continues.',
];

describe('prepareParagraph', () => {
  it('normalises, fingerprints and skips short text', () => {
    const p = prepareParagraph({ ordinal: 3, text: '  Short.  ' });
    expect(p.skip).toBe(true);
    expect(p.facts).toEqual([]);
    const q = prepareParagraph({ ordinal: 0, text: WIRE[0]! });
    expect(q.skip).toBe(false);
    expect(q.bands).toHaveLength(32);
    expect(q.fingerprint).toBe(textFingerprint(WIRE[0]!.replace(/ /g, '  ')));
  });
});

describe('matchArticle', () => {
  it('fades an exact wire copy as seen and keeps unrelated paragraphs new', async () => {
    const index = new MemoryIndex();
    const e = new FakeEmbedder();
    await rememberPrepared(index, e, 'wire', WIRE);
    const rewrite = [
      WIRE[0]!,
      'Local residents described thick black smoke drifting across the harbour district for most of the afternoon and evening.',
      WIRE[2]!,
    ];
    const { result } = await matchArticle(
      rewrite.map((text, ordinal) => ({ ordinal, text })),
      index,
      e,
    );
    expect(result.paragraphs.map((p) => p.tier)).toEqual(['seen', 'new', 'seen']);
    expect(result.paragraphs[0]?.matchArticleId).toBe('wire');
    expect(result.summary).toEqual({ total: 3, new: 1, seen: 2, similar: 0, changed: 0 });
    expect(result.degraded).toBe(false);
  });

  it('marks a changed figure as changed, with the drift finding', async () => {
    const index = new MemoryIndex();
    await rememberPrepared(index, null, 'wire', WIRE);
    const updated = WIRE[1]!.replace('Twelve', 'Fourteen');
    const { result } = await matchArticle([{ ordinal: 0, text: updated }], index, null);
    const [p] = result.paragraphs;
    expect(p?.tier).toBe('changed');
    expect(p?.drift.map((d) => [d.before, d.after])).toEqual([['Twelve', 'Fourteen']]);
  });

  it('prefers a candidate whose facts agree (reader already saw the new figure)', async () => {
    const index = new MemoryIndex();
    await rememberPrepared(index, null, 'day1', [WIRE[1]!], 1000);
    const day2 = WIRE[1]!.replace('Twelve', 'Fourteen');
    await rememberPrepared(index, null, 'day2', [day2], 2000);
    const { result } = await matchArticle([{ ordinal: 0, text: day2 }], index, null);
    expect(result.paragraphs[0]?.tier).toBe('seen');
    expect(result.paragraphs[0]?.matchArticleId).toBe('day2');
  });

  it('runs degraded without an embedder: seen and changed still work, similar cannot fire', async () => {
    const index = new MemoryIndex();
    await rememberPrepared(index, null, 'wire', WIRE);
    const { result } = await matchArticle([{ ordinal: 0, text: WIRE[0]! }], index, null);
    expect(result.degraded).toBe(true);
    expect(result.paragraphs[0]?.tier).toBe('seen');
  });

  it('reports degraded when the embedder throws, and still matches by wording', async () => {
    const index = new MemoryIndex();
    await rememberPrepared(index, null, 'wire', WIRE);
    const broken: Embedder = {
      id: 'broken',
      embed: () => Promise.reject(new Error('model missing')),
    };
    const { result } = await matchArticle([{ ordinal: 0, text: WIRE[3]! }], index, broken);
    expect(result.degraded).toBe(true);
    expect(result.paragraphs[0]?.tier).toBe('seen');
  });

  it('honours "Not old news" feedback for the pair', async () => {
    const index = new MemoryIndex();
    const [rec] = await rememberPrepared(index, null, 'wire', [WIRE[0]!]);
    const fp = textFingerprint(WIRE[0]!);
    const key = feedbackPairKey(fp, rec!.id);
    const { result } = await matchArticle([{ ordinal: 0, text: WIRE[0]! }], index, null, {
      hasFeedback: (k) => k === key,
    });
    expect(result.paragraphs[0]).toMatchObject({ tier: 'new', row: 1 });
  });

  it('respects the keep filter (e.g. same article in the same session)', async () => {
    const index = new MemoryIndex();
    await rememberPrepared(index, null, 'self', [WIRE[0]!]);
    const { result } = await matchArticle([{ ordinal: 0, text: WIRE[0]! }], index, null, {
      keep: (e) => e.articleId !== 'self',
    });
    expect(result.paragraphs[0]?.tier).toBe('new');
  });

  it('uses embeddings for the similar tier (rewritten paragraph, same facts)', async () => {
    const index = new MemoryIndex();
    const e = new FakeEmbedder();
    await rememberPrepared(index, e, 'wire', [WIRE[3]!]);
    // Same words, re-ordered clauses: low shingle overlap, high bag-of-words cosine.
    const reordered =
      'The building will remain closed while the inquiry continues, and investigators have not yet determined the cause of the fire.';
    const { result } = await matchArticle([{ ordinal: 0, text: reordered }], index, e);
    const [p] = result.paragraphs;
    expect(p?.c).toBeGreaterThan(0.82);
    expect(['similar', 'seen']).toContain(p?.tier);
    expect(p?.basis).toBe('cosine');
  });

  it('never matches skipped paragraphs', async () => {
    const index = new MemoryIndex();
    await rememberPrepared(index, null, 'wire', WIRE);
    const { result } = await matchArticle([{ ordinal: 0, text: 'Advertisement' }], index, null);
    expect(result.paragraphs[0]).toMatchObject({ tier: 'new', matchId: null });
  });

  it('summarize counts tiers', () => {
    expect(
      summarize([
        {
          ordinal: 0,
          tier: 'new',
          row: 7,
          basis: null,
          matchId: null,
          matchArticleId: null,
          j: 0,
          c: 0,
          drift: [],
        },
        {
          ordinal: 1,
          tier: 'seen',
          row: 4,
          basis: 'jaccard',
          matchId: 'x',
          matchArticleId: 'a',
          j: 1,
          c: 0,
          drift: [],
        },
      ]),
    ).toEqual({ total: 2, new: 1, seen: 1, similar: 0, changed: 0 });
  });
});

describe('MemoryIndex', () => {
  it('adds, replaces, removes and expires entries', async () => {
    const index = new MemoryIndex();
    const recs = await rememberPrepared(index, new FakeEmbedder(), 'a', WIRE, 1000);
    expect(index.size).toBe(4);
    index.add({ ...index.get(recs[0]!.id)!, expiresAt: 5 });
    expect(index.size).toBe(4);
    expect(index.removeExpired(10)).toBe(1);
    expect(index.size).toBe(3);
    expect(index.remove(recs[1]!.id)).toBe(true);
    expect(index.remove('missing')).toBe(false);
    index.clear();
    expect(index.size).toBe(0);
  });
  it('returns the top-k cosine candidates in order', async () => {
    const index = new MemoryIndex();
    const e = new FakeEmbedder();
    await rememberPrepared(index, e, 'a', WIRE);
    const q = prepareParagraph({ ordinal: 0, text: WIRE[2]! });
    const [v] = await e.embed([q.text]);
    const { quantize } = await import('../../../src/engine/quantize');
    const top = index.cosineCandidates(quantize(v!).q, 2);
    expect(top).toHaveLength(2);
    expect(top[0]!.entry.id).toBe('a#2');
    expect(top[0]!.score).toBeGreaterThanOrEqual(top[1]!.score);
    expect(index.cosineCandidates(new Int8Array(384), 2)).toEqual([]);
  });
});
