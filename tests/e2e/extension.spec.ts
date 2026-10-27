/**
 * Core e2e (Stage 2): the built extension in Chromium, the real MiniLM model, and the content
 * script on authored layout fixtures. UI-surface e2e (overlay, hover cards, keyboard) belongs to
 * the UI stages; this proves the engine chain works end to end and nothing leaves the machine.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

interface Reply<T = unknown> {
  ok: boolean;
  data: T;
  error?: string;
}

interface AnalyseData {
  paragraphs: { ordinal: number; tier: string; provenance: { siteName: string } | null }[];
  summary: { total: number; new: number; seen: number; similar: number; changed: number };
  degraded: boolean;
  timingMs: number;
}

interface StatsData {
  paragraphs: number;
  articles: number;
  modelAvailable: boolean;
  embedderId: string | null;
  modelInfo: { backend: string; timings: { backend: string; ok: boolean; ms: number }[] } | null;
}

async function send<T>(page: Page, message: unknown): Promise<Reply<T>> {
  return page.evaluate((m) => chrome.runtime.sendMessage(m) as Promise<Reply<T>>, message);
}

async function stats(page: Page): Promise<StatsData> {
  const r = await send<StatsData>(page, { type: 'memory/stats' });
  expect(r.ok, r.error).toBe(true);
  return r.data;
}

interface StoryArticle {
  url: string;
  siteName: string;
  title: string;
  paragraphs: string[];
  labels: { tier: string }[];
}

function story(id: string): { order: string[]; articles: Record<string, StoryArticle> } {
  const raw = JSON.parse(
    readFileSync(
      join(process.cwd(), 'tests', 'fixtures', 'corpus', 'stories', `${id}.json`),
      'utf8',
    ),
  ) as { readingOrder: string[]; articles: Record<string, StoryArticle> };
  return { order: raw.readingOrder, articles: raw.articles };
}

const pageOf = (a: StoryArticle) => ({
  url: a.url,
  canonicalUrl: a.url,
  siteName: a.siteName,
  title: a.title,
  kind: 'news',
});
const paragraphsOf = (a: StoryArticle) => a.paragraphs.map((text, ordinal) => ({ ordinal, text }));

async function registerContentScript(worker: Worker): Promise<void> {
  await worker.evaluate(() =>
    chrome.scripting.registerContentScripts([
      {
        id: 'e2e-content',
        js: ['content-scripts/content.js'],
        matches: ['http://127.0.0.1/*'],
        runAt: 'document_idle',
      },
    ]),
  );
}

async function summaryFor(
  worker: Worker,
  urlPart: string,
): Promise<{ status: Record<string, unknown> } | null> {
  return worker.evaluate(async (part) => {
    const tabs = (await chrome.tabs.query({})).filter((t) => t.url?.includes(part));
    const id = tabs[0]?.id;
    if (id === undefined) return null;
    const got = await chrome.storage.session.get(`summary:${id}`);
    return (got[`summary:${id}`] as { status: Record<string, unknown> } | undefined) ?? null;
  }, urlPart);
}

async function badgeFor(worker: Worker, urlPart: string): Promise<string | null> {
  return worker.evaluate(async (part) => {
    const tabs = (await chrome.tabs.query({})).filter((t) => t.url?.includes(part));
    const id = tabs[0]?.id;
    return id === undefined ? null : chrome.action.getBadgeText({ tabId: id });
  }, urlPart);
}

test.describe('manifest and privacy locks', () => {
  test('incognito is not allowed, host access is optional, connect-src is self (AC1.3)', async ({
    worker,
    requests,
  }) => {
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.incognito).toBe('not_allowed');
    expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://*/*']);
    expect(JSON.stringify(manifest.content_security_policy)).toContain("connect-src 'self'");
    expect(manifest.content_scripts).toBeUndefined();
    expect(requests.filter((r) => r.external)).toEqual([]);
  });
});

