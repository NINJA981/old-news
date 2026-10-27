/**
 * Story linking and the "Previously on" card (SPEC F14). A story is the set of articles from
 * the last 7 days linked by >= 2 matched paragraphs or an article-centroid cosine >= 0.75.
 */
import { cosine8 } from './quantize';
import {
  DAY_MS,
  STORY_CENTROID_COSINE,
  STORY_MIN_SHARED_PARAGRAPHS,
  STORY_WINDOW_DAYS,
} from './thresholds';
import type { ArticleRecord, DriftRecord, StoryRecord } from './types';

export interface StoryLinkInput {
  articleId: string;
  centroid: Int8Array | null;
  /** Remembered article id -> number of this article's paragraphs matched to it. */
  sharedParagraphs: ReadonlyMap<string, number>;
  now: number;
}

export interface StoryLinkDecision {
  /** Existing story to join, or null to start a new story (or none, see `linked`). */
  storyId: string | null;
  /** Other stories that this article bridges; the host merges them into `storyId`. */
  mergeStoryIds: string[];
  /** Article ids that qualified as linked. */
  linkedArticleIds: string[];
}

/**
 * Decide which story an article belongs to. Only articles read within the window count.
 * When linked articles span several stories, the most recently updated story wins and the
 * others are merged into it.
 */
export function linkStory(
  input: StoryLinkInput,
  candidates: readonly Pick<ArticleRecord, 'id' | 'centroid' | 'storyId' | 'lastReadAt'>[],
  stories: ReadonlyMap<string, Pick<StoryRecord, 'id' | 'updatedAt'>>,
): StoryLinkDecision {
  const since = input.now - STORY_WINDOW_DAYS * DAY_MS;
  const linked: typeof candidates = candidates.filter((a) => {
    if (a.id === input.articleId || a.lastReadAt < since) return false;
    if ((input.sharedParagraphs.get(a.id) ?? 0) >= STORY_MIN_SHARED_PARAGRAPHS) return true;
    return (
      input.centroid !== null &&
      a.centroid !== null &&
      cosine8(input.centroid, a.centroid) >= STORY_CENTROID_COSINE
    );
  });
  const storyIds = [...new Set(linked.map((a) => a.storyId).filter((s): s is string => !!s))];
  storyIds.sort((a, b) => (stories.get(b)?.updatedAt ?? 0) - (stories.get(a)?.updatedAt ?? 0));
  return {
    storyId: storyIds[0] ?? null,
    mergeStoryIds: storyIds.slice(1),
    linkedArticleIds: linked.map((a) => a.id),
  };
}

export interface PreviouslyOnArticle {
  articleId: string;
  siteName: string;
  title: string;
  url: string;
  readAt: number;
}

export interface PreviouslyOnCard {
  storyId: string;
  label: string;
  articles: PreviouslyOnArticle[];
  changedFigures: DriftRecord[];
}

/**
 * The "Previously on this story" card for the article being read: the story's other articles,
 * newest first, and the drift records that involve the story, newest first.
 * Returns null when there is nothing earlier to show (an empty card never renders).
 */
export function previouslyOn(
  currentArticleId: string,
  story: StoryRecord,
  articles: readonly ArticleRecord[],
  drift: readonly DriftRecord[],
): PreviouslyOnCard | null {
  const prior = articles
    .filter((a) => a.id !== currentArticleId && story.articleIds.includes(a.id))
    .sort((a, b) => b.lastReadAt - a.lastReadAt)
    .map((a) => ({
      articleId: a.id,
      siteName: a.siteName,
      title: a.title,
      url: a.url,
      readAt: a.lastReadAt,
    }));
  if (prior.length === 0) return null;
  const changedFigures = drift
    .filter((d) => d.storyId === story.id)
    .sort((a, b) => b.detectedAt - a.detectedAt);
  return { storyId: story.id, label: story.label, articles: prior, changedFigures };
}
