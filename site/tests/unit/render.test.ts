import { describe, expect, it } from 'vitest';
import { esc, pillHtml, rowHtml, rowsHtml } from '../../src/shared/render.ts';
import type { ArticleView, ViewParagraph } from '../../src/shared/view.ts';

const base: ViewParagraph = {
  ordinal: 0,
  text: 'Twelve people were hurt',
  tier: 'new',
  skipped: false,
  fingerprint: 'fp',
  tag: null,
  provenance: null,
  drift: [],
};
const prov = {
  paragraphId: 'p',
  siteName: 'Fenwick Wire',
  title: 'T',
  url: '',
  when: 'Read yesterday, 7:40',
  snippet: 's',
  matchLine: 'm',
};

describe('render', () => {
  it('escapes reader-supplied text', () => {
    expect(esc(`<img src=x onerror="alert(1)">&'`)).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;',
    );
    const html = rowHtml({ ...base, text: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
  });

  it('wraps the changed token in a mark and renders the chip', () => {
    const html = rowHtml({
      ...base,
      tier: 'changed',
      text: '14 people were hurt',
      drift: [
        {
          kind: 'number',
          before: 'Twelve',
          after: '14',
          offset: 0,
          length: 2,
          chip: 'Twelve → 14 · Fenwick Wire said Twelve, yesterday',
        },
      ],
      provenance: prov,
    });
    expect(html).toContain('<mark class="on-mark" data-state="rest">14');
    expect(html).toContain('class="on-chip"');
    expect(html).toContain('data-drift="1"');
  });

  it('only faded tiers carry a solved opacity and a tag button', () => {
    const faded = rowHtml(
      { ...base, tier: 'seen', tag: 'Fenwick Wire · yesterday', provenance: prov },
      { alpha: { seen: 0.6, similar: 0.8 } },
    );
    expect(faded).toContain('data-a="0.6"');
    expect(faded).toContain('class="on-tag"');
    const lit = rowHtml(base, { alpha: { seen: 0.6, similar: 0.8 } });
    expect(lit).not.toContain('data-a');
    expect(lit).not.toContain('on-tag');
  });

  it('never fades or tags a skipped paragraph', () => {
    const html = rowHtml({ ...base, tier: 'seen', skipped: true, tag: 'x' });
    expect(html).toContain('data-tier="skipped"');
    expect(html).not.toContain('data-a');
  });

  it('builds a countdown pill from the engine sentence', () => {
    const view = {
      pill: 'Only 4 of 23 paragraphs are new to you',
      lit: 4,
      summary: { total: 23 },
    } as ArticleView;
    const html = pillHtml(view);
    expect(html).toContain('data-total="23"');
    expect(html).toContain('data-lit="4"');
    expect(html).toContain('data-pill-n>4<');
    expect(pillHtml({ ...view, pill: null })).toBe('');
    expect(
      pillHtml({ ...view, pill: 'Nothing new here. All 23 paragraphs are old news.' }),
    ).toContain('data-pill-n>23<');
  });

  it('renders every paragraph in order', () => {
    const view = { paragraphs: [base, { ...base, ordinal: 1 }] } as ArticleView;
    expect(rowsHtml(view).match(/class="on-row"/g)).toHaveLength(2);
  });
});