test.describe('extension pages through the engine host', () => {
  test('popup and app render; memory starts empty; 0 external requests', async ({
    openExtensionPage,
    requests,
  }) => {
    const popup = await openExtensionPage('popup.html');
    await expect(popup.getByRole('heading', { name: 'Old News' })).toBeVisible();
    await expect(popup.getByTestId('meter')).toContainText('0 requests sent');
    await expect(popup.getByTestId('meter')).toContainText('nothing remembered yet');

    const app = await openExtensionPage('app.html');
    await expect(app.getByText('nothing remembered yet')).toBeVisible();
    await expect(app.getByText('Nothing to show yet')).toBeVisible();

    expect(requests.filter((r) => r.external)).toEqual([]);
  });
});

test.describe('engine with the real model', () => {
  test('remembers a story, fades the rewrite, keeps changed facts lit, and reports timings', async ({
    openExtensionPage,
    requests,
  }, testInfo) => {
    const page = await openExtensionPage('app.html');
    const s = story('port-alder-fire');
    const wire = s.articles['wire'] as StoryArticle;
    const calder = s.articles['calder'] as StoryArticle;
    const day2 = s.articles['day2'] as StoryArticle;

    // Cold: the first request loads the model.
    const t0 = Date.now();
    const ing = await send(page, {
      type: 'page/ingest',
      page: pageOf(wire),
      paragraphs: paragraphsOf(wire),
    });
    expect(ing.ok, ing.error).toBe(true);
    const coldMs = Date.now() - t0;

    const first = await send<AnalyseData>(page, {
      type: 'page/analyse',
      page: pageOf(calder),
      paragraphs: paragraphsOf(calder),
    });
    expect(first.ok, first.error).toBe(true);
    expect(first.data.degraded).toBe(false);
    const seenOrSimilar = first.data.paragraphs.filter(
      (p) => p.tier === 'seen' || p.tier === 'similar',
    );
    expect(seenOrSimilar.length).toBeGreaterThanOrEqual(3);
    expect(seenOrSimilar[0]?.provenance?.siteName).toBe('Fenwick Wire');

    // A new, unrelated labelled-new paragraph must never be faded.
    calder.labels.forEach((label, i) => {
      if (label.tier === 'new') {
        expect(['seen', 'similar'], `calder#${i}`).not.toContain(first.data.paragraphs[i]?.tier);
      }
    });

    // Warm latency, p50 over 7 runs.
    const warm: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t = Date.now();
      const r = await send<AnalyseData>(page, {
        type: 'page/analyse',
        page: pageOf(calder),
        paragraphs: paragraphsOf(calder),
      });
      warm.push(r.data.timingMs || Date.now() - t);
    }
    warm.sort((a, b) => a - b);
    const p50 = warm[Math.floor(warm.length / 2)] as number;

    // AC5.2 is stated for a 30-paragraph article: build one from every authored story paragraph.
    const pool = ['port-alder-fire', 'kessel-valley-rail', 'sleep-blogs'].flatMap((id) =>
      Object.values(story(id).articles).flatMap((a) => a.paragraphs),
    );
    const thirty = pool.slice(0, 30).map((text, ordinal) => ({ ordinal, text }));
    expect(thirty).toHaveLength(30);
    const warm30: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await send<AnalyseData>(page, {
        type: 'page/analyse',
        page: {
          ...pageOf(calder),
          url: 'https://perf.example/thirty',
          canonicalUrl: 'https://perf.example/thirty',
        },
        paragraphs: thirty,
      });
      warm30.push(r.data.timingMs);
    }
    warm30.sort((a, b) => a - b);
    const p50of30 = warm30[Math.floor(warm30.length / 2)] as number;

    // Changed facts on day 2 must stay lit (guard before fade).
    await send(page, {
      type: 'page/ingest',
      page: pageOf(calder),
      paragraphs: paragraphsOf(calder),
    });
    const d2 = await send<AnalyseData>(page, {
      type: 'page/analyse',
      page: pageOf(day2),
      paragraphs: paragraphsOf(day2),
    });
    expect(d2.ok, d2.error).toBe(true);
    const falseFades: string[] = [];
    day2.labels.forEach((label, i) => {
      const tier = d2.data.paragraphs[i]?.tier;
      if (
        (label.tier === 'changed' || label.tier === 'new') &&
        (tier === 'seen' || tier === 'similar')
      ) {
        falseFades.push(`day2#${i} labelled ${label.tier}, got ${tier}`);
      }
    });
    expect(falseFades).toEqual([]);
    expect(d2.data.summary.changed).toBeGreaterThan(0);

    const st = await stats(page);
    expect(st.modelAvailable).toBe(true);
    expect(st.embedderId).toContain('all-MiniLM-L6-v2');
    expect(st.modelInfo).not.toBeNull();

    const perf = {
      measuredAt: new Date().toISOString(),
      coldFirstRequestMs: coldMs,
      warmAnalyseP50Ms: p50,
      warmRuns: warm,
      warm30ParagraphP50Ms: p50of30,
      warm30ParagraphRuns: warm30,
      paragraphsPerArticle: calder.paragraphs.length,
      backend: st.modelInfo?.backend,
      backendTimings: st.modelInfo?.timings,
      embedderId: st.embedderId,
    };
    mkdirSync('test-results', { recursive: true });
    writeFileSync(join('test-results', 'engine-perf.json'), JSON.stringify(perf, null, 2));
    await testInfo.attach('engine-perf', {
      body: JSON.stringify(perf, null, 2),
      contentType: 'application/json',
    });

    expect(requests.filter((r) => r.external)).toEqual([]);
  });
});

