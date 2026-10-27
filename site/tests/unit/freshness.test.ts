/**
 * The landing page states the repo's measured numbers. This fails when they go stale (QA r1 item 2):
 * src/generated/measured.json must be an exact copy of the repo's metrics.json and the recorded
 * package-size baseline. Fix with `pnpm fixtures`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));

describe('measured numbers are current', () => {
  const measured = json(join(SITE, 'src/generated/measured.json')) as {
    metrics: unknown;
    size: unknown;
  };
  it('matches the repo metrics.json (corpus size, recall, precision)', () => {
    expect(measured.metrics, 'run `pnpm fixtures`').toEqual(json(join(SITE, '..', 'metrics.json')));
  });
  it('matches the recorded package-size baseline', () => {
    expect(measured.size, 'run `pnpm fixtures`').toEqual(
      json(join(SITE, '..', 'scripts', 'size-baseline.json')),
    );
  });
  it('has a sample story for every fixture story in the corpus', () => {
    const samples = json(join(SITE, 'src/data/samples.json')) as { id: string }[];
    const corpus = (measured.metrics as { corpus: { stories: number } }).corpus.stories;
    expect(samples).toHaveLength(corpus);
  });
});
