import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { landingBody, type LandingContext } from '../../src/landing/page.ts';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string): unknown => JSON.parse(readFileSync(join(SITE, p), 'utf8'));
const ctx: LandingContext = {
  views: read('src/generated/views.json') as LandingContext['views'],
  measured: read('src/generated/measured.json') as LandingContext['measured'],
  alpha: { seen: 0.6, similar: 0.8 },
  repoUrl: '',
  storeUrl: '',
};
const html = landingBody(ctx);

describe('landing page', () => {
  it('has the five required beats and the web app link', () => {
    for (const id of ['id="h1"', 'id="how"', 'id="privacy"', 'id="install"', 'id="source"']) {
      expect(html).toContain(id);
    }
    expect(html).toContain('Try it in your browser, no install');
    expect(html).toContain('href="/app/"');
  });

  it('states only numbers that the engine or the repo measured', () => {
    const day2 = ctx.views['port-alder-fire']!['day2']!;
    expect(day2.pill).toBe('Only 4 of 7 paragraphs are new to you');
    expect(html).toContain('<b data-pill-n>4</b> of <b>7</b>');
    const m = ctx.measured.metrics;
    expect(html).toContain(`${m.counts.firesCaught} of ${m.counts.firesTotal}`);
    expect(html).toContain(`recall ${m.metrics.changedMeaningRecall.toFixed(2)}`);
    expect(html).toContain(`${(ctx.measured.size.packedBytes / 1_000_000).toFixed(1)} MB zipped`);
  });

  it('has no lorem ipsum, testimonials, star counts or unfilled placeholders', () => {
    expect(html).not.toMatch(/lorem|ipsum|testimonial|trusted by|\bstars?\b/i);
    expect(html).not.toMatch(/\{measured/);
  });

  it('is honest that there is no store listing yet', () => {
    expect(html).toContain('is not on the Chrome Web Store yet');
    expect(html).not.toContain('github.com/{owner}');
  });

  it('keeps every fixture outlet invented and labelled', () => {
    expect(html).toContain('Fixture story');
    expect(html).not.toMatch(/Reuters|BBC|Associated Press/);
  });
});
