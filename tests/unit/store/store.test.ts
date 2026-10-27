import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../../src/store/db';
import { ALL_STORES, EXPIRING_STORES, openOldNewsDb } from '../../../src/store/db';
import * as repo from '../../../src/store/repo';
import { sweepExpired } from '../../../src/store/ttl';
import { wipeAll } from '../../../src/store/wipe';
import type { ArticleRecord, ParagraphRecord } from '../../../src/engine/types';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 27, 12, 0).getTime();
let db: Db;
let n = 0;

beforeEach(async () => {
  db = await openOldNewsDb(`store-test-${++n}`);
});
afterEach(() => db.close());

const article = (
  id: string,
  expiresAt: number,
  extra: Partial<ArticleRecord> = {},
): ArticleRecord => ({
  id,
  url: `https://a.example/${id}`,
  canonicalUrl: `https://a.example/${id}`,
  origin: 'https://a.example',
  siteName: 'A',
  title: id,
  kind: 'news',
  firstReadAt: NOW,
  lastReadAt: NOW,
  paragraphCount: 1,
  readCount: 1,
  centroid: null,
  centroidScale: 0,
  storyId: null,
  expiresAt,
  ...extra,
});

const paragraph = (id: string, expiresAt: number, readAt = NOW): ParagraphRecord => ({
  id,
  articleId: 'a1',
  ordinal: 0,
  snippet: 's',
  minhash: new Uint32Array(128),
  bands: ['0:1', '1:2'],
  vec: null,
  vecScale: 0,
  facts: [],
  words: 10,
  chars: 60,
  readAt,
  expiresAt,
});

describe('schema v1 (SPEC §7)', () => {
  it('creates every store with its indexes', () => {
    expect([...db.objectStoreNames].sort()).toEqual([...ALL_STORES].sort());
    const tx = db.transaction([...ALL_STORES]);
    expect([...tx.objectStore('paragraphs').indexNames].sort()).toEqual([
      'articleId',
      'bands',
      'expiresAt',
      'readAt',
    ]);
    expect(tx.objectStore('paragraphs').index('bands').multiEntry).toBe(true);
    for (const s of EXPIRING_STORES)
      expect(tx.objectStore(s).indexNames.contains('expiresAt'), s).toBe(true);
  });

  it('round-trips typed arrays', async () => {
    const p = {
      ...paragraph('p1', NOW + DAY),
      vec: new Int8Array([1, -2, 3]),
      minhash: new Uint32Array([7, 8]),
    };
    await repo.putParagraphs(db, [p]);
    const got = await repo.getParagraph(db, 'p1');
    expect(got?.vec).toEqual(new Int8Array([1, -2, 3]));
    expect(got?.minhash).toEqual(new Uint32Array([7, 8]));
  });

  it('finds paragraphs by LSH band through the multiEntry index', async () => {
    await repo.putParagraphs(db, [
      paragraph('p1', NOW + DAY),
      { ...paragraph('p2', NOW + DAY), bands: ['9:9'] },
    ]);
    const hits = await db.getAllFromIndex('paragraphs', 'bands', '1:2');
    expect(hits.map((h) => h.id)).toEqual(['p1']);
  });
});

describe('TTL sweep (AC17.1)', () => {
  it('deletes every expired record in every expiring store and keeps the rest', async () => {
    const past = NOW - 1000;
    const future = NOW + DAY;
    await repo.putArticle(db, article('old', past));
    await repo.putArticle(db, article('new', future));
    await repo.putParagraphs(db, [paragraph('p-old', past), paragraph('p-new', future)]);
    await repo.putStory(db, {
      id: 's-old',
      articleIds: [],
      label: '',
      createdAt: 0,
      updatedAt: 0,
      expiresAt: past,
    });
    await repo.putStory(db, {
      id: 's-new',
      articleIds: [],
      label: '',
      createdAt: 0,
      updatedAt: 1,
      expiresAt: future,
    });
    await repo.putDrift(db, [
      {
        id: 'd-old',
        storyId: null,
        newParagraphId: 'a',
        oldParagraphId: 'b',
        kind: 'number',
        before: '12',
        after: '14',
        context: '',
        oldArticleId: 'x',
        newArticleId: 'y',
        detectedAt: 1,
        expiresAt: past,
      },
      {
        id: 'd-new',
        storyId: null,
        newParagraphId: 'a',
        oldParagraphId: 'b',
        kind: 'number',
        before: '12',
        after: '14',
        context: '',
        oldArticleId: 'x',
        newArticleId: 'y',
        detectedAt: 2,
        expiresAt: future,
      },
    ]);
    await repo.putFeedback(db, {
      pairKey: 'k-old',
      verdict: 'not-old',
      createdAt: 0,
      expiresAt: past,
    });
    await repo.putFeedback(db, {
      pairKey: 'k-new',
      verdict: 'not-old',
      createdAt: 0,
      expiresAt: future,
    });
    await db.put('daily', {
      day: '2026-01-01',
      words: 1,
      wordsKnown: 0,
      wordsFolded: 0,
      articles: 1,
      pNew: 1,
      pSeen: 0,
      pSimilar: 0,
      pChanged: 0,
      expiresAt: past,
    });
    await db.put('daily', {
      day: '2026-10-27',
      words: 1,
      wordsKnown: 0,
      wordsFolded: 0,
      articles: 1,
      pNew: 1,
      pSeen: 0,
      pSimilar: 0,
      pChanged: 0,
      expiresAt: future,
    });

    const report = await sweepExpired(db, NOW);
    expect(report).toEqual({
      articles: 1,
      paragraphs: 1,
      stories: 1,
      drift: 1,
      feedback: 1,
      daily: 1,
    });

    const counts = await repo.storeCounts(db);
    expect(counts).toMatchObject({
      articles: 1,
      paragraphs: 1,
      stories: 1,
      drift: 1,
      feedback: 1,
      daily: 1,
    });
    expect(await repo.getMeta<number>(db, 'lastSweepAt')).toBe(NOW);
  });

  it('keeps a record that expires exactly after now and removes one that expires exactly now', async () => {
    await repo.putArticle(db, article('edge', NOW));
    await repo.putArticle(db, article('later', NOW + 1));
    await sweepExpired(db, NOW);
    expect(await repo.getArticle(db, 'edge')).toBeUndefined();
    expect(await repo.getArticle(db, 'later')).toBeDefined();
  });

  it('sweeping an empty database is a no-op that still records the time', async () => {
    const report = await sweepExpired(db, NOW);
    expect(Object.values(report).every((v) => v === 0)).toBe(true);
  });
});

