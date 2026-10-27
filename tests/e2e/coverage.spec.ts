/**
 * Stage 4 coverage e2e: the SPEC acceptance criteria that the Stage 2 and 3a suites did not reach
 * in a real browser. Covers AC1.1, AC1.2, AC2.1, AC2.2 (every layout fixture, with a
 * MutationObserver diff), AC5.1 (offscreen document lifecycle through the real idle alarm),
 * AC5.3 (model removed from the build), AC8.1 (measured contrast on light, dark and tinted pages)
 * and the input-focus guard of AC12.1.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { EXTENSION_DIR, expect, test } from './fixtures';
import {
  badgeFor,
  pageOf,
  paragraphsOf,
  registerContentScript,
  remember,
  send,
  story,
  summaryFor,
  waitForOverlay,
} from './helpers';

interface Expectation {
  status: 'mapped' | 'reject' | 'not-article' | 'non-english';
  kind?: string;
  total?: number;
}

const LAYOUT_DIR = join(process.cwd(), 'tests', 'fixtures', 'layouts');
const expectations = JSON.parse(
  readFileSync(join(LAYOUT_DIR, 'expectations.json'), 'utf8'),
) as Record<string, Expectation | string>;
const layoutFiles = Object.keys(expectations).filter((k) => !k.startsWith('_'));

const POPUP_STATUS: Record<Expectation['status'], string> = {
  mapped: 'result',
  reject: 'unmapped',
  'not-article': 'not-article',
  'non-english': 'non-english',
};

declare global {
  interface Window {
    __mutations?: number;
  }
}

test.describe('every layout fixture in the real browser (AC1.1, AC1.2, AC2.1, AC2.2)', () => {
  test('articles map; non-articles, French and unmappable pages get zero DOM mutations and no badge', async ({
    context,
    worker,
    siteUrl,
    requests,
  }) => {
    test.setTimeout(300_000);
    await registerContentScript(worker);
    // A MutationObserver on the whole document from document_start; the counter is reset once the
    // page has loaded, so only mutations made after the page settled (the extension's) count.
    await context.addInitScript(() => {
      window.__mutations = 0;
      new MutationObserver((records) => {
        window.__mutations = (window.__mutations ?? 0) + records.length;
      }).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      window.addEventListener('load', () => setTimeout(() => (window.__mutations = 0), 0));
    });

    const problems: string[] = [];
    for (const file of layoutFiles) {
      const want = expectations[file] as Expectation;
      const page = await context.newPage();
      await page.goto(`${siteUrl}/${file}`);
      await page.bringToFront();
      await expect
        .poll(async () => (await summaryFor(worker, file))?.status['status'], { timeout: 30_000 })
        .toBe(POPUP_STATUS[want.status]);
      await page.waitForTimeout(1500); // late mutations would land here
      const status = (await summaryFor(worker, file))?.status as Record<string, unknown>;
      const mutations = await page.evaluate(() => window.__mutations ?? -1);

      if (want.status === 'mapped') {
        // AC1.1 / AC2.1: classified as an article and every extracted paragraph was lined up.
        if (status['total'] !== want.total) {
          problems.push(`${file}: total ${String(status['total'])}, want ${want.total}`);
        }
        const hidden = await page.evaluate(
          () =>
            [...document.querySelectorAll('p')].filter(
              (p) => getComputedStyle(p).display === 'none',
            ).length,
        );
        if (hidden !== 0) problems.push(`${file}: ${hidden} paragraphs hidden (AC8.2)`);
      } else {
        // AC1.1 / AC1.2 / AC2.1: untouched, and no badge.
        if (mutations !== 0) problems.push(`${file}: ${mutations} DOM mutations, want 0`);
        const badge = await badgeFor(worker, file);
        if (badge !== '') problems.push(`${file}: badge "${String(badge)}", want none`);
      }
      await page.close();
    }
    expect(problems).toEqual([]);
    expect(requests.filter((r) => r.external)).toEqual([]);
  });

  test('a rejected page shows the popup state "couldn’t line up this page’s paragraphs" (AC2.2)', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
  }) => {
    await registerContentScript(worker);
    for (const file of ['paywall-teaser.html', 'canvas-text.html', 'ad-split.html']) {
      const page = await context.newPage();
      await page.goto(`${siteUrl}/${file}`);
      await page.bringToFront();
      await expect
        .poll(async () => (await summaryFor(worker, file))?.status['status'], { timeout: 30_000 })
        .toBe('unmapped');
      const tabId = await worker.evaluate(
        async (f) => (await chrome.tabs.query({})).find((t) => t.url?.includes(f))?.id,
        file,
      );
      const popup = await openExtensionPage(`popup.html?tab=${tabId}`);
      await expect(popup.getByTestId('status'), file).toContainText(
        'couldn’t line up this page’s paragraphs'.replace(/’/g, "'"),
      );
      await popup.close();
      await page.close();
    }
  });
});

test.describe('engine lifecycle (AC5.1, AC5.3)', () => {
  test('the first article page creates the offscreen document, and the idle alarm closes it', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
  }) => {
    const offscreenCount = (): Promise<number> =>
      worker.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
            })
          ).length,
      );
    expect(await offscreenCount()).toBe(0);

    await registerContentScript(worker);
    const page = await context.newPage();
    await page.goto(`${siteUrl}/wordpress.html`);
    await page.bringToFront();
    await expect.poll(offscreenCount, { timeout: 30_000 }).toBe(1);
    await expect
      .poll(async () => (await summaryFor(worker, 'wordpress.html'))?.status['status'], {
        timeout: 30_000,
      })
      .toBe('result');

    // The 5-minute idle alarm: unpacked extensions may use a shorter delay, so the real alarm
    // handler runs with the delay shortened (the 5-minute constant is covered by the unit test).
    await worker.evaluate(() => chrome.alarms.create('engine-idle', { delayInMinutes: 0.03 }));
    await expect.poll(offscreenCount, { timeout: 30_000 }).toBe(0);

    // The next request brings the engine back.
    const ext = await openExtensionPage('app.html');
    const stats = await send<{ paragraphs: number }>(ext, { type: 'memory/stats' });
    expect(stats.ok, stats.error).toBe(true);
    expect(await offscreenCount()).toBe(1);
  });

  test('with the model file removed from the build, exact matching still works and the popup says so (AC5.3)', async ({
    siteUrl,
  }) => {
    test.setTimeout(180_000);
    const dir = mkdtempSync(join(tmpdir(), 'old-news-nomodel-'));
    const copy = join(dir, 'ext');
    cpSync(EXTENSION_DIR, copy, { recursive: true });
    rmSync(join(copy, 'models'), { recursive: true, force: true });
    const profile = mkdtempSync(join(tmpdir(), 'old-news-nomodel-profile-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`],
    });
    try {
      const external: string[] = [];
      context.on('request', (r) => {
        if (
          !r.url().startsWith(siteUrl) &&
          !/^(chrome-extension|data|blob|about|chrome):/.test(r.url())
        ) {
          external.push(r.url());
        }
      });
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const extensionId = new URL(worker.url()).host;
      await registerContentScript(worker);
      const ext = await context.newPage();
      await ext.goto(`chrome-extension://${extensionId}/app.html`);

      // Remember the wire article; the same text under another URL is then "seen" by exact wording.
      const s = story('port-alder-fire');
      const wire = s.articles['wire']!;
      const ing = await send(ext, {
        type: 'page/ingest',
        page: pageOf(wire),
        paragraphs: paragraphsOf(wire),
      });
      expect(ing.ok, ing.error).toBe(true);
      const again = await send<{
        degraded: boolean;
        summary: { seen: number; total: number };
      }>(ext, {
        type: 'page/analyse',
        page: {
          ...pageOf(wire),
          url: 'https://elsewhere.example/copy',
          canonicalUrl: 'https://elsewhere.example/copy',
        },
        paragraphs: paragraphsOf(wire),
      });
      expect(again.ok, again.error).toBe(true);
      expect(again.data.degraded).toBe(true);
      expect(again.data.summary.seen).toBeGreaterThanOrEqual(3);

      // The popup for a real page shows the degraded-engine notice.
      const page = await context.newPage();
      await page.goto(`${siteUrl}/story/port-alder-fire/wire.html`);
      await page.bringToFront();
      await expect
        .poll(async () => (await summaryFor(worker, 'wire.html'))?.status['status'], {
          timeout: 30_000,
        })
        .toBe('result');
      const tabId = await worker.evaluate(
        async () => (await chrome.tabs.query({})).find((t) => t.url?.includes('wire.html'))?.id,
      );
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
      await expect(
        popup.getByText('Similar-wording matching is off', { exact: false }),
      ).toBeVisible({ timeout: 30_000 });
      expect(external).toEqual([]);
    } finally {
      await context.close();
      rmSync(dir, { recursive: true, force: true });
      rmSync(profile, { recursive: true, force: true });
    }
  });
});

test.describe('fade contrast on three page themes (AC8.1)', () => {
  test('seen lands at 4.6:1, similar at 7:1, nothing below 4.5:1, on light, dark and tinted pages', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
  }) => {
    test.setTimeout(240_000);
    await registerContentScript(worker);
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'port-alder-fire', ['wire', 'calder', 'morrow']);

    const summary: Record<string, { seen: number; similar: number; min: number }> = {};
    for (const theme of ['light', 'dark', 'tint'] as const) {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${siteUrl}/story/port-alder-fire/day2.html?theme=${theme}`);
      await page.bringToFront();
      await waitForOverlay(page);
      await page.waitForTimeout(2200); // the dissolve has finished
      const ratios = await page.evaluate(() => {
        const rgb = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const lum = (v: number[]): number => {
          const [r, g, b] = v.map((x) => {
            const s = x / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          }) as [number, number, number];
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const backdrop = (el: Element): number[] => {
          for (let n: Element | null = el; n; n = n.parentElement) {
            const c = getComputedStyle(n).backgroundColor;
            const parts = c.match(/[\d.]+/g) ?? [];
            if (parts.length >= 3 && (parts.length === 3 || Number(parts[3]) > 0.99)) return rgb(c);
          }
          return [255, 255, 255];
        };
        return [...document.querySelectorAll<HTMLElement>('main p')]
          .filter((p) => Number(getComputedStyle(p).opacity) < 1)
          .map((p) => {
            const a = Number(getComputedStyle(p).opacity);
            const ink = rgb(getComputedStyle(p).color);
            const bg = backdrop(p);
            const mixed = ink.map((v, i) => v * a + (bg[i] as number) * (1 - a));
            const [hi, lo] = [lum(mixed), lum(bg)].sort((x, y) => y - x) as [number, number];
            return (hi + 0.05) / (lo + 0.05);
          });
      });
      expect(ratios.length, `${theme}: faded paragraphs`).toBeGreaterThan(0);
      const seen = ratios.filter((r) => Math.abs(r - 4.6) <= 0.2);
      const similar = ratios.filter((r) => Math.abs(r - 7) <= 0.3);
      const stray = ratios.filter((r) => !seen.includes(r) && !similar.includes(r));
      expect(stray, `${theme}: ratios outside 4.6±0.2 and 7±0.3`).toEqual([]);
      expect(Math.min(...ratios), `${theme}: floor`).toBeGreaterThanOrEqual(4.5);
      expect(seen.length, `${theme}: at least one seen paragraph`).toBeGreaterThan(0);
      summary[theme] = { seen: seen.length, similar: similar.length, min: Math.min(...ratios) };
      await page.close();
    }
    test.info().annotations.push({ type: 'contrast', description: JSON.stringify(summary) });
  });
});

test.describe('keyboard shortcuts ignore text fields (AC12.1)', () => {
  test('N, J and K do nothing while an input or a contenteditable has focus', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
  }) => {
    await registerContentScript(worker);
    const ext = await openExtensionPage('app.html');
    await remember(ext, 'port-alder-fire', ['wire', 'calder', 'morrow']);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${siteUrl}/story/port-alder-fire/day2.html`);
    await page.bringToFront();
    await waitForOverlay(page);
    await page.waitForTimeout(2200);

    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'probe-input';
      const area = document.createElement('div');
      area.id = 'probe-edit';
      area.contentEditable = 'true';
      area.textContent = 'x';
      document.body.append(input, area);
    });
    const heights = (): Promise<number[]> =>
      page.evaluate(() =>
        [...document.querySelectorAll('main p')].map((p) => (p as HTMLElement).offsetHeight),
      );
    const open = await heights();
    const activeId = (): Promise<string> => page.evaluate(() => document.activeElement?.id ?? '');

    for (const id of ['probe-input', 'probe-edit']) {
      await page.focus(`#${id}`);
      for (const key of ['n', 'j', 'k']) await page.keyboard.press(key);
      expect(await heights(), `${id}: N must not fold`).toEqual(open);
      expect(await activeId(), `${id}: J/K must not move focus`).toBe(id);
    }
    await expect(page.locator('.marker')).toHaveCount(0);
    expect(await page.inputValue('#probe-input')).toBe('njk');

    // And with focus back on the page, the same keys work.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('n');
    expect((await heights()).some((h) => h === 1)).toBe(true);
  });
});