test.describe('content script on fixture pages', () => {
  test('remembers a read article, then marks the same story elsewhere; leaves other pages alone', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
    requests,
  }) => {
    await registerContentScript(worker);
    const ext = await openExtensionPage('app.html');

    // Pages that are not articles, or cannot be mapped, are left untouched.
    for (const file of [
      'search-results.html',
      'paywall-teaser.html',
      'canvas-text.html',
      'ad-split.html',
    ]) {
      const p = await context.newPage();
      await p.goto(`${siteUrl}/${file}`);
      const before = await p.evaluate(() => document.documentElement.outerHTML);
      await expect
        .poll(async () => (await summaryFor(worker, file))?.status['status'], { timeout: 20_000 })
        .toBeTruthy();
      const status = (await summaryFor(worker, file))?.status['status'];
      expect(['not-article', 'unmapped', 'non-english'], file).toContain(status);
      expect(await badgeFor(worker, file)).toBe('');
      expect(await p.evaluate(() => document.documentElement.outerHTML), file).toBe(before);
      await p.close();
    }

    // Read article A at reading pace: its paragraphs are remembered.
    const a = await context.newPage();
    await a.goto(`${siteUrl}/wordpress.html`);
    await a.bringToFront();
    await expect
      .poll(async () => (await summaryFor(worker, 'wordpress.html'))?.status['status'], {
        timeout: 20_000,
      })
      .toBe('result');
    await expect
      .poll(async () => (await stats(ext)).paragraphs, { timeout: 45_000 })
      .toBeGreaterThanOrEqual(6);

    // Article B (same text, different markup and URL): everything is seen.
    const b = await context.newPage();
    await b.goto(`${siteUrl}/arc-nested.html`);
    await b.bringToFront();
    await expect
      .poll(async () => (await summaryFor(worker, 'arc-nested.html'))?.status['status'], {
        timeout: 30_000,
      })
      .toBe('result');
    const result = (await summaryFor(worker, 'arc-nested.html'))?.status as {
      total: number;
      seen: number;
      new: number;
      changed: number;
    };
    expect(result.total).toBe(6);
    expect(result.seen).toBeGreaterThanOrEqual(5);
    expect(result.changed).toBe(0);
    expect(await badgeFor(worker, 'arc-nested.html')).toBe(String(result.new + result.changed));

    expect(requests.filter((r) => r.external)).toEqual([]);
  });

  test('scrolling past in under a second remembers nothing (AC4.2)', async ({
    context,
    worker,
    siteUrl,
    openExtensionPage,
  }) => {
    await registerContentScript(worker);
    const ext = await openExtensionPage('app.html');
    const p = await context.newPage();
    await p.goto(`${siteUrl}/ghost-blog.html`);
    await p.bringToFront();
    await expect
      .poll(async () => (await summaryFor(worker, 'ghost-blog.html'))?.status['status'], {
        timeout: 20_000,
      })
      .toBe('result');
    // Leave straight away: close the page before any paragraph reaches its dwell time.
    await p.close();
    await ext.waitForTimeout(3000);
    expect((await stats(ext)).paragraphs).toBe(0);
  });
});
