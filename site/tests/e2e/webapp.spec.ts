/**
 * Web app e2e (Stage 4): the same flows at a phone viewport (375x812, touch) and at desktop size
 * (see playwright.config.ts projects). Sample flow, paste flow, upload flow, offline after the first
 * load, and a hard assertion that nothing leaves the page except GETs of this build's own files.
 */
import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  ARTICLE_A,
  ARTICLE_B,
  asHtml,
  joinParas,
  ORIGIN,
  P,
  recordRequests,
  type RequestLog,
} from './helpers';

const press = (info: TestInfo, l: Locator): Promise<void> =>
  info.project.name === 'phone' ? l.tap() : l.click();

async function noOverflow(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'horizontal scroll').toBeLessThanOrEqual(0);
}

function expectStatic(log: RequestLog): void {
  expect(log.violations(), 'requests beyond this build’s own static files').toEqual([]);
  expect(log.sockets(), 'websockets').toBe(0);
  expect(log.modelRequests(), 'the 23 MB model is only fetched after the reader opts in').toEqual(
    [],
  );
}

async function tierCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const out: Record<string, number> = {};
    for (const row of document.querySelectorAll<HTMLElement>('.on-row[data-tier]')) {
      const t = row.dataset['tier'] ?? '';
      out[t] = (out[t] ?? 0) + 1;
    }
    return out;
  });
}

async function addPasted(
  page: Page,
  info: TestInfo,
  text: string,
  source: string,
  first: boolean,
): Promise<void> {
  if (!first) await press(info, page.getByRole('button', { name: 'Add article' }).first());
  await page.getByLabel('Paste an article').fill(text);
  await page.getByLabel('Source name (optional)').fill(source);
  await press(info, page.getByRole('button', { name: 'Add article' }).last());
}

test.describe('sample flow', () => {
  test('each bundled sample reads through the real engine and shows a consistent result', async ({
    page,
  }, info) => {
    const log = recordRequests(page);
    const cases: [button: string, minSeen: number, chip: boolean][] = [
      ['Try a sample story', 3, true],
      ['Day-2 update sample', 3, true],
      ['Rail closure sample', 1, false],
      ['Sleep blogs sample', 1, false],
    ];
    for (const [button, minSeen, chip] of cases) {
      await page.goto('/app/');
      await expect(
        page.getByRole('heading', { name: 'Paste two articles about the same story.' }),
      ).toBeVisible();
      await noOverflow(page);
      await press(info, page.getByRole('button', { name: button }));
      await expect(page.locator('[data-pill]'), button).toContainText(
        /\d+ of \d+ paragraphs are new to you|Nothing new here/,
        { timeout: 30_000 },
      );
      const counts = await tierCounts(page);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const pill = (await page.locator('[data-pill]').first().innerText()).replace(/\s+/g, ' ');
      const nums = pill.match(/\d+/g) ?? [];
      expect(Number(nums[nums.length - 1]), `${button}: pill total vs rows`).toBe(total);
      expect(counts['seen'] ?? 0, `${button}: seen`).toBeGreaterThanOrEqual(minSeen);
      if (chip) await expect(page.locator('.on-chip').first()).toContainText('→');
      const hidden = await page.evaluate(
        () =>
          [...document.querySelectorAll('.on-row[data-tier]')].filter(
            (r) => getComputedStyle(r).display === 'none',
          ).length,
      );
      expect(hidden, `${button}: hidden rows`).toBe(0);
      await noOverflow(page);
    }
    expectStatic(log);
  });

  test('the Stories view lists the story that was just read', async ({ page }, info) => {
    const log = recordRequests(page);
    await page.goto('/app/');
    await press(info, page.getByRole('button', { name: 'Try a sample story' }));
    await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });
    await press(info, page.getByRole('link', { name: 'Stories' }));
    await expect(page.getByText('Footbridge collapses at Harrow Ford').first()).toBeVisible();
    await noOverflow(page);
    expectStatic(log);
  });
});

test.describe('paste flow', () => {
  test('two pasted articles: the repeated paragraph fades, the changed number is flagged', async ({
    page,
  }, info) => {
    const log = recordRequests(page);
    await page.goto('/app/');
    await addPasted(page, info, joinParas(ARTICLE_A), 'Harbour Post', true);
    await expect(page.getByText('Nothing to compare yet.')).toBeVisible({ timeout: 30_000 });
    await addPasted(page, info, joinParas(ARTICLE_B), 'Dock Daily', false);
    await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.on-row[data-tier="seen"]')).toHaveCount(1);
    await expect(page.locator('.on-row[data-tier="changed"] .on-chip')).toContainText('→');
    await expect(page.locator('.on-tag')).toContainText('Harbour Post');
    await noOverflow(page);
    expectStatic(log);
  });

  test('empty and too-short input is explained and keeps what was typed', async ({
    page,
  }, info) => {
    await page.goto('/app/');
    await press(info, page.getByRole('button', { name: 'Add article' }));
    await expect(page.getByRole('alert')).toContainText('nothing to read yet');
    await page.getByLabel('Paste an article').fill('Just one short line.');
    await press(info, page.getByRole('button', { name: 'Add article' }));
    await expect(page.getByRole('alert')).toContainText('at least 2');
    await expect(page.getByLabel('Paste an article')).toHaveValue('Just one short line.');
    await expect(page.getByRole('alert').getByRole('button').first()).toBeVisible();
  });
});

