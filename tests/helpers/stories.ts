/** Loads the authored story fixtures in tests/fixtures/corpus/stories (CC0, see PROVENANCE.md). */
import { readdirSync, readFileSync } from 'node:fs';
import type { ArticleKind } from '../../src/engine/types';
import type { Tier } from '../../src/engine/tiers';

export interface StoryLabel {
  tier: Tier;
  /** "<articleKey>#<ordinal>" of the paragraph this one repeats or changes. */
  source?: string;
  variant?: 'verbatim' | 'edit' | 'paraphrase';
  drift?: string[];
}

export interface StoryArticle {
  url: string;
  siteName: string;
  title: string;
  kind: ArticleKind;
  /** Minutes after the first article in the story was read. */
  readAtMinutes: number;
  paragraphs: string[];
  labels: StoryLabel[];
}

export interface StoryFixture {
  id: string;
  story: string;
  license: string;
  provenance: string;
  readingOrder: string[];
  articles: Record<string, StoryArticle>;
}

const DIR = new URL('../fixtures/corpus/stories/', import.meta.url);

export function storyIds(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

export function loadStory(id: string): StoryFixture {
  const story = JSON.parse(readFileSync(new URL(`${id}.json`, DIR), 'utf8')) as StoryFixture;
  for (const [key, a] of Object.entries(story.articles)) {
    if (a.labels.length !== a.paragraphs.length) {
      throw new Error(
        `${id}/${key}: ${a.labels.length} labels for ${a.paragraphs.length} paragraphs`,
      );
    }
  }
  return story;
}
