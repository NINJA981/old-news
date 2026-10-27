/**
 * IndexedDB schema v1 (SPEC §7). Database "old-news" in the extension origin.
 * The engine host is the single writer (ADR-0001 §Decision 5).
 */
import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type {
  ArticleRecord,
  DailyRecord,
  DriftRecord,
  FeedbackRecord,
  MetaRecord,
  ParagraphRecord,
  StoryRecord,
} from '../engine/types';

export const DB_NAME = 'old-news';
export const DB_VERSION = 1;

export interface OldNewsDB extends DBSchema {
  articles: {
    key: string;
    value: ArticleRecord;
    indexes: { expiresAt: number; storyId: string; lastReadAt: number };
  };
  paragraphs: {
    key: string;
    value: ParagraphRecord;
    indexes: { articleId: string; bands: string; expiresAt: number; readAt: number };
  };
  stories: {
    key: string;
    value: StoryRecord;
    indexes: { expiresAt: number; updatedAt: number };
  };
  drift: {
    key: string;
    value: DriftRecord;
    indexes: { storyId: string; detectedAt: number; expiresAt: number };
  };
  feedback: {
    key: string;
    value: FeedbackRecord;
    indexes: { expiresAt: number };
  };
  daily: {
    key: string;
    value: DailyRecord;
    indexes: { expiresAt: number };
  };
  meta: {
    key: string;
    value: MetaRecord;
  };
}

export type StoreName =
  'articles' | 'paragraphs' | 'stories' | 'drift' | 'feedback' | 'daily' | 'meta';

/** Stores with an `expiresAt` index, swept by the TTL alarm. */
export const EXPIRING_STORES = [
  'articles',
  'paragraphs',
  'stories',
  'drift',
  'feedback',
  'daily',
] as const;
export type ExpiringStore = (typeof EXPIRING_STORES)[number];

export const ALL_STORES: readonly StoreName[] = [...EXPIRING_STORES, 'meta'];

export type Db = IDBPDatabase<OldNewsDB>;

/** Opens (and on first run creates) the database. Tests pass a unique name per case. */
export function openOldNewsDb(name = DB_NAME): Promise<Db> {
  return openDB<OldNewsDB>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const articles = db.createObjectStore('articles', { keyPath: 'id' });
        articles.createIndex('expiresAt', 'expiresAt');
        articles.createIndex('storyId', 'storyId');
        articles.createIndex('lastReadAt', 'lastReadAt');

        const paragraphs = db.createObjectStore('paragraphs', { keyPath: 'id' });
        paragraphs.createIndex('articleId', 'articleId');
        paragraphs.createIndex('bands', 'bands', { multiEntry: true });
        paragraphs.createIndex('expiresAt', 'expiresAt');
        paragraphs.createIndex('readAt', 'readAt');

        const stories = db.createObjectStore('stories', { keyPath: 'id' });
        stories.createIndex('expiresAt', 'expiresAt');
        stories.createIndex('updatedAt', 'updatedAt');

        const drift = db.createObjectStore('drift', { keyPath: 'id' });
        drift.createIndex('storyId', 'storyId');
        drift.createIndex('detectedAt', 'detectedAt');
        drift.createIndex('expiresAt', 'expiresAt');

        const feedback = db.createObjectStore('feedback', { keyPath: 'pairKey' });
        feedback.createIndex('expiresAt', 'expiresAt');

        const daily = db.createObjectStore('daily', { keyPath: 'day' });
        daily.createIndex('expiresAt', 'expiresAt');

        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
  });
}
