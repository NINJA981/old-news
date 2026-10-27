/**
 * PWA (Stage 4): installability criteria, the service worker, and offline behaviour. Chromium's
 * install prompt needs a real user gesture and cannot be driven headless, so installability is
 * asserted by checking each criterion the browser checks: a linked manifest with name, id,
 * start_url inside scope, standalone display, 192 and 512 px PNG icons that really load at those
 * sizes, a maskable icon, and an active service worker that controls the page.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

interface Manifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}

test.describe('installability', () => {
  test('the app links a complete manifest and every icon loads at its declared size', async ({
    page,
    request,
  }) => {
    await page.goto('/app/');
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    expect(href).toBe('/app/manifest.webmanifest');
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/json|manifest/);
    const m = (await res.json()) as Manifest;

    expect(m.name.length).toBeGreaterThan(0);
    expect(m.short_name.length).toBeGreaterThan(0);
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(m.display);
    // start_url and id sit inside the scope, and the scope is the app's own path.
    expect(m.scope).toBe('/app/');
    expect(m.start_url.startsWith(m.scope)).toBe(true);
    expect(m.id.startsWith('/app')).toBe(true);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);

    const sizes = m.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of m.icons) {
      const r = await request.get(icon.src);
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()['content-type'], icon.src).toBe(icon.type);
      // PNG IHDR: width and height are big-endian 32-bit integers at bytes 16 and 20.
      const body = await r.body();
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(body.readUInt32BE(16), `${icon.src} width`).toBe(w);
      expect(body.readUInt32BE(20), `${icon.src} height`).toBe(h);
    }
    // The start_url itself answers 200 as HTML.
    const start = await request.get(m.start_url);
    expect(start.status()).toBe(200);
    expect(start.headers()['content-type']).toMatch(/html/);
  });

  test('iOS and theme metadata are present', async ({ page }) => {
    await page.goto('/app/');
    await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', /png$/);
    await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute(
      'content',
      'yes',
    );
    await expect(page.locator('meta[name=theme-color]').first()).toHaveAttribute('content', /^#/);
    await expect(page.locator('meta[name=viewport]')).toHaveAttribute(
      'content',
      /width=device-width/,
    );
    const apple = await page.request.get('/apple-touch-icon.png');
    expect(apple.status()).toBe(200);
  });
});

test.describe('service worker', () => {
  test('registers for /app/ only, activates, and controls the page after one reload', async ({
    page,
  }) => {
    await page.goto('/app/');
    const reg = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      const worker = r.active;
      // `ready` resolves while the worker may still be "activating"; wait for the final state.
      if (worker && worker.state !== 'activated') {
        await new Promise<void>((done) =>
          worker.addEventListener('statechange', () => worker.state === 'activated' && done()),
        );
      }
      return { scope: new URL(r.scope).pathname, active: worker?.state ?? null };
    });
    expect(reg.scope).toBe('/app/');
    expect(reg.active).toBe('activated');
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ''))
      .toMatch(/\/app\/sw\.js$/);

    // The landing page is outside the scope: no worker controls it.
    await page.goto('/');
    expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
  });

  test('precaches the shell: every precached URL exists in the build and is in the cache', async ({
    page,
  }) => {
    await page.goto('/app/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const src = readFileSync(join(process.cwd(), 'dist', 'app', 'sw.js'), 'utf8');
    const list = /const PRECACHE = (\[[^\]]*\]);/.exec(src);
    expect(list, 'PRECACHE list in dist/app/sw.js').not.toBeNull();
    const urls = JSON.parse(list![1]!) as string[];
    expect(urls.length).toBeGreaterThan(5);
    for (const u of urls) {
      const file = u === '/app/' ? join('dist', 'app', 'index.html') : join('dist', u);
      expect(existsSync(join(process.cwd(), file)), u).toBe(true);
    }
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const shell = keys.find((k) => k.startsWith('on-shell-'));
      if (!shell) return [];
      return (await (await caches.open(shell)).keys()).map((r) => new URL(r.url).pathname);
    });
    for (const u of urls) expect(cached, u).toContain(u);
  });

  test('never answers for another origin and ignores non-GET requests', async ({ page }) => {
    await page.goto('/app/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    const src = readFileSync(join(process.cwd(), 'dist', 'app', 'sw.js'), 'utf8');
    expect(src).toMatch(/req\.method !== 'GET'/);
    expect(src).toMatch(/url\.origin !== self\.location\.origin/);
    // No code path in the worker can make a request to a fixed foreign URL.
    expect(src).not.toMatch(/https?:\/\/(?!localhost)/);
  });
});

test.describe('offline', () => {
  test('the shell, the sample story and the stories view all load with the network off', async ({
    page,
    context,
  }) => {
    await page.goto('/app/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await context.setOffline(true);
    // A cold navigation to the start_url and a deep link under the scope both fall back to the shell.
    for (const url of ['/app/', '/app/#/stories', '/app/#/settings']) {
      await page.goto(url);
      await expect(page.locator('.app')).toBeVisible();
      await expect(
        page.getByText('Runs entirely in your browser. Nothing is uploaded.').first(),
      ).toBeVisible();
    }
    await context.setOffline(false);
  });
});