test.describe('upload flow', () => {
  test('.txt, .md and .html files are read in the order they are added', async ({ page }, info) => {
    const log = recordRequests(page);
    await page.goto('/app/');
    const picker = page.locator('input[type=file]');
    await expect(picker).toHaveAttribute('accept', /\.txt.*\.md.*\.html/);

    await picker.setInputFiles([
      { name: 'monday.txt', mimeType: 'text/plain', buffer: Buffer.from(joinParas(ARTICLE_A)) },
      {
        name: 'tuesday.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from(`# Council promises review\n\n${joinParas(ARTICLE_B)}`),
      },
    ]);
    await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });
    const tabs = page.getByRole('navigation', { name: 'Articles in this session' });
    const articleTabs = tabs.locator('.art-tab:not(.art-add)');
    await expect(articleTabs).toHaveCount(2);
    await expect(articleTabs.first()).toContainText('monday');
    await expect(articleTabs.last()).toContainText('tuesday');
    await expect(page.locator('.on-row[data-tier="seen"]')).toHaveCount(1);
    await expect(page.locator('.on-row[data-tier="changed"] .on-chip')).toContainText('→');

    // A saved web page: the page chrome (nav, footer) is ignored, the article text is read.
    await press(info, tabs.locator('.art-add'));
    await page.locator('input[type=file]').setInputFiles({
      name: 'saved-page.html',
      mimeType: 'text/html',
      buffer: Buffer.from(
        asHtml('Warehouse fire latest', [
          ARTICLE_A[0] as string,
          P('Investigators said the cause of the blaze remained under investigation on Wednesday'),
          ARTICLE_B[2] as string,
        ]),
      ),
    });
    await expect(articleTabs).toHaveCount(3, { timeout: 30_000 });
    await expect(page.locator('.on-row[data-tier="seen"]')).toHaveCount(2);
    await expect(page.locator('.on-row')).toHaveCount(3);
    await noOverflow(page);
    expectStatic(log);
  });

  test('unreadable input says why and offers Retry or Dismiss; it is never swallowed', async ({
    page,
  }, info) => {
    await page.goto('/app/');
    const picker = page.locator('input[type=file]');

    await picker.setInputFiles({
      name: 'empty.txt',
      mimeType: 'text/plain',
      buffer: Buffer.alloc(0),
    });
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('at least 2');
    await expect(alert.getByRole('button', { name: /^(Retry|Dismiss)$/ })).toBeVisible();

    await picker.setInputFiles({
      name: 'huge.txt',
      mimeType: 'text/plain',
      buffer: Buffer.alloc(2_000_001, 'a'),
    });
    await expect(alert).toContainText('larger than 2 MB');

    // Retry runs the same read again and reports the same reason; nothing is silently dropped.
    const retry = alert.getByRole('button', { name: 'Retry' });
    if ((await retry.count()) > 0) {
      await press(info, retry);
      await expect(alert).toContainText('larger than 2 MB');
    }
    await expect(page.locator('.on-row')).toHaveCount(0);
  });
});

test.describe('offline and requests', () => {
  test('works offline after the first load, and history survives a reload', async ({
    page,
    context,
  }, info) => {
    await page.goto('/app/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload(); // now controlled by the service worker
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    await press(info, page.getByRole('button', { name: 'Try a sample story' }));
    await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });

    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByText('Runs entirely in your browser. Nothing is uploaded.'),
    ).toBeVisible();
    await expect(page.getByText('You’re offline. Everything here still works.')).toBeVisible();
    await press(info, page.getByRole('link', { name: 'Stories' }));
    await expect(page.getByText('Footbridge collapses at Harrow Ford').first()).toBeVisible();

    // Offline, a fresh sample and a pasted pair both still read (the vectors are precached).
    await press(info, page.getByRole('link', { name: 'Read' }));
    await press(info, page.getByRole('button', { name: 'Rail closure sample' }));
    await expect(page.locator('[data-pill]')).toContainText('paragraphs are new to you', {
      timeout: 30_000,
    });
    await page.reload();
    await addPasted(page, info, joinParas(ARTICLE_A), 'Offline Post', true);
    await expect(page.getByText('Nothing to compare yet.')).toBeVisible({ timeout: 30_000 });
    await addPasted(page, info, joinParas(ARTICLE_B), 'Offline Daily', false);
    await expect(page.locator('.on-row[data-tier="seen"]')).toHaveCount(1, { timeout: 30_000 });

    // Back online: nothing about the app depended on the network.
    await context.setOffline(false);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Paste two articles about the same story.' }),
    ).toBeVisible();
  });

  test('a whole session (landing, app, sample, paste, settings, forget) makes only GETs of its own static files', async ({
    page,
  }, info) => {
    const log = recordRequests(page);
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForLoadState('load');
    await page.goto('/app/');
    await press(info, page.getByRole('button', { name: 'Try a sample story' }));
    await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });
    await addPasted(page, info, joinParas(ARTICLE_A), 'Net A', false);
    // Nothing in the sample story matches this article, so there is no pill: wait for its rows.
    await expect(page.locator('.on-row')).toHaveCount(ARTICLE_A.length, { timeout: 30_000 });
    await press(info, page.getByRole('link', { name: 'Stories' }));
    await press(info, page.getByRole('link', { name: 'Settings' }));
    await expect(page.getByText('Paragraphs remembered', { exact: true })).toBeVisible();
    await press(info, page.getByRole('button', { name: 'Forget everything' }));
    await press(
      info,
      page
        .getByRole('group', { name: 'Confirm forgetting' })
        .getByRole('button', { name: 'Forget everything' }),
    );
    await expect(page.getByText(/Forgot \d+ paragraphs/)).toBeVisible();

    const all = log.all();
    expect(all.length).toBeGreaterThan(5);
    expect(all.every((r) => r.url.startsWith(ORIGIN) || /^(data|blob):/.test(r.url))).toBe(true);
    expect(all.filter((r) => r.method !== 'GET')).toEqual([]);
    expectStatic(log);
    test
      .info()
      .annotations.push({ type: 'requests', description: `${all.length} same-origin GETs` });
  });
});