describe('Forget everything (AC17.2)', () => {
  it('leaves every store with zero records, including meta, and reports what it removed', async () => {
    await repo.putArticle(db, article('a1', NOW + DAY));
    await repo.putParagraphs(db, [paragraph('p1', NOW + DAY)]);
    await repo.setMeta(db, 'modelInfo', { backend: 'wasm' });
    await repo.addDaily(db, { words: 5 }, NOW);
    const removed = await wipeAll(db);
    expect(removed).toMatchObject({ articles: 1, paragraphs: 1, meta: 1, daily: 1 });
    const counts = await repo.storeCounts(db);
    expect(Object.values(counts).every((c) => c === 0)).toBe(true);
    expect((await repo.memoryStats(db)).paragraphs).toBe(0);
  });
});

describe('repo', () => {
  it('lists live paragraphs only and finds the oldest read', async () => {
    await repo.putParagraphs(db, [
      paragraph('live', NOW + DAY, NOW - 5 * DAY),
      paragraph('dead', NOW - 1, NOW - 40 * DAY),
    ]);
    expect((await repo.allParagraphs(db, NOW)).map((p) => p.id)).toEqual(['live']);
    const stats = await repo.memoryStats(db);
    expect(stats.paragraphs).toBe(2);
    expect(stats.oldestReadAt).toBe(NOW - 40 * DAY);
    expect(stats.approxBytes).toBe(2 * 2300);
  });

  it('returns articles read since a time, newest first', async () => {
    await repo.putArticle(db, article('a', NOW + DAY, { lastReadAt: NOW - 3 * DAY }));
    await repo.putArticle(db, article('b', NOW + DAY, { lastReadAt: NOW - 1 * DAY }));
    await repo.putArticle(db, article('c', NOW + DAY, { lastReadAt: NOW - 9 * DAY }));
    expect((await repo.articlesReadSince(db, NOW - 7 * DAY)).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('accumulates daily counters in one local-day record', async () => {
    await repo.addDaily(db, { words: 100, wordsKnown: 40, pSeen: 2 }, NOW);
    const rec = await repo.addDaily(
      db,
      { words: 50, wordsKnown: 10, pSeen: 1, articles: 1 },
      NOW + 1000,
    );
    expect(rec).toMatchObject({
      day: '2026-10-27',
      words: 150,
      wordsKnown: 50,
      pSeen: 3,
      articles: 1,
    });
    expect(await repo.listDaily(db)).toHaveLength(1);
  });

  it('lists drift newest first, optionally for one story', async () => {
    const d = (id: string, storyId: string, detectedAt: number) => ({
      id,
      storyId,
      newParagraphId: 'n',
      oldParagraphId: 'o',
      kind: 'number' as const,
      before: '12',
      after: '14',
      context: '',
      oldArticleId: 'x',
      newArticleId: 'y',
      detectedAt,
      expiresAt: NOW + DAY,
    });
    await repo.putDrift(db, [d('1', 'sA', 100), d('2', 'sB', 300), d('3', 'sA', 200)]);
    expect((await repo.listDrift(db)).map((x) => x.id)).toEqual(['2', '3', '1']);
    expect((await repo.listDrift(db, 'sA')).map((x) => x.id)).toEqual(['3', '1']);
  });

  it('feedback keys are returned only while unexpired', async () => {
    await repo.putFeedback(db, {
      pairKey: 'live',
      verdict: 'not-old',
      createdAt: 0,
      expiresAt: NOW + DAY,
    });
    await repo.putFeedback(db, {
      pairKey: 'dead',
      verdict: 'not-old',
      createdAt: 0,
      expiresAt: NOW - 1,
    });
    expect([...(await repo.allFeedbackKeys(db, NOW))]).toEqual(['live']);
  });
});
