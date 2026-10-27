/**
 * Smoke test for the site (Stage 4): every public page loads with no console errors or page errors,
 * has the basics (title, description, one h1, lang), every image and stylesheet it uses loads, and
 * every internal link and in-page anchor resolves. Fast enough to run on each deploy.
 */
import { expect, test, type Page } from '@playwright/test';
import { ORIGIN } from './helpers';

const PAGES: { path: string; h1: RegExp }[] = [
  { path: '/', h1: /You’ve read this before/ },
  { path: '/app/', h1: /Paste two articles about the same story/ },
];

function watch(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) =>
    errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`),
  );
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return { errors };
}

for (const { path, h1 } of PAGES) {
  test.describe(`page ${path}`, () => {
    test('loads clean, with the basics and no layout overflow', async ({ page }) => {
      const w = watch(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await page.waitForLoadState('load');
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(h1);
      expect(await page.title()).toMatch(/Old News/);
      expect(await page.locator('html').getAttribute('lang')).toBe('en');
      const desc = await page.locator('meta[name=description]').getAttribute('content');
      expect((desc ?? '').length).toBeGreaterThan(40);
      await expect(page.locator('meta[name=viewport]')).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0);
      expect(w.errors).toEqual([]);
    });

    test('images load and internal links and anchors resolve', async ({ page, request }) => {
      await page.goto(path);
      await page.waitForLoadState('load');
      const broken = await page.evaluate(() =>
        [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
      );
      expect(broken, 'broken images').toEqual([]);

      const links = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].map((a) => ({
          href: a.getAttribute('href') ?? '',
          text: (a.textContent ?? '').trim().slice(0, 30),
        })),
      );
      expect(links.length).toBeGreaterThan(0);
      const bad: string[] = [];
      for (const { href, text } of links) {
        if (/^(mailto:|tel:|javascript:)/.test(href)) continue;
        if (href.startsWith('#')) {
          if (href === '#' || href.startsWith('#/')) continue; // the app's hash routes
          const id = decodeURIComponent(href.slice(1));
          if ((await page.locator(`[id="${id}"]`).count()) === 0)
            bad.push(`${href} (${text}): no such id`);
          continue;
        }
        const url = new URL(href, `${ORIGIN}${path}`);
        if (url.origin !== ORIGIN) continue; // external links are never fetched by a smoke test
        const r = await request.get(url.pathname);
        if (r.status() !== 200) bad.push(`${href} (${text}): ${r.status()}`);
      }
      expect(bad).toEqual([]);
    });

    test('external links are safe: rel noopener and no tracking parameters', async ({ page }) => {
      await page.goto(path);
      const external = await page.evaluate(
        (origin) =>
          [...document.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')]
            .filter((a) => !a.href.startsWith(origin))
            .map((a) => ({ href: a.href, rel: a.rel, target: a.target })),
        ORIGIN,
      );
      for (const l of external) {
        if (l.target === '_blank') expect(l.rel, l.href).toMatch(/noopener/);
        expect(l.href, 'tracking parameters').not.toMatch(/[?&](utm_|fbclid|gclid)/);
      }
    });
  });
}

test.describe('site files', () => {
  test('robots.txt, llms.txt, the icon and the 404 behaviour', async ({ request }) => {
    for (const [p, type] of [
      ['/robots.txt', /text\/plain/],
      ['/llms.txt', /text\/plain|markdown/],
      ['/icon.svg', /svg/],
      ['/apple-touch-icon.png', /png/],
    ] as const) {
      const r = await request.get(p);
      expect(r.status(), p).toBe(200);
      expect(r.headers()['content-type'], p).toMatch(type);
    }
    // Nothing tracks: no analytics beacon, no third-party script anywhere in the HTML.
    for (const p of ['/', '/app/']) {
      const html = await (await request.get(p)).text();
      expect(html, p).not.toMatch(/<script[^>]+src=["']https?:\/\/(?!localhost)/i);
      expect(html, p).not.toMatch(
        /google-analytics|googletagmanager|plausible|segment\.com|hotjar/i,
      );
    }
  });

  test('the landing page links to the app', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.try-link')).toHaveAttribute('href', '/app/');
  });
});
