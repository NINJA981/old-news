/**
 * Launch images from the real built extension on fixture stories with invented outlets:
 * three 1280x800 store screenshots, a 1280x640 social preview, and the frames of the README GIF
 * (the playground's deterministic dissolve). Gated by OLD_NEWS_LAUNCH=1 (`pnpm launch-shots`);
 * the GIF itself is encoded by scripts/launch-gif.sh.
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { registerContentScript, remember, waitForOverlay } from './helpers';

const OUT = join(process.cwd(), 'docs', 'launch');
const FRAMES = join(process.cwd(), 'test-results', 'launch-frames');
const STORE = { width: 1280, height: 800 };

test.skip(process.env['OLD_NEWS_LAUNCH'] !== '1', 'launch images run with OLD_NEWS_LAUNCH=1');
test.setTimeout(600_000);

async function setSettings(worker: Worker, patch: Record<string, unknown>): Promise<void> {
  await worker.evaluate(async (p) => {
    const got = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      settings: { ...(got['settings'] as object | undefined), ...p },
    });
  }, patch);
}

async function openStory(page: Page, siteUrl: string, theme: 'light' | 'dark'): Promise<void> {
  await page.setViewportSize(STORE);
  await page.goto(`${siteUrl}/story/harrow-bridge/morrow.html?theme=${theme}`);
  await page.bringToFront();
  await waitForOverlay(page);
  await page.waitForTimeout(2200);
}

function dataUrl(file: string, type: string): string {
  return `data:${type};base64,${readFileSync(file).toString('base64')}`;
}

test('store screenshots, social preview and GIF frames', async ({
  context,
  worker,
  siteUrl,
  openExtensionPage,
}) => {
  mkdirSync(OUT, { recursive: true });
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  await registerContentScript(worker);
  await setSettings(worker, { onboardingDone: true, theme: 'dark' });

  // ---- README GIF frames: the playground dissolve, before anything is remembered ------------------
  {
    const pg = await openExtensionPage('app.html?capture#/playground');
    await pg.setViewportSize(STORE);
    await expect
      .poll(() => pg.evaluate(() => typeof window.__frame), { timeout: 120_000 })
      .toBe('function');
    await pg.waitForTimeout(800);
    let i = 0;
    for (let t = 0; t <= 1800; t += 50) {
      await pg.evaluate((ms) => window.__frame?.(ms, 1000), t);
      await pg.waitForTimeout(40);
      await pg.screenshot({ path: join(FRAMES, `f${String(i++).padStart(3, '0')}.png`) });
    }
    await pg.close();
  }

  // ---- Memory: two earlier articles on the bridge story (install-time ingest path) ---------------
  {
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'harrow-bridge', ['wire', 'calder']);
    await ext.close();
  }

  // ---- 1. The third tab, light page: fades, tags, drift chip, pill --------------------------------
  {
    const page = await context.newPage();
    await openStory(page, siteUrl, 'light');
    await page.screenshot({ path: join(OUT, 'store-1-third-tab-light.png') });
    await page.close();
  }

  // ---- 2. Dark page with the hover card open on a provenance tag --------------------------------
  {
    const page = await context.newPage();
    await openStory(page, siteUrl, 'dark');
    await page.locator('.tag.on').first().hover();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, 'store-2-hover-card-dark.png') });
    await page.close();
  }

  // ---- 3. App page, Drift: every changed figure, newest first ------------------------------------
  {
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'harrow-bridge', ['morrow']);
    await remember(ext, 'port-alder-fire', ['wire', 'calder', 'morrow', 'day2']);
    await ext.close();
    const app = await openExtensionPage('app.html#/drift');
    await app.setViewportSize(STORE);
    await app.waitForTimeout(1200);
    await app.screenshot({ path: join(OUT, 'store-3-drift-dark.png') });
    await app.close();
  }

  // ---- Social preview: the real store screenshot 1, set beside the name ----------------------------
  {
    const shot = dataUrl(join(OUT, 'store-1-third-tab-light.png'), 'image/png');
    const serif = dataUrl(
      join(process.cwd(), 'public', 'fonts', 'newsreader-opsz-normal.woff2'),
      'font/woff2',
    );
    const sans = dataUrl(
      join(process.cwd(), 'public', 'fonts', 'hanken-grotesk-wght-normal.woff2'),
      'font/woff2',
    );
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 640 });
    // Colours are DESIGN.md dark tokens: bg #110e0b, text #ece7df, muted #c3bdb4.
    await page.setContent(`<!doctype html><html><head><style>
      @font-face { font-family: N; src: url(${serif}) format('woff2'); font-weight: 200 800; }
      @font-face { font-family: H; src: url(${sans}) format('woff2'); font-weight: 100 900; }
      html, body { margin: 0; width: 1280px; height: 640px; background: #110e0b; overflow: hidden; }
      .wrap { display: grid; grid-template-columns: 520px 1fr; height: 100%; }
      .text { padding: 72px 40px 64px 72px; display: flex; flex-direction: column; justify-content: space-between; }
      h1 { font: 500 76px/0.95 N, serif; letter-spacing: -0.03em; color: #ece7df; margin: 0 0 28px; }
      p { font: 400 27px/1.35 H, sans-serif; color: #ece7df; margin: 0; }
      p .dim { color: #ece7df; opacity: 0.42; }
      small { font: 500 17px/1.4 H, sans-serif; color: #c3bdb4; letter-spacing: 0.01em; }
      .shot { position: relative; overflow: hidden; margin-top: 56px; border-top-left-radius: 14px; background: #fff; }
      .shot img { position: absolute; left: -200px; top: -50px; width: 1120px; }
    </style></head><body><div class="wrap">
      <div class="text"><div><h1>Old News</h1>
        <p><span class="dim">Fades what you already read.</span><br>Lights up what changed.</p></div>
        <small>Browser extension &middot; on-device &middot; no network &middot; MIT</small></div>
      <div class="shot"><img src="${shot}" alt=""></div>
    </div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, 'social-preview-1280x640.png') });
    await page.close();
  }
});
