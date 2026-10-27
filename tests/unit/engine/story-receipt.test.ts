import { describe, expect, it } from 'vitest';
import { quantize } from '../../../src/engine/quantize';
import { fakeEmbed } from '../../../src/engine/fakeEmbedder';
import {
  bumpDaily,
  dayKey,
  emptyDaily,
  isoWeek,
  lastSevenDays,
  weeklyReceipt,
} from '../../../src/engine/receipt';
import { linkStory, previouslyOn } from '../../../src/engine/story';
import type {
  ArticleRecord,
  DailyRecord,
  DriftRecord,
  StoryRecord,
} from '../../../src/engine/types';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 20, 9, 0).getTime();

function article(id: string, over: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id,
    url: `https://${id}.example/a`,
    canonicalUrl: `https://${id}.example/a`,
    origin: `https://${id}.example`,
    siteName: id,
    title: `Title ${id}`,
    kind: 'news',
    firstReadAt: NOW - DAY,
    lastReadAt: NOW - DAY,
    paragraphCount: 10,
    readCount: 1,
    centroid: null,
    centroidScale: 0,
    storyId: null,
    expiresAt: NOW + 29 * DAY,
    ...over,
  };
}

describe('linkStory', () => {
  const stories = new Map<string, Pick<StoryRecord, 'id' | 'updatedAt'>>([
    ['s-old', { id: 's-old', updatedAt: NOW - 3 * DAY }],
    ['s-new', { id: 's-new', updatedAt: NOW - DAY }],
  ]);

  it('joins the story of an article sharing >= 2 paragraphs', () => {
    const d = linkStory(
      { articleId: 'x', centroid: null, sharedParagraphs: new Map([['a', 2]]), now: NOW },
      [article('a', { storyId: 's-old' })],
      stories,
    );
    expect(d).toEqual({ storyId: 's-old', mergeStoryIds: [], linkedArticleIds: ['a'] });
  });

  it('ignores a single shared paragraph and articles outside the 7-day window', () => {
    const d = linkStory(
      {
        articleId: 'x',
        centroid: null,
        sharedParagraphs: new Map([
          ['a', 1],
          ['b', 5],
        ]),
        now: NOW,
      },
      [
        article('a', { storyId: 's-old' }),
        article('b', { storyId: 's-new', lastReadAt: NOW - 8 * DAY }),
      ],
      stories,
    );
    expect(d.storyId).toBeNull();
    expect(d.linkedArticleIds).toEqual([]);
  });

  it('links by centroid cosine >= 0.75', () => {
    const c = quantize(fakeEmbed('warehouse fire port alder smoke firefighters')).q;
    const d = linkStory(
      { articleId: 'x', centroid: c, sharedParagraphs: new Map(), now: NOW },
      [article('a', { storyId: 's-old', centroid: c })],
      stories,
    );
    expect(d.storyId).toBe('s-old');
  });

  it('picks the most recently updated story and merges the others', () => {
    const d = linkStory(
      {
        articleId: 'x',
        centroid: null,
        sharedParagraphs: new Map([
          ['a', 3],
          ['b', 2],
        ]),
        now: NOW,
      },
      [article('a', { storyId: 's-old' }), article('b', { storyId: 's-new' })],
      stories,
    );
    expect(d).toMatchObject({ storyId: 's-new', mergeStoryIds: ['s-old'] });
  });

  it('never links an article to itself', () => {
    const d = linkStory(
      { articleId: 'a', centroid: null, sharedParagraphs: new Map([['a', 9]]), now: NOW },
      [article('a', { storyId: 's-old' })],
      stories,
    );
    expect(d.storyId).toBeNull();
  });
});

describe('previouslyOn', () => {
  const story: StoryRecord = {
    id: 's1',
    articleIds: ['a', 'b', 'c'],
    label: 'Port Alder warehouse fire',
    createdAt: NOW - 2 * DAY,
    updatedAt: NOW - DAY,
    expiresAt: NOW + 28 * DAY,
  };
  const drift = (id: string, at: number, storyId = 's1'): DriftRecord => ({
    id,
    storyId,
    newParagraphId: 'n',
    oldParagraphId: 'o',
    kind: 'number',
    before: '12',
    after: '14',
    context: 'treated for smoke inhalation',
    oldArticleId: 'a',
    newArticleId: 'b',
    detectedAt: at,
    expiresAt: NOW + DAY,
  });

  it('lists the other articles newest first and the story drift newest first', () => {
    const card = previouslyOn(
      'c',
      story,
      [
        article('a', { lastReadAt: NOW - 2 * DAY }),
        article('b', { lastReadAt: NOW - DAY }),
        article('c'),
      ],
      [drift('d1', NOW - 2 * DAY), drift('d2', NOW - DAY), drift('dx', NOW, 'other')],
    );
    expect(card?.articles.map((a) => a.articleId)).toEqual(['b', 'a']);
    expect(card?.changedFigures.map((d) => d.id)).toEqual(['d2', 'd1']);
  });

  it('returns null when there is nothing earlier', () => {
    expect(previouslyOn('a', { ...story, articleIds: ['a'] }, [article('a')], [])).toBeNull();
  });
});

describe('receipt', () => {
  it('formats local day keys and ISO weeks', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
    expect(isoWeek(new Date(2026, 9, 20).getTime())).toBe('2026-W43');
    expect(isoWeek(new Date(2027, 0, 1).getTime())).toBe('2026-W53');
  });
  it('lists the last seven local days, oldest first', () => {
    const days = lastSevenDays(NOW);
    expect(days).toHaveLength(7);
    expect(days[6]).toBe('2026-10-20');
    expect(days[0]).toBe('2026-10-14');
  });
  it('bumps counters and refreshes expiry', () => {
    const d = bumpDaily(
      emptyDaily('2026-10-20', NOW),
      { words: 120, wordsKnown: 80, pSeen: 3 },
      NOW + 1,
    );
    expect(d).toMatchObject({ words: 120, wordsKnown: 80, pSeen: 3, pNew: 0 });
    expect(d.expiresAt).toBe(NOW + 1 + 35 * DAY);
  });
  it('derives the receipt only from the last 7 days (AC16.1)', () => {
    const recs: DailyRecord[] = [
      {
        ...emptyDaily('2026-10-20', NOW),
        words: 1000,
        wordsKnown: 630,
        articles: 4,
        pNew: 10,
        pSeen: 20,
      },
      { ...emptyDaily('2026-10-15', NOW), words: 1000, wordsKnown: 0, articles: 2, pNew: 5 },
      { ...emptyDaily('2026-10-01', NOW), words: 99999, wordsKnown: 99999, articles: 50 },
    ];
    const r = weeklyReceipt(recs, NOW);
    expect(r).toMatchObject({
      week: '2026-W43',
      words: 2000,
      wordsKnown: 630,
      knownPercent: 32,
      articles: 6,
      daysWithReading: 2,
      paragraphs: { new: 15, seen: 20, similar: 0, changed: 0 },
    });
  });
  it('returns null with no data rather than a receipt of zeros', () => {
    expect(weeklyReceipt([], NOW)).toBeNull();
    expect(weeklyReceipt([emptyDaily('2026-10-20', NOW)], NOW)).toBeNull();
  });
});
