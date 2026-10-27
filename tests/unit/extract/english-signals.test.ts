// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  isEnglish,
  isEnglishLangTag,
  isEnglishText,
  MIN_STOPWORD_RATIO,
  stopwordRatio,
} from '../../../src/extract/english';
import {
  articleKind,
  articleSignals,
  hasArticleSignal,
  jsonLdTypes,
  pageInfo,
} from '../../../src/extract/signals';

const doc = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

const EN =
  'The council said on Tuesday that the new rules would apply to all of the buildings in the area, and that it would publish more details after the meeting on Thursday.';
const FR =
  "Le conseil a déclaré mardi que les nouvelles règles s'appliqueraient à tous les bâtiments de la zone et qu'il publierait plus de détails après la réunion de jeudi prochain.";
const DE =
  'Der Rat teilte am Dienstag mit, dass die neuen Regeln für alle Gebäude in der Gegend gelten würden und dass weitere Einzelheiten nach der Sitzung am Donnerstag veröffentlicht werden sollen.';

describe('English gate (AC1.2)', () => {
  it('accepts absent and English language tags', () => {
    for (const tag of [undefined, null, '', 'en', 'EN', 'en-GB', 'en_US', ' en-AU ']) {
      expect(isEnglishLangTag(tag), String(tag)).toBe(true);
    }
  });

  it('rejects other declared languages', () => {
    for (const tag of ['fr', 'de-DE', 'es', 'ja', 'eno'])
      expect(isEnglishLangTag(tag), tag).toBe(false);
  });

  it('recognises English prose and rejects French and German prose', () => {
    expect(isEnglishText(EN)).toBe(true);
    expect(isEnglishText(FR)).toBe(false);
    expect(isEnglishText(DE)).toBe(false);
    expect(stopwordRatio(EN)).toBeGreaterThan(MIN_STOPWORD_RATIO);
  });

  it('needs at least 30 words to decide', () => {
    expect(isEnglishText('The council said it would meet on Tuesday.')).toBe(false);
    expect(stopwordRatio('')).toBe(0);
  });

  it('requires both the tag and the text to agree', () => {
    expect(isEnglish('en', EN)).toBe(true);
    expect(isEnglish('fr', EN)).toBe(false);
    expect(isEnglish('en', FR)).toBe(false); // lang="en" on a French page still does nothing
  });
});

describe('article signals (ADR §3 flow 1)', () => {
  it('reads JSON-LD types, including @graph, arrays and malformed blocks', () => {
    const d = doc(`<head>
      <script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":["Article","Thing"]}]}</script>
      <script type="application/ld+json">{not json</script>
      <script type="application/ld+json">{"@type":"NewsArticle"}</script></head><body></body>`);
    expect([...jsonLdTypes(d)].sort()).toEqual(['article', 'newsarticle', 'thing', 'website']);
  });

  it('fires on og:type=article, an article JSON-LD type, or five long paragraphs', () => {
    expect(
      hasArticleSignal(articleSignals(doc('<meta property="og:type" content="article">'))),
    ).toBe(true);
    expect(
      hasArticleSignal(
        articleSignals(doc('<script type="application/ld+json">{"@type":"BlogPosting"}</script>')),
      ),
    ).toBe(true);
    const long = `<p>${'word '.repeat(40)}</p>`;
    expect(hasArticleSignal(articleSignals(doc(long.repeat(5))))).toBe(true);
    expect(hasArticleSignal(articleSignals(doc(long.repeat(4))))).toBe(false);
  });

  it('does not fire on a page with none of them', () => {
    expect(
      hasArticleSignal(
        articleSignals(doc('<p>Short.</p><meta property="og:type" content="website">')),
      ),
    ).toBe(false);
  });

  it('classifies live blogs, blog posts and news', () => {
    const kind = (ld: string) =>
      articleKind(
        articleSignals(doc(`<script type="application/ld+json">{"@type":"${ld}"}</script>`)),
      );
    expect(kind('LiveBlogPosting')).toBe('liveblog');
    expect(kind('BlogPosting')).toBe('blog');
    expect(kind('NewsArticle')).toBe('news');
  });
});

describe('pageInfo', () => {
  const url = 'https://calder-courier.example/news/story?utm_source=x';

  it('uses og:site_name, else the hostname', () => {
    expect(
      pageInfo(doc('<meta property="og:site_name" content="Calder Courier">'), url).siteName,
    ).toBe('Calder Courier');
    expect(pageInfo(doc(''), url).siteName).toBe('calder-courier.example');
  });

  it('canonicalises the URL and strips tracking parameters', () => {
    expect(pageInfo(doc(''), url).canonicalUrl).toBe('https://calder-courier.example/news/story');
  });

  it('trusts a same-site canonical link', () => {
    const d = doc('<link rel="canonical" href="/news/story-final/">');
    expect(pageInfo(d, url).canonicalUrl).toBe('https://calder-courier.example/news/story-final');
  });

  it('ignores a canonical on another site or one that points at the home page', () => {
    expect(
      pageInfo(doc('<link rel="canonical" href="https://other.example/a">'), url).canonicalUrl,
    ).toBe('https://calder-courier.example/news/story');
    expect(
      pageInfo(doc('<link rel="canonical" href="https://calder-courier.example/">'), url)
        .canonicalUrl,
    ).toBe('https://calder-courier.example/news/story');
  });

  it('prefers og:title and caps the title length', () => {
    const d = doc(
      `<title>Fallback</title><meta property="og:title" content="${'x'.repeat(2000)}">`,
    );
    expect(pageInfo(d, url).title).toHaveLength(1000);
    expect(pageInfo(doc('<title>  Fallback   title </title>'), url).title).toBe('Fallback title');
  });
});
