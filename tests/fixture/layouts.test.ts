// @vitest-environment jsdom
/**
 * Layout fixtures (SPEC AC1.1, AC1.2, AC2.1, AC3.1; ADR §8): authored CMS-pattern pages with an
 * expected outcome each. Mapped pages must map every extracted paragraph to exactly one live
 * element carrying exactly that text; rejected pages must produce no mapping, and nothing on any
 * page may be mutated by detection, extraction or mapping.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mappingKey, normalizeText } from '../../src/engine/normalize';
import { analyseDocument } from '../../src/extract';
import { LiveBlogTracker } from '../../src/extract/liveblog';
import { mapParagraphs } from '../../src/extract/map';

interface Expectation {
  status: 'mapped' | 'reject' | 'not-article' | 'non-english';
  kind?: string;
  total?: number;
  excludes?: string[];
  excludesExact?: string[];
}

const DIR = join(process.cwd(), 'tests', 'fixtures', 'layouts');
const expectations = JSON.parse(readFileSync(join(DIR, 'expectations.json'), 'utf8')) as Record<
  string,
  Expectation | string
>;
const files = Object.keys(expectations).filter((k) => !k.startsWith('_'));

function load(file: string): Document {
  return new DOMParser().parseFromString(readFileSync(join(DIR, file), 'utf8'), 'text/html');
}

const urlFor = (file: string): string => `https://layouts.example/${file.replace('.html', '')}`;

describe('layout fixture coverage', () => {
  it('has an expectation for every html fixture and vice versa', () => {
    const html = readdirSync(DIR).filter((f) => f.endsWith('.html'));
    expect([...html].sort()).toEqual([...files].sort());
  });
});

describe.each(files)('%s', (file) => {
  const want = expectations[file] as Expectation;

  it('is analysed without mutating the page', () => {
    const doc = load(file);
    const before = doc.documentElement.outerHTML;
    const observer = new MutationObserver(() => undefined);
    observer.observe(doc, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    analyseDocument(doc, urlFor(file));
    expect(observer.takeRecords()).toEqual([]);
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  if (want.status === 'mapped') {
    it(`maps every paragraph to exactly one live element (${want.kind}, ${want.total})`, () => {
      const doc = load(file);
      const result = analyseDocument(doc, urlFor(file));
      expect(result.status).toBe('mapped');
      if (result.status !== 'mapped') return;
      expect(result.kind).toBe(want.kind);
      expect(result.blocks).toHaveLength(want.total as number);
      const elements = new Set(result.blocks.map((b) => b.element));
      expect(elements.size).toBe(result.blocks.length);
      for (const b of result.blocks) {
        expect(doc.contains(b.element)).toBe(true);
        expect(mappingKey(b.element.textContent ?? '').includes(mappingKey(b.text))).toBe(true);
        expect(b.text.length).toBeGreaterThanOrEqual(60);
      }
      expect(result.blocks.map((b) => b.ordinal)).toEqual(result.blocks.map((_, i) => i));
      for (const needle of want.excludes ?? []) {
        expect(result.blocks.some((b) => normalizeText(b.text).includes(needle))).toBe(false);
      }
      for (const exact of want.excludesExact ?? []) {
        expect(result.blocks.some((b) => b.text === exact)).toBe(false);
      }
    });
  }

  if (want.status === 'reject') {
    it('does nothing: no mapping is produced, and the reason is "could not line up" (AC2.1, AC2.2)', () => {
      const result = analyseDocument(load(file), urlFor(file));
      expect(result.status).toBe('unmapped');
    });
  }

  if (want.status === 'not-article') {
    it('is not an article (AC1.1)', () => {
      expect(analyseDocument(load(file), urlFor(file))).toEqual({
        status: 'not-article',
        reason: expect.any(String),
      });
    });
  }

  if (want.status === 'non-english') {
    it('is left alone because it is not English (AC1.2)', () => {
      expect(analyseDocument(load(file), urlFor(file)).status).toBe('non-english');
    });
  }
});

describe('mapping rules (SPEC §5.2)', () => {
  const para = (n: number): string =>
    `Paragraph number ${n} has enough characters in it to count as a real paragraph of an article body.`;

  function page(html: string): Document {
    return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  }

  it('rejects fewer than three paragraphs', () => {
    const doc = page(`<p>${para(1)}</p><p>${para(2)}</p>`);
    expect(mapParagraphs(doc.body, [para(1), para(2)])).toMatchObject({
      ok: false,
      reason: 'too-few-paragraphs',
    });
  });

  it('rejects when fewer than 80% map', () => {
    const doc = page(`<p>${para(1)}</p><p>${para(2)}</p><p>${para(3)}</p>`);
    const result = mapParagraphs(doc.body, [para(1), para(2), para(3), para(4), para(5)]);
    expect(result).toMatchObject({ ok: false, reason: 'low-mapping', total: 5, mapped: 3 });
  });

  it('accepts exactly 80% (4 of 5)', () => {
    const doc = page([1, 2, 3, 4].map((n) => `<p>${para(n)}</p>`).join(''));
    const result = mapParagraphs(doc.body, [1, 2, 3, 4, 5].map(para));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.blocks).toHaveLength(4);
  });

  it('never maps one element twice', () => {
    const doc = page(`<p>${para(1)}</p><p>${para(2)}</p><p>${para(3)}</p>`);
    // The same text twice from the extractor: both would claim one element.
    const result = mapParagraphs(doc.body, [para(1), para(1), para(2), para(3)]);
    expect(result.ok).toBe(false);
  });

  it('treats ambiguous text (two identical elements) as unmapped', () => {
    const doc = page(`<p>${para(1)}</p><p>${para(1)}</p><p>${para(2)}</p><p>${para(3)}</p>`);
    const result = mapParagraphs(doc.body, [para(1), para(2), para(3)]);
    expect(result).toMatchObject({ ok: false, reason: 'low-mapping' });
  });

  it('compares whitespace- and quote-insensitively', () => {
    const text =
      'He said the plan wasn’t finished, and “more work” was needed before the vote could proceed.';
    const doc = page(
      `<p>He said   the plan wasn't finished,\n and "more work" was needed before the vote could proceed.</p><p>${para(2)}</p><p>${para(3)}</p>`,
    );
    const result = mapParagraphs(doc.body, [text, para(2), para(3)]);
    expect(result.ok).toBe(true);
  });

  it('ignores our own overlay subtree', () => {
    const doc = page(
      `<div data-old-news-overlay><p>${para(1)}</p></div><p>${para(1)}</p><p>${para(2)}</p><p>${para(3)}</p>`,
    );
    expect(mapParagraphs(doc.body, [para(1), para(2), para(3)]).ok).toBe(true);
  });

  it('ignores paragraphs shorter than 60 characters when counting', () => {
    const doc = page(`<p>${para(1)}</p><p>${para(2)}</p><p>${para(3)}</p><p>Short.</p>`);
    const result = mapParagraphs(doc.body, [para(1), para(2), para(3), 'Short.']);
    expect(result).toMatchObject({ ok: true, total: 3 });
  });
});

describe('live-blog appends (AC3.1)', () => {
  it('hands out only posts it has not seen, with ever-increasing ordinals', () => {
    const doc = load('liveblog.html');
    const tracker = new LiveBlogTracker();
    const first = tracker.scan(doc);
    expect(first.map((p) => p.ordinal)).toEqual([0, 1, 2, 3, 4]);
    expect(tracker.scan(doc)).toEqual([]);

    const feed = doc.querySelector('.live-feed') as Element;
    const post = doc.createElement('article');
    post.setAttribute('itemprop', 'liveBlogUpdate');
    post.setAttribute('data-post-id', 'p6');
    post.innerHTML =
      '<header><time datetime="2026-10-20T12:10:00Z">12:10</time></header><p>The authority has now published the full replacement timetable, which starts at 5am on Monday and runs every twenty minutes.</p>';
    feed.prepend(post);

    const fresh = tracker.scan(doc);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.ordinal).toBe(5);
    expect(fresh[0]?.element).toBe(post);
    expect(fresh[0]?.text).toContain('replacement timetable');
    expect(fresh[0]?.text).not.toContain('12:10');
    expect(tracker.size).toBe(6);
  });
});
