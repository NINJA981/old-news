/** Typed reads and writes over the v1 schema. All functions take an open Db. */
import { bumpDaily, dayKey, emptyDaily } from '../engine/receipt';
import type { DailyDelta } from '../engine/receipt';
import type {
  ArticleRecord,
  DailyRecord,
  DriftRecord,
  FeedbackRecord,
  ParagraphRecord,
  StoryRecord,
} from '../engine/types';
import type { Db } from './db';
import { ALL_STORES } from './db';

export async function getArticle(db: Db, id: string): Promise<ArticleRecord | undefined> {
  return db.get('articles', id);
}

export async function putArticle(db: Db, rec: ArticleRecord): Promise<void> {
  await db.put('articles', rec);
}

export async function getArticles(db: Db, ids: readonly string[]): Promise<ArticleRecord[]> {
  const tx = db.transaction('articles');
  const out = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  return out.filter((a): a is ArticleRecord => a !== undefined);
}

/** Articles read at or after `since`, newest first. */
export async function articlesReadSince(db: Db, since: number): Promise<ArticleRecord[]> {
  const list = await db.getAllFromIndex('articles', 'lastReadAt', IDBKeyRange.lowerBound(since));
  return list.reverse();
}

export async function putParagraphs(db: Db, recs: readonly ParagraphRecord[]): Promise<void> {
  if (recs.length === 0) return;
  const tx = db.transaction('paragraphs', 'readwrite');
  await Promise.all([...recs.map((r) => tx.store.put(r)), tx.done]);
}

export async function paragraphsByArticle(db: Db, articleId: string): Promise<ParagraphRecord[]> {
  return db.getAllFromIndex('paragraphs', 'articleId', articleId);
}

export async function getParagraph(db: Db, id: string): Promise<ParagraphRecord | undefined> {
  return db.get('paragraphs', id);
}

/** Every live paragraph, for loading the in-memory index at host start. */
export async function allParagraphs(db: Db, now: number): Promise<ParagraphRecord[]> {
  return db.getAllFromIndex('paragraphs', 'expiresAt', IDBKeyRange.lowerBound(now, true));
}

export async function getStory(db: Db, id: string): Promise<StoryRecord | undefined> {
  return db.get('stories', id);
}

export async function putStory(db: Db, rec: StoryRecord): Promise<void> {
  await db.put('stories', rec);
}

export async function deleteStory(db: Db, id: string): Promise<void> {
  await db.delete('stories', id);
}

/** Stories updated at or after `since`, most recently updated first. */
export async function listStories(db: Db, since = 0): Promise<StoryRecord[]> {
  const list = await db.getAllFromIndex('stories', 'updatedAt', IDBKeyRange.lowerBound(since));
  return list.reverse();
}

export async function putDrift(db: Db, recs: readonly DriftRecord[]): Promise<void> {
  if (recs.length === 0) return;
  const tx = db.transaction('drift', 'readwrite');
  await Promise.all([...recs.map((r) => tx.store.put(r)), tx.done]);
}

/** Drift records, newest first; one story or all. */
export async function listDrift(db: Db, storyId?: string): Promise<DriftRecord[]> {
  const list = storyId
    ? await db.getAllFromIndex('drift', 'storyId', storyId)
    : await db.getAllFromIndex('drift', 'detectedAt');
  return list.sort((a, b) => b.detectedAt - a.detectedAt);
}

export async function putFeedback(db: Db, rec: FeedbackRecord): Promise<void> {
  await db.put('feedback', rec);
}

export async function allFeedbackKeys(db: Db, now: number): Promise<Set<string>> {
  const recs = await db.getAllFromIndex('feedback', 'expiresAt', IDBKeyRange.lowerBound(now, true));
  return new Set(recs.map((r) => r.pairKey));
}

/** Adds a delta to today's (local) daily counters in one transaction. */
export async function addDaily(db: Db, delta: DailyDelta, now: number): Promise<DailyRecord> {
  const day = dayKey(now);
  const tx = db.transaction('daily', 'readwrite');
  const prev = (await tx.store.get(day)) ?? emptyDaily(day, now);
  const next = bumpDaily(prev, delta, now);
  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function listDaily(db: Db): Promise<DailyRecord[]> {
  return db.getAll('daily');
}

export async function getMeta<T>(db: Db, key: string): Promise<T | undefined> {
  return (await db.get('meta', key))?.value as T | undefined;
}

export async function setMeta(db: Db, key: string, value: unknown): Promise<void> {
  await db.put('meta', { key, value });
}

export interface MemoryStats {
  paragraphs: number;
  articles: number;
  stories: number;
  drift: number;
  /** readAt of the oldest remembered paragraph, or null when memory is empty. */
  oldestReadAt: number | null;
  /** Rough bytes: vectors, signatures, bands, snippets and facts (SPEC §7 estimate ~2.3 KB/paragraph). */
  approxBytes: number;
}

export async function memoryStats(db: Db): Promise<MemoryStats> {
  const [paragraphs, articles, stories, drift, oldest] = await Promise.all([
    db.count('paragraphs'),
    db.count('articles'),
    db.count('stories'),
    db.count('drift'),
    db.transaction('paragraphs').store.index('readAt').openCursor(),
  ]);
  return {
    paragraphs,
    articles,
    stories,
    drift,
    oldestReadAt: oldest?.value.readAt ?? null,
    approxBytes: paragraphs * 2300,
  };
}

/** Number of records per store. */
export async function storeCounts(db: Db): Promise<Record<string, number>> {
  const counts = await Promise.all(ALL_STORES.map((s) => db.count(s)));
  return Object.fromEntries(ALL_STORES.map((s, i) => [s, counts[i] ?? 0]));
}
