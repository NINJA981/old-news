/**
 * Changed-meaning split (SPEC AC6.2 / AC7.1, ADR §8). Every "fires" pair must produce at least
 * one finding of its labelled kind, every "quiet" control must produce none, and through the
 * full matcher no changed pair may ever be faded.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractFacts } from '../../src/engine/facts';
import { FakeEmbedder } from '../../src/engine/fakeEmbedder';
import { guard } from '../../src/engine/guard';
import { matchArticle } from '../../src/engine/match';
import { MemoryIndex } from '../../src/engine/memoryIndex';
import { isFaded } from '../../src/engine/tiers';
import { rememberPrepared } from '../helpers/remember';

interface Pair {
  id: string;
  kind: string;
  expect: 'fires' | 'quiet';
  a: string;
  b: string;
}

const pairs: Pair[] = readFileSync(
  new URL('../fixtures/corpus/changed-meaning.jsonl', import.meta.url),
  'utf8',
)
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as Pair);

describe('changed-meaning corpus', () => {
  it('has at least 150 labelled pairs covering every guard kind plus controls', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(150);
    const kinds = new Set(pairs.map((p) => p.kind));
    for (const k of [
      'number',
      'date',
      'money',
      'entity',
      'negation',
      'modal',
      'outcome',
      'control',
    ]) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(new Set(pairs.map((p) => p.id)).size).toBe(pairs.length);
  });

  it.each(pairs.filter((p) => p.expect === 'fires'))('$id fires a $kind finding', (p) => {
    const findings = guard(extractFacts(p.b), extractFacts(p.a));
    expect(findings.map((f) => f.kind)).toContain(p.kind);
  });

  it.each(pairs.filter((p) => p.expect === 'quiet'))('$id stays quiet', (p) => {
    expect(guard(extractFacts(p.b), extractFacts(p.a))).toEqual([]);
  });

  it('0 full fades and 0 similar fades on the changed split through the matcher', async () => {
    const changed = pairs.filter((p) => p.expect === 'fires');
    let faded = 0;
    for (const p of changed) {
      const index = new MemoryIndex();
      const embedder = new FakeEmbedder();
      await rememberPrepared(index, embedder, 'earlier', [p.a]);
      const { result } = await matchArticle([{ ordinal: 0, text: p.b }], index, embedder);
      if (result.paragraphs.some((m) => isFaded(m.tier))) faded++;
    }
    expect(faded).toBe(0);
  });
});
