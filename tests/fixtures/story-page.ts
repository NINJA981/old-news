/**
 * Renders an authored story article (tests/fixtures/corpus/stories, CC0, invented outlets) as a
 * news-site page, so e2e tests and the screenshot script exercise the overlay on realistic markup
 * in light, dark and tinted page themes (AC8.1). Nothing here names a real outlet.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PageTheme = 'light' | 'dark' | 'tint';

interface StoryArticle {
  url: string;
  siteName: string;
  title: string;
  paragraphs: string[];
}

interface Story {
  articles: Record<string, StoryArticle>;
}

const THEMES: Record<PageTheme, { bg: string; ink: string; muted: string; rule: string }> = {
  light: { bg: '#ffffff', ink: '#121212', muted: '#5a5a5a', rule: '#dcdcdc' },
  dark: { bg: '#121212', ink: '#e6e6e6', muted: '#a8a8a8', rule: '#333333' },
  tint: { bg: '#f4ecd8', ink: '#3b2f1e', muted: '#6b5a41', rule: '#d8c9a8' },
};

export function loadStoryArticle(story: string, key: string): StoryArticle | null {
  try {
    const raw = JSON.parse(
      readFileSync(
        join(process.cwd(), 'tests', 'fixtures', 'corpus', 'stories', `${story}.json`),
        'utf8',
      ),
    ) as Story;
    return raw.articles[key] ?? null;
  } catch {
    return null;
  }
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A page with a header, a headline, a byline and the article column, centred at 680 px. */
export function renderStoryPage(a: StoryArticle, theme: PageTheme = 'light'): string {
  const t = THEMES[theme];
  const body = a.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.title)} - ${esc(a.siteName)}</title>
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(a.siteName)}">
<meta property="og:title" content="${esc(a.title)}">
<style>
  html,body{margin:0;background:${t.bg};color:${t.ink}}
  body{font-family:Georgia,'Times New Roman',serif;min-height:100vh}
  .masthead{border-bottom:1px solid ${t.rule};padding:16px 24px;font:700 22px/1 Georgia,serif;letter-spacing:.01em}
  .masthead span{font:400 13px/1 Arial,sans-serif;color:${t.muted};margin-left:16px}
  main{max-width:680px;margin:0 auto;padding:32px 24px 160px}
  h1{font-size:34px;line-height:1.15;margin:0 0 12px;font-weight:700}
  .by{font:400 13px/1.4 Arial,sans-serif;color:${t.muted};margin:0 0 28px}
  main p{font-size:19px;line-height:1.55;margin:0 0 20px}
  main p.by{font-size:13px;margin:0 0 28px}
</style>
</head>
<body>
<div class="masthead">${esc(a.siteName)}<span>Fixture story</span></div>
<main>
<article>
<h1>${esc(a.title)}</h1>
<p class="by">By the newsroom. Fixture story with invented outlets.</p>
${body}
</article>
</main>
</body>
</html>`;
}

/**
 * An infinite-scroll page (AC3.2): article A on load; `window.__loadNext()` swaps the URL with
 * history.pushState and appends article B to the same <main>, as feed-style sites do.
 */
export function renderInfinitePage(a: StoryArticle, b: StoryArticle, theme: PageTheme): string {
  const html = renderStoryPage(a, theme);
  const block = (x: StoryArticle): string =>
    `<h1>${esc(x.title)}</h1><p class="by">By the newsroom. Fixture story with invented outlets.</p>${x.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}`;
  const script = `<script>window.__loadNext=function(){history.pushState({},'','/next-article.html');var el=document.createElement('article');el.innerHTML=${JSON.stringify(block(b))};document.querySelector('main').append(el);};</script>`;
  return html.replace('</body>', `${script}</body>`);
}
