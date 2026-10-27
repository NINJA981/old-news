/**
 * Story corpus through the real engine code (with the deterministic FakeEmbedder; the real-model
 * eval is scripts/eval-corpus.ts, not yet written). Each story is "read" in order; every paragraph
 * of each later article is matched against everything read before it and scored against its label.
 *
 * Gates asserted here (SPEC AC6.2, ADR §8):
 *  - no paragraph labelled new or changed is ever faded (full-fade precision on labelled text);
 *  - every verbatim repeat is "seen";
 *  - every labelled change on a verbatim-structure edit fires the guard and stays lit.
 * Paraphrase ("similar") recall needs the real model and is not asserted here.
 */
import { describe, expect, it } from 'vitest';
import { FakeEmbedder } from '../../src/engine/fakeEmbedder';
import { matchArticle } from '../../src/engine/match';
import { MemoryIndex } from '../../src/engine/memoryIndex';
import { isFaded } from '../../src/engine/tiers';
import { rememberPrepared } from '../helpers/remember';
import { loadStory, storyIds } from '../helpers/stories';

describe.each(storyIds())('story %s', (id) => {
  const story = loadStory(id);

  it('is authored CC0 with invented outlets', () => {
    expect(story.license).toBe('CC0-1.0');
    for (const a of Object.values(story.articles))
      expect(a.url).toMatch(/^https:\/\/[a-z-]+\.example\//);
  });

  it('matches every article against what was read before it', async () => {
    const index = new MemoryIndex();
    const embedder = new FakeEmbedder();
    const problems: string[] = [];
    for (const [step, key] of story.readingOrder.entries()) {
      const article = story.articles[key]!;
      const { result } = await matchArticle(
        article.paragraphs.map((text, ordinal) => ({ ordinal, text })),
        index,
        embedder,
      );
      for (const m of result.paragraphs) {
        const label = article.labels[m.ordinal]!;
        const where = `${key}#${m.ordinal} (label ${label.tier}, got ${m.tier})`;
        if (step === 0 && m.tier !== 'new')
          problems.push(`first article must be all new: ${where}`);
        if ((label.tier === 'new' || label.tier === 'changed') && isFaded(m.tier))
          problems.push(`false fade: ${where}`);
        if (label.tier === 'seen' && label.variant === 'verbatim' && m.tier !== 'seen')
          problems.push(`missed verbatim repeat: ${where}`);
        if (label.tier === 'changed' && m.tier === 'changed') {
          const kinds = new Set(m.drift.map((d) => d.kind));
          for (const k of label.drift ?? [])
            if (!kinds.has(k as never)) problems.push(`drift kind ${k} missing: ${where}`);
        }
        if (label.tier === 'changed' && label.drift?.length === 1 && m.tier !== 'changed') {
          problems.push(`single-token change not caught: ${where}`);
        }
      }
      await rememberPrepared(index, embedder, key, article.paragraphs, step + 1);
    }
    expect(problems).toEqual([]);
  });
});
