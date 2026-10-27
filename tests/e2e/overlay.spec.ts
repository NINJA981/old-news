/**
 * Overlay and surface e2e (Stage 3a), with the real model. The e2e build opens the overlay's
 * shadow root (wxt.config.ts `__OLD_NEWS_E2E__`) so tests can read it; releases keep it closed.
 * Covers AC2.2, 3.1, 3.2, 8.2, 9.1, 10.1, 11.1, 11.2, 12.1, 13.1, 14.1, 15.1, 16.2, 17.2, 17.3, 18.1.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  badgeFor,
  registerContentScript,
  remember,
  send,
  summaryFor,
  waitForOverlay,
} from './helpers';

const DAY2 = 'story/port-alder-fire/day2.html';

async function openStory(page: Page, siteUrl: string, path = DAY2, theme = 'light'): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${siteUrl}/${path}?theme=${theme}`);
  await page.bringToFront();
}

const opacityOf = (page: Page, text: string) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll('p')].find((p) => p.textContent?.includes(t));
    return el ? Number(getComputedStyle(el).opacity) : null;
  }, text);

test.describe('day-2 page (signature moment end state)', () => {
  test('fades what was read, keeps changed facts lit with a chip, counts and badges the rest (AC8.2, 9.1, 10.1, 11.1, 11.2)', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
    requests,
  }) => {
    await registerContentScript(worker);
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'port-alder-fire', ['wire', 'calder', 'morrow']);

    const page = await context.newPage();
    await openStory(page, siteUrl);
    const before = await page.evaluate(() => document.querySelectorAll('main p').length);
    await waitForOverlay(page);
    await page.waitForTimeout(2200);

    // AC11.2: the pill copy; AC11.1: the badge equals the lit count.
    const status = (await summaryFor(worker, 'day2.html'))?.status as Record<string, number>;
    const lit = status['new']! + status['changed']!;
    await expect(page.locator('.pill.on .sr')).toHaveText(
      `Only ${lit} of ${status['total']} paragraphs are new to you`,
    );
    expect(await badgeFor(worker, 'day2.html')).toBe(String(lit));
    expect(status['changed']).toBeGreaterThan(0);

    // AC8.2: nothing removed or hidden.
    const after = await page.evaluate(() => ({
      count: document.querySelectorAll('main p').length,
      hidden: [...document.querySelectorAll('main p')].filter(
        (p) => getComputedStyle(p).display === 'none',
      ).length,
    }));
    expect(after).toEqual({ count: before, hidden: 0 });

    // A seen paragraph is faded; the changed one stays at full ink.
    expect(await opacityOf(page, 'At least 40 firefighters')).toBeLessThan(1);
    expect(await opacityOf(page, 'Harbour Road and Quay Lane')).toBe(1);

    // AC10.1: the chip text is `{before} → {after} · {outlet} said {before}, {relative time}`.
    const chips = await page.locator('.chip.on').allTextContents();
    expect(chips.length).toBeGreaterThan(0);
    for (const t of chips) {
      expect(t.replace(/\u00a0/g, ' ')).toMatch(
        /^(.+) → (.+) · Fenwick Wire said \1, (just now|\d+ min ago)$/,
      );
    }

    // AC9.1: focusing a tag opens the hover card within 150 ms, and it offers the original.
    const tag = page.locator('.tag.on').first();
    await tag.focus();
    await expect(page.locator('.card.open')).toBeVisible({ timeout: 150 });
    await expect(page.locator('.card.open')).toContainText('Fenwick Wire');
    const link = page.locator('.card.open a.btn');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('href', /^https:\/\/fenwick-wire\.example\//);

    // "Not old news" restores full ink, counts the paragraph as new, and is remembered.
    const fadedText = await tag.evaluate((el) => el.getAttribute('aria-label') ?? '');
    expect(fadedText).toContain('Fenwick Wire');
    await page.locator('.card.open button', { hasText: 'Not old news' }).click();
    await expect(page.locator('.card.open button', { hasText: 'Marked as new' })).toBeVisible();
    await expect(page.locator('.pill.on .sr')).toHaveText(
      `Only ${lit + 1} of ${status['total']} paragraphs are new to you`,
    );
    await page.reload();
    await waitForOverlay(page);
    await expect(page.locator('.pill.on .sr')).toHaveText(
      `Only ${lit + 1} of ${status['total']} paragraphs are new to you`,
    );

    expect(requests.filter((r) => r.external)).toEqual([]);
  });

  test('N folds old paragraphs instantly and back; J and K move between lit ones (AC12.1)', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
  }) => {
    await registerContentScript(worker);
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'port-alder-fire', ['wire', 'calder', 'morrow']);
    const page = await context.newPage();
    await openStory(page, siteUrl);
    await waitForOverlay(page);
    await page.waitForTimeout(2200);

    const h = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('main p')]
          .filter((p) => p.textContent && p.textContent.length > 60)
          .map((p) => (p as HTMLElement).offsetHeight),
      );
    const open = await h();
    await page.keyboard.press('n');
    const folded = await h();
    expect(folded.some((x) => x === 1)).toBe(true);
    expect(Math.max(...folded)).toBeLessThanOrEqual(Math.max(...open));
    await expect(page.locator('.fold').first()).toHaveAttribute(
      'aria-label',
      /^Show \d+ old paragraphs?$/,
    );
    await page.keyboard.press('n');
    expect(await h()).toEqual(open);

    const activeText = () =>
      page.evaluate(() => document.activeElement?.textContent?.slice(0, 20) ?? '');
    await page.keyboard.press('j');
    const first = await activeText();
    await page.keyboard.press('j');
    const second = await activeText();
    expect(second).not.toBe(first);
    await page.keyboard.press('k');
    expect(await activeText()).toBe(first);
    await expect(page.locator('.marker')).toHaveCount(1);
  });

  test('a page with nothing matched has no badge and no pill (AC11.1)', async ({
    context,
    worker,
    siteUrl,
  }) => {
    await registerContentScript(worker);
    const page = await context.newPage();
    await openStory(page, siteUrl);
    await expect
      .poll(async () => (await summaryFor(worker, 'day2.html'))?.status['status'])
      .toBe('result');
    await page.waitForTimeout(800);
    expect(await badgeFor(worker, 'day2.html')).toBe('');
    await expect(page.locator('.pill.on')).toHaveCount(0);
  });
});

test.describe('live blogs and infinite scroll', () => {
  test('a post appended to a live blog is matched within 1 s (AC3.1)', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
  }) => {
    await registerContentScript(worker);
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'kessel-valley-rail', ['wire']);
    const wire = JSON.parse(
      readFileSync('tests/fixtures/corpus/stories/kessel-valley-rail.json', 'utf8'),
    ).articles.wire.paragraphs[0] as string;

    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${siteUrl}/liveblog.html`);
    await page.bringToFront();
    await expect
      .poll(async () => (await summaryFor(worker, 'liveblog.html'))?.status['status'])
      .toBe('result');
    await page.waitForTimeout(1500);

    const t0 = Date.now();
    await page.evaluate((text) => {
      const post = document.createElement('article');
      post.setAttribute('itemprop', 'liveBlogUpdate');
      post.setAttribute('data-post-id', 'p6');
      post.innerHTML = `<header><time datetime="2026-10-20T12:10:00Z">12:10</time> <strong>Fenwick Wire</strong></header><p>${text}</p>`;
      document.querySelector('.live-feed')?.prepend(post);
    }, wire);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Number(getComputedStyle(document.querySelector('[data-post-id="p6"]')!).opacity),
          ),
        { timeout: 3000 },
      )
      .toBeLessThan(1);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  test('infinite scroll: the appended article is its own article with its own counts (AC3.2)', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
  }) => {
    await registerContentScript(worker);
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'kessel-valley-rail', ['wire']);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${siteUrl}/infinite/port-alder-fire/wire/kessel-valley-rail/gazette.html`);
    await page.bringToFront();
    await expect
      .poll(async () => (await summaryFor(worker, 'infinite'))?.status['status'])
      .toBe('result');
    const first = (await summaryFor(worker, 'infinite'))?.status as Record<string, number>;
    expect(first['seen']).toBe(0);

    await page.evaluate(() => (window as unknown as { __loadNext: () => void }).__loadNext());
    // The pill and badge follow the article in view: scroll the appended one into view.
    await page.evaluate(() =>
      document.querySelectorAll('main article')[1]?.scrollIntoView({ block: 'start' }),
    );
    await expect
      .poll(
        async () =>
          (
            (await summaryFor(worker, 'next-article'))?.status as Record<string, number> | undefined
          )?.['seen'] ?? 0,
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    const second = (await summaryFor(worker, 'next-article'))?.status as Record<string, number>;
    expect(second['total']).toBe(6);
    // Its own paragraphs are faded, and only those.
    const faded = await page.evaluate(
      () =>
        [...(document.querySelectorAll('main article')[1]?.querySelectorAll('p') ?? [])].filter(
          (p) => Number(getComputedStyle(p).opacity) < 1,
        ).length,
    );
    expect(faded).toBe(second['seen']! + second['similar']!);
    const firstFaded = await page.evaluate(
      () =>
        [...(document.querySelectorAll('main article')[0]?.querySelectorAll('p') ?? [])].filter(
          (p) => Number(getComputedStyle(p).opacity) < 1,
        ).length,
    );
    expect(firstFaded).toBe(0);
  });
});

test.describe('pause, popup and app', () => {
  test('a paused origin gets no processing; resuming takes effect on the next load (AC17.3)', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
  }) => {
    await registerContentScript(worker);
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'port-alder-fire', ['wire', 'calder', 'morrow']);
    await worker.evaluate(
      (origin) => chrome.storage.local.set({ settings: { pausedOrigins: [origin] } }),
      siteUrl,
    );
    const page = await context.newPage();
    await openStory(page, siteUrl);
    await expect
      .poll(async () => (await summaryFor(worker, 'day2.html'))?.status['status'])
      .toBe('paused');
    expect(await page.locator('.pill').count()).toBe(0);
    expect(await opacityOf(page, 'At least 40 firefighters')).toBe(1);
    expect(await badgeFor(worker, 'day2.html')).toBe('');

    await worker.evaluate(() => chrome.storage.local.set({ settings: { pausedOrigins: [] } }));
    await page.reload();
    await waitForOverlay(page);
    // The pill appears as the dissolve starts; the fade lands as it plays, so poll for it.
    await expect.poll(() => opacityOf(page, 'At least 40 firefighters')).toBeLessThan(1);
  });

  test('popup: story card and Drift rows (AC14.1, AC15.1), and the unmapped state (AC2.2)', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
  }) => {
    await registerContentScript(worker);
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'port-alder-fire', ['wire', 'calder', 'morrow']);
    const page = await context.newPage();
    await openStory(page, siteUrl);
    await waitForOverlay(page);
    // Drift is recorded when the reader reads the changed paragraphs: remember day 2 as read.
    await remember(ext, 'port-alder-fire', ['day2']);
    const id = await worker.evaluate(
      async () => (await chrome.tabs.query({})).find((t) => t.url?.includes('day2'))?.id,
    );

    const popup = await openExtensionPage(`popup.html?tab=${id}`);
    await popup.setViewportSize({ width: 380, height: 560 });
    await expect(popup.getByTestId('status')).toContainText('of');
    await expect(popup.getByRole('tab', { name: 'This story' })).toBeVisible();
    await popup.getByRole('tab', { name: 'Drift' }).click();
    const rows = await send<{ id: string }[]>(ext, { type: 'drift/overview' });
    expect(rows.data.length).toBeGreaterThan(0);
    await expect(popup.locator('[role=tabpanel]:visible li')).toHaveCount(rows.data.length);

    const unmapped = await context.newPage();
    await unmapped.goto(`${siteUrl}/ad-split.html`);
    await expect
      .poll(async () => (await summaryFor(worker, 'ad-split'))?.status['status'])
      .toBe('unmapped');
    const id2 = await worker.evaluate(
      async () => (await chrome.tabs.query({})).find((t) => t.url?.includes('ad-split'))?.id,
    );
    const p2 = await openExtensionPage(`popup.html?tab=${id2}`);
    await expect(p2.getByTestId('status')).toContainText(
      "couldn't line up this page's paragraphs".replace("'", '’').replace('’', "'"),
    );
  });

  test('Forget everything leaves every store empty and resets the meter (AC17.2)', async ({
    openExtensionPage,
  }) => {
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'port-alder-fire', ['wire', 'calder']);
    const before = await send<{ paragraphs: number }>(ext, { type: 'memory/stats' });
    expect(before.data.paragraphs).toBeGreaterThan(0);
    await ext.evaluate(() => (window.location.hash = '#/memory'));
    // The app refetches when it regains focus; wait for the live numbers, not the cached ones.
    await ext.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(ext.getByText('Paragraphs remembered', { exact: true })).toBeVisible();
    await ext.getByRole('button', { name: 'Forget everything' }).first().click();
    await expect(ext.getByRole('alertdialog')).toContainText(
      "This can't be undone".replace("'", '’'),
    );
    await ext.getByRole('alertdialog').getByRole('button', { name: 'Forget everything' }).click();
    await expect(ext.getByText('Memory is empty.')).toBeVisible();
    const after = await send<Record<string, number>>(ext, { type: 'memory/stats' });
    expect(after.data).toMatchObject({ paragraphs: 0, articles: 0, stories: 0, drift: 0 });
  });

  test('receipt: Save image downloads a PNG with no external request (AC16.2)', async ({
    openExtensionPage,
    requests,
  }) => {
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'port-alder-fire', ['wire', 'calder', 'morrow']);
    await ext.evaluate(() => (window.location.hash = '#/receipt'));
    await expect(ext.getByRole('button', { name: 'Save image' })).toBeVisible();
    const download = ext.waitForEvent('download');
    await ext.getByRole('button', { name: 'Save image' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^old-news-receipt-\d{4}-W\d{2}\.png$/);
    const path = await file.path();
    expect(readFileSync(path).subarray(1, 4).toString()).toBe('PNG');
    expect(requests.filter((r) => r.external)).toEqual([]);
  });
});

test.describe('onboarding and playground', () => {
  test('lists exactly the article tabs and remembers them with no network (AC13.1)', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
    requests,
  }) => {
    await registerContentScript(worker);
    for (const path of [
      'story/port-alder-fire/wire.html',
      'story/port-alder-fire/calder.html',
      'story/kessel-valley-rail/wire.html',
      'search-results.html',
    ]) {
      const p = await context.newPage();
      await p.goto(`${siteUrl}/${path}`);
    }
    const ob = await openExtensionPage('onboarding.html#/tabs');
    await expect(ob.locator('ul li label')).toHaveCount(3, { timeout: 30_000 });
    await ob.getByRole('button', { name: /Remember these 3 tabs/ }).click();
    await expect(ob.getByText(/Remembered \d+ paragraphs/)).toHaveCount(3, { timeout: 60_000 });
    const stats = await send<{ paragraphs: number }>(ob, { type: 'memory/stats' });
    expect(stats.data.paragraphs).toBeGreaterThan(10);
    expect(requests.filter((r) => r.external)).toEqual([]);
  });

  test('playground reproduces the signature moment; tiers equal the corpus labels (AC18.1)', async ({
    openExtensionPage,
    requests,
  }) => {
    const pg = await openExtensionPage('app.html#/playground');
    await pg.setViewportSize({ width: 1440, height: 900 });
    await pg.getByRole('button', { name: 'Read tab 1' }).click();
    await expect(pg.getByRole('button', { name: 'Read tab 2' })).toBeVisible({ timeout: 90_000 });
    await pg.getByRole('button', { name: 'Read tab 2' }).click();
    await expect(pg.getByRole('button', { name: 'Open tab 3' })).toBeVisible({ timeout: 90_000 });
    await pg.getByRole('button', { name: 'Open tab 3' }).click();
    await expect(pg.getByText('Every tier matches the corpus label.')).toBeVisible({
      timeout: 90_000,
    });
    await expect(pg.locator('.pill.on')).toBeVisible();
    expect(requests.filter((r) => r.external)).toEqual([]);
  });
});
