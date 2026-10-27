/**
 * Screenshot pass (DESIGN_BIBLE §9.1): every surface at 375, 768 and 1440 in light and dark, the
 * popup at its real size in every state, the overlay on light, dark and tinted pages, the dissolve
 * as a frame strip, and reduced motion. Gated by OLD_NEWS_SHOTS=1 (`pnpm screenshots`); the PNGs
 * land in docs/screenshots/ and are looked at, not just generated.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { registerContentScript, remember, send, summaryFor, waitForOverlay } from './helpers';

const OUT = join(process.cwd(), 'docs', 'screenshots');
const SIZES = [
  { w: 375, h: 812 },
  { w: 768, h: 1024 },
  { w: 1440, h: 900 },
] as const;
const THEMES = ['light', 'dark'] as const;

test.skip(process.env['OLD_NEWS_SHOTS'] !== '1', 'screenshots run with OLD_NEWS_SHOTS=1');
test.setTimeout(900_000);
// Each group runs in its own browser and seeds its own memory. A renderer that runs out of memory on
// a busy machine fails only its group, and the group is retried.
test.describe.configure({ retries: 2 });

async function seed(
  openExtensionPage: (path: string) => Promise<Page>,
  day2 = false,
): Promise<void> {
  const ext = await openExtensionPage('app.html');
  await remember(ext, 'port-alder-fire', ['wire', 'calder', 'morrow']);
  await remember(ext, 'harrow-bridge', ['wire', 'calder']);
  if (day2) {
    await remember(ext, 'harrow-bridge', ['morrow']);
    await remember(ext, 'port-alder-fire', ['day2']);
  }
  await ext.close();
}

async function setSettings(worker: Worker, patch: Record<string, unknown>): Promise<void> {
  await worker.evaluate(async (p) => {
    const got = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      settings: { ...(got['settings'] as object | undefined), ...p },
    });
  }, patch);
}

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
}

async function tabIdFor(worker: Worker, part: string): Promise<number> {
  const id = await worker.evaluate(async (p) => {
    const tabs = (await chrome.tabs.query({})).filter((t) => t.url?.includes(p));
    return tabs[0]?.id ?? -1;
  }, part);
  expect(id).toBeGreaterThan(-1);
  return id;
}

async function setSummary(worker: Worker, tabId: number, url: string, status: unknown) {
  await worker.evaluate(
    async ([id, u, st]) => {
      await chrome.storage.session.set({
        [`summary:${id}`]: { url: u, status: st, at: Date.now() },
      });
    },
    [tabId, url, status] as const,
  );
}

test('first-run popup, overlay on three page themes and overlay states', async ({
  context,
  worker,
  siteUrl,
  openExtensionPage,
}) => {
  mkdirSync(OUT, { recursive: true });
  await registerContentScript(worker);

  // ---- Popup, first run (empty memory) -------------------------------------------------------
  for (const theme of THEMES) {
    await setSettings(worker, { theme, onboardingDone: true });
    const popup = await openExtensionPage('popup.html');
    await popup.setViewportSize({ width: 380, height: 560 });
    await expect(popup.getByRole('heading', { name: 'Nothing remembered yet.' })).toBeVisible();
    await shot(popup, `popup-first-run-${theme}`);
    await popup.close();
  }

  await seed(openExtensionPage);

  // ---- Overlay on light, dark and tinted pages at three widths -------------------------------------
  const pageThemes = [
    ['light', 'light'],
    ['dark', 'dark'],
    ['tint', 'tint'],
  ] as const;
  for (const [pageTheme] of pageThemes) {
    for (const size of SIZES) {
      if (pageTheme === 'tint' && size.w !== 1440) continue;
      const page = await context.newPage();
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.goto(`${siteUrl}/story/harrow-bridge/morrow.html?theme=${pageTheme}`);
      await page.bringToFront();
      await waitForOverlay(page);
      await page.waitForTimeout(2200);
      await shot(page, `overlay-${pageTheme}-${size.w}`);
      await page.close();
    }
  }

  // ---- Overlay states: hover card, fold, J marker, tray open, reduced motion ----------------------
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${siteUrl}/story/harrow-bridge/morrow.html?theme=light`);
    await page.bringToFront();
    await waitForOverlay(page);
    await page.waitForTimeout(2200);
    const tag = page.locator('.tag.on').first();
    await tag.hover();
    await page.waitForTimeout(700);
    await shot(page, 'overlay-hovercard-light-1440');
    await page.mouse.move(5, 5);
    await page.locator('.tray .t-head').click();
    await page.waitForTimeout(500);
    await shot(page, 'overlay-tray-light-1440');
    await page.keyboard.press('Escape');
    await page.keyboard.press('j');
    await page.waitForTimeout(150);
    await shot(page, 'overlay-jk-light-1440');
    await page.keyboard.press('n');
    await page.waitForTimeout(200);
    await shot(page, 'overlay-fold-light-1440');
    await page.close();
  }
  {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${siteUrl}/story/harrow-bridge/morrow.html?theme=light`);
    await page.bringToFront();
    await waitForOverlay(page);
    await page.waitForTimeout(500);
    await shot(page, 'overlay-reduced-motion-light-1440');
    await page.close();
  }
});

test('popup states at real size', async ({ context, worker, siteUrl, openExtensionPage }) => {
  await registerContentScript(worker);
  await setSettings(worker, { onboardingDone: true });
  await seed(openExtensionPage);
  // ---- Popup states, real size, light and dark -----------------------------------------------------
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const url = `${siteUrl}/story/harrow-bridge/morrow.html?theme=light`;
  await page.goto(url);
  await page.bringToFront();
  await waitForOverlay(page);
  await expect
    .poll(async () => (await summaryFor(worker, 'morrow.html'))?.status['status'])
    .toBe('result');
  const id = await tabIdFor(worker, 'morrow.html');
  const real = (await summaryFor(worker, 'morrow.html'))?.status;
  const states: [string, unknown][] = [
    ['mixed', real],
    [
      'all-new',
      {
        status: 'result',
        total: 23,
        new: 23,
        seen: 0,
        similar: 0,
        changed: 0,
        degraded: false,
        storyId: null,
        story: null,
      },
    ],
    ['analysing', { status: 'analysing', total: 23 }],
    ['error', { status: 'error', reason: 'The model file is missing' }],
    ['unmapped', { status: 'unmapped', reason: 'low-mapping' }],
    ['not-article', { status: 'not-article' }],
    ['non-english', { status: 'non-english' }],
    ['paused-site', { status: 'paused', scope: 'site' }],
    ['degraded', { ...(real as object), degraded: true }],
  ];
  for (const theme of THEMES) {
    await setSettings(worker, { theme, paused: false, pausedOrigins: [] });
    for (const [name, status] of states) {
      await setSummary(worker, id, url, status);
      if (name === 'paused-site') {
        await setSettings(worker, { pausedOrigins: [siteUrl] });
      }
      const popup = await openExtensionPage(`popup.html?tab=${id}`);
      await popup.setViewportSize({ width: 380, height: 560 });
      await popup.waitForTimeout(name === 'analysing' ? 600 : 250);
      await shot(popup, `popup-${name}-${theme}`);
      if (name === 'mixed') {
        await popup.getByRole('tab', { name: 'Drift' }).click();
        await popup.waitForTimeout(300);
        await shot(popup, `popup-drift-tab-${theme}`);
      }
      await popup.close();
      if (name === 'paused-site') await setSettings(worker, { pausedOrigins: [] });
    }
    await setSettings(worker, { paused: true });
    await setSummary(worker, id, url, real);
    const popup = await openExtensionPage(`popup.html?tab=${id}`);
    await popup.setViewportSize({ width: 380, height: 560 });
    await popup.waitForTimeout(250);
    await shot(popup, `popup-paused-global-${theme}`);
    await popup.close();
    await setSettings(worker, { paused: false });
  }
  await page.close();
});

test('app screens at three widths, component states, onboarding', async ({
  context,
  worker,
  siteUrl,
  openExtensionPage,
}) => {
  await registerContentScript(worker);
  await setSettings(worker, { onboardingDone: true });
  // Read the day-2 articles too, so Stories and Drift have a changed figure to show.
  await seed(openExtensionPage, true);
  // ---- App screens at three widths in both themes ------------------------------------------------
  const seeded = await openExtensionPage('app.html');
  const overview = await send<{ id: string }[]>(seeded, { type: 'stories/overview' });
  await seeded.close();
  const sid = encodeURIComponent(overview.data[0]?.id ?? '');
  const routes = [
    ['stories', 'stories'],
    ['stories-expanded', `stories?story=${sid}`],
    ['drift', 'drift'],
    ['receipt', 'receipt'],
    ['memory', 'memory'],
    ['settings', 'settings'],
  ] as const;
  for (const theme of THEMES) {
    await setSettings(worker, { theme });
    for (const size of SIZES) {
      const app = await openExtensionPage('app.html#/stories');
      await app.setViewportSize({ width: size.w, height: size.h });
      for (const [name, hash] of routes) {
        await app.evaluate((h) => (window.location.hash = `#/${h}`), hash);
        await app.waitForTimeout(700);
        await shot(app, `app-${name}-${theme}-${size.w}`, size.w === 375);
      }
      // Command palette.
      await app.evaluate(() => (window.location.hash = '#/stories'));
      await app.keyboard.press('Control+k');
      await app.waitForTimeout(400);
      await shot(app, `app-palette-${theme}-${size.w}`);
      await app.keyboard.press('Escape');
      await app.close();
    }
  }

  // ---- Component states (rest, hover, focus-visible, pressed, disabled, confirm) --------------------
  for (const theme of THEMES) {
    await setSettings(worker, { theme });
    const app = await openExtensionPage('app.html#/settings');
    await app.setViewportSize({ width: 1440, height: 900 });
    await app.waitForTimeout(700);
    const card = app.locator('section[aria-label="Reading"]');
    const clip = async (name: string): Promise<void> => {
      await card.screenshot({ path: join(OUT, `states-${name}-${theme}.png`) });
    };
    await clip('rest');
    await app.getByRole('radio', { name: 'Light', exact: true }).first().hover();
    await app.waitForTimeout(200);
    await clip('hover-segmented');
    await app.mouse.move(2, 2);
    await app.keyboard.press('Tab');
    for (let i = 0; i < 12; i++) {
      const onSwitch = await app.evaluate(
        () => document.activeElement?.getAttribute('role') === 'switch',
      );
      if (onSwitch) break;
      await app.keyboard.press('Tab');
    }
    await app.waitForTimeout(150);
    await clip('focus-visible-switch');
    const sw = app.getByRole('switch').first();
    const box = await sw.boundingBox();
    if (box) {
      await app.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await app.mouse.down();
      await app.waitForTimeout(150);
      await clip('pressed-switch');
      await app.mouse.up();
    }
    await app.close();

    const mem = await openExtensionPage('app.html#/memory');
    await mem.setViewportSize({ width: 1440, height: 900 });
    await mem.waitForTimeout(700);
    const forget = mem.locator('section[aria-labelledby="forget-h"]');
    await forget.screenshot({ path: join(OUT, `states-danger-rest-${theme}.png`) });
    await mem.getByRole('button', { name: 'Forget everything' }).first().hover();
    await mem.waitForTimeout(200);
    await forget.screenshot({ path: join(OUT, `states-danger-hover-${theme}.png`) });
    await mem.getByRole('button', { name: 'Forget everything' }).first().click();
    await mem.waitForTimeout(400);
    await forget.screenshot({ path: join(OUT, `states-danger-confirm-${theme}.png`) });
    await mem.close();

    const pg = await openExtensionPage('app.html#/playground');
    await pg.setViewportSize({ width: 1440, height: 900 });
    await pg.getByRole('button', { name: 'Read tab 1' }).click();
    await pg.waitForTimeout(500);
    await pg.screenshot({
      path: join(OUT, `states-loading-playground-${theme}.png`),
      clip: { x: 240, y: 0, width: 1000, height: 260 },
    });
    await pg.close();
  }

  // ---- Onboarding ---------------------------------------------------------------------------------------
  const a = await context.newPage();
  await a.goto(`${siteUrl}/story/port-alder-fire/wire.html`);
  const b = await context.newPage();
  await b.goto(`${siteUrl}/story/port-alder-fire/calder.html`);
  const c = await context.newPage();
  await c.goto(`${siteUrl}/search-results.html`);
  for (const theme of THEMES) {
    await setSettings(worker, { theme });
    for (const size of SIZES) {
      for (const step of ['allow', 'tabs', 'done']) {
        const ob = await openExtensionPage(`onboarding.html#/${step}`);
        await ob.setViewportSize({ width: size.w, height: size.h });
        await ob.waitForTimeout(step === 'tabs' ? 5000 : 500);
        await shot(ob, `onboarding-${step}-${theme}-${size.w}`, size.w === 375);
        await ob.close();
      }
    }
  }
});

// The playground runs its own engine and keeps nothing in memory, so its frame strips get a fresh
// browser: the long pass above holds many pages, and on a busy machine the renderer ran out of memory.
test('dissolve frame strips (normal and reduced motion) and the playground at three widths', async ({
  worker,
  openExtensionPage,
}) => {
  mkdirSync(join(OUT, 'dissolve'), { recursive: true });
  mkdirSync(join(OUT, 'dissolve-reduced'), { recursive: true });
  // ---- Playground, dissolve frame strip (deterministic) --------------------------------------------
  await setSettings(worker, { theme: 'dark' });
  {
    const pg = await openExtensionPage('app.html?capture#/playground');
    await pg.setViewportSize({ width: 1440, height: 900 });
    await expect
      .poll(() => pg.evaluate(() => typeof window.__frame), { timeout: 120_000 })
      .toBe('function');
    await pg.waitForTimeout(800);
    const times = [0, 60, 120, 180, 240, 300, 380, 440, 520, 600, 800, 1020, 1200, 1400, 1700];
    for (let i = 0; i < times.length; i++) {
      await pg.evaluate((t) => window.__frame?.(t, 1000), times[i] as number);
      await pg.waitForTimeout(60);
      await pg.screenshot({
        path: join(OUT, 'dissolve', `frame-${String(i).padStart(2, '0')}-${times[i]}ms.png`),
      });
    }
    await pg.close();
  }
  // Reduced motion: the same moment as one 150 ms fade, no pulse, final pill copy at once.
  {
    const pg = await openExtensionPage('app.html?capture#/playground');
    await pg.emulateMedia({ reducedMotion: 'reduce' });
    await pg.reload();
    await pg.setViewportSize({ width: 1440, height: 900 });
    await expect
      .poll(() => pg.evaluate(() => typeof window.__frame), { timeout: 120_000 })
      .toBe('function');
    await pg.waitForTimeout(800);
    const times = [0, 30, 60, 90, 120, 150, 300, 600, 1020, 1700];
    for (let i = 0; i < times.length; i++) {
      await pg.evaluate((t) => window.__frame?.(t, 1000), times[i] as number);
      await pg.waitForTimeout(60);
      await pg.screenshot({
        path: join(
          OUT,
          'dissolve-reduced',
          `frame-${String(i).padStart(2, '0')}-${times[i]}ms.png`,
        ),
      });
    }
    await pg.close();
  }
  await setSettings(worker, { theme: 'light' });
  for (const size of SIZES) {
    const pg = await openExtensionPage('app.html?capture#/playground');
    await pg.setViewportSize({ width: size.w, height: size.h });
    await expect
      .poll(() => pg.evaluate(() => typeof window.__frame), { timeout: 120_000 })
      .toBe('function');
    await pg.evaluate(() => window.__frame?.(1700, 1000));
    await pg.waitForTimeout(600);
    await shot(pg, `app-playground-light-${size.w}`);
    await pg.close();
  }
});
