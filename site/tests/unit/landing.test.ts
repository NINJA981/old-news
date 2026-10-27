import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HERO_ROWS, landingBody, type LandingContext } from '../../src/landing/page.ts';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string): unknown => JSON.parse(readFileSync(join(SITE, p), 'utf8'));
const ctx: LandingContext = {
  views: read('src/generated/views.json') as LandingContext['views'],
  measured: read('src/generated/measured.json') as LandingContext['measured'],
  alpha: { seen: 0.6, similar: 0.8 },
  shots: read('src/generated/shots.json') as LandingContext['shots'],
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

  it('heroes the third tab of the bridge story: 4 of 23, with the 12 -> 14 chip', () => {
    const third = ctx.views['harrow-bridge']!['morrow']!;
    expect(third.pill).toBe('Only 4 of 23 paragraphs are new to you');
    const hero = html.slice(html.indexOf('id="hero-sheet"'), html.indexOf('id="replay"'));
    expect(hero).toContain('<b data-pill-n>4</b> of <b>23</b>');
    expect(hero).toContain('12 → 14');
    // Paragraphs not drawn are still counted down by the dissolve, like those below the fold.
    const faded = (ps: typeof third.paragraphs): number =>
      ps.filter((p) => p.tier === 'seen' || p.tier === 'similar').length;
    const offscreen = faded(third.paragraphs) - faded(third.paragraphs.slice(0, HERO_ROWS));
    expect(hero).toContain(`data-offscreen="${offscreen}"`);
    expect((hero.match(/class="on-row"/g) ?? []).length).toBe(HERO_ROWS);
  });

  it('does not call the build-from-source button "Add to Chrome" while there is no listing', () => {
    const top = html.slice(0, html.indexOf('id="hero-sheet"'));
    expect(top).not.toContain('>Add to Chrome<');
    expect(top).toContain('Install in Chrome from source');
    const listed = landingBody({ ...ctx, storeUrl: 'https://chromewebstore.google.com/x' });
    expect(listed.slice(0, listed.indexOf('id="hero-sheet"'))).toContain('>Add to Chrome<');
  });

  it('uses the real screenshots with sizes and alt text', () => {
    for (const s of Object.values(ctx.shots ?? {})) {
      expect(html).toContain(`src="${s.src}" width="${s.width}" height="${s.height}"`);
    }
    expect(Object.keys(ctx.shots ?? {})).toHaveLength(2);
  });

  it('states only numbers that the engine or the repo measured', () => {
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
