/**
 * Persistent record shapes (SPEC §7, IndexedDB schema v1). Shared by the engine (pure) and
 * the store. Full paragraph text is never part of any record.
 */
import type { Fact, FactKind } from './facts';

export type ArticleKind = 'news' | 'blog' | 'liveblog';

export interface TierCounts {
  new: number;
  seen: number;
  similar: number;
  changed: number;
}

export interface ArticleRecord {
  /** SHA-256 of the canonical URL. */
  id: string;
  url: string;
  canonicalUrl: string;
  origin: string;
  /** og:site_name, else hostname. */
  siteName: string;
  title: string;
  kind: ArticleKind;
  firstReadAt: number;
  lastReadAt: number;
  paragraphCount: number;
  readCount: number;
  /** int8 centroid of the read paragraphs' vectors, null when the model was off. */
  centroid: Int8Array | null;
  centroidScale: number;
  storyId: string | null;
  /** Tier counts of the paragraphs the reader read (for the Stories tier bar). Absent on old records. */
  tiers?: TierCounts;
  expiresAt: number;
}

export interface ParagraphRecord {
  /** SHA-256 of articleId + normalised text. */
  id: string;
  articleId: string;
  ordinal: number;
  /** At most 140 characters. */
  snippet: string;
  minhash: Uint32Array;
  /** LSH band keys, multiEntry-indexed. */
  bands: string[];
  vec: Int8Array | null;
  vecScale: number;
  /** At most MAX_STORED_FACTS. */
  facts: Fact[];
  words: number;
  /** Normalised text length, for the length-ratio rule. */
  chars: number;
  readAt: number;
  expiresAt: number;
}

export interface StoryRecord {
  id: string;
  articleIds: string[];
  /** Title of the first article. */
  label: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface DriftRecord {
  id: string;
  storyId: string | null;
  newParagraphId: string;
  oldParagraphId: string;
  kind: FactKind;
  before: string;
  after: string;
  /** At most 60 characters around the token. */
  context: string;
  oldArticleId: string;
  newArticleId: string;
  detectedAt: number;
  expiresAt: number;
}

export interface FeedbackRecord {
  pairKey: string;
  verdict: 'not-old';
  createdAt: number;
  expiresAt: number;
}

export interface DailyRecord {
  /** YYYY-MM-DD, local time. */
  day: string;
  words: number;
  wordsKnown: number;
  wordsFolded: number;
  articles: number;
  pNew: number;
  pSeen: number;
  pSimilar: number;
  pChanged: number;
  expiresAt: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}
