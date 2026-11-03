/**
 * Accessibility pass: axe-core on every surface in light and dark, plus
 * the overlay on a fixture article (the e2e build opens the shadow root so axe can see inside).
 * Rules: WCAG 2.0/2.1 A and AA, including colour contrast. Zero violations is the gate.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { registerContentScript, remember, summaryFor, waitForOverlay } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const THEMES = ['light', 'dark'] as const;

test.setTimeout(600_000);

async function setSettings(worker: Worker, patch: Record<string, unknown>): Promise<void> {
  await worker.evaluate(async (p) => {
    const got = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      settings: { ...(got['settings'] as object | undefined), ...p },
    });
  }, patch);
}

async function scan(page: Page, label: string, problems: string[]): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of results.violations) {
    const nodes = v.nodes
      .slice(0, 3)
      .map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n')[1] ?? ''}`)
      .join(' | ');
    problems.push(`${label}: ${v.id} (${v.impact}) x${v.nodes.length} ${nodes}`);
  }
}

test('axe finds no WCAG A/AA violations on popup, app, onboarding and the overlay', async ({
  context,
  worker,
  siteUrl,
  openExtensionPage,
}) => {
  await registerContentScript(worker);
  const problems: string[] = [];
  const seed = await openExtensionPage('app.html');
  await remember(seed, 'port-alder-fire', ['wire', 'calder', 'morrow']);
  await seed.close();

  // The overlay on a day-2 article (light and dark pages).
  for (const theme of ['light', 'dark'] as const) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${siteUrl}/story/port-alder-fire/day2.html?theme=${theme}`);
    await page.bringToFront();
    await waitForOverlay(page);
    await page.waitForTimeout(2000);
    await page.locator('.tag.on').first().hover();
    await page.waitForTimeout(600);
    await scan(page, `overlay page=${theme} (hover card open)`, problems);
    await page.close();
  }

  // Popup states.
  const live = await context.newPage();
  const url = `${siteUrl}/story/port-alder-fire/day2.html?theme=light`;
  await live.goto(url);
  await live.bringToFront();
  await waitForOverlay(live);
  await expect
    .poll(async () => (await summaryFor(worker, 'day2.html'))?.status['status'])
    .toBe('result');
  const tabId = await worker.evaluate(async () => {
    const tabs = (await chrome.tabs.query({})).filter((t) => t.url?.includes('day2.html'));
    return tabs[0]?.id ?? -1;
  });
  const real = (await summaryFor(worker, 'day2.html'))?.status;
  const states: [string, unknown][] = [
    ['mixed', real],
    ['error', { status: 'error', reason: 'The model file is missing' }],
    ['unmapped', { status: 'unmapped', reason: 'low-mapping' }],
    ['not-article', { status: 'not-article' }],
    ['degraded', { ...(real as object), degraded: true }],
    ['analysing', { status: 'analysing', total: 23 }],
  ];
  for (const theme of THEMES) {
    await setSettings(worker, { theme, onboardingDone: true });
    for (const [name, status] of states) {
      await worker.evaluate(
        async ([id, u, st]) => {
          await chrome.storage.session.set({
            [`summary:${id}`]: { url: u, status: st, at: Date.now() },
          });
        },
        [tabId, url, status] as const,
      );
      const popup = await openExtensionPage(`popup.html?tab=${tabId}`);
      await popup.setViewportSize({ width: 380, height: 560 });
      await popup.waitForTimeout(name === 'analysing' ? 600 : 300);
      await scan(popup, `popup ${name} ${theme}`, problems);
      if (name === 'mixed') {
        await popup.getByRole('tab', { name: 'Drift' }).click();
        await popup.waitForTimeout(300);
        await scan(popup, `popup drift-tab ${theme}`, problems);
      }
      await popup.close();
    }
  }
  await live.close();

  // App screens and onboarding steps, narrow and wide.
  for (const theme of THEMES) {
    await setSettings(worker, { theme });
    for (const width of [375, 1440]) {
      for (const route of ['stories', 'drift', 'receipt', 'memory', 'settings']) {
        const app = await openExtensionPage(`app.html#/${route}`);
        await app.setViewportSize({ width, height: width === 375 ? 812 : 900 });
        await app.waitForTimeout(600);
        await scan(app, `app ${route} ${theme} ${width}`, problems);
        await app.close();
      }
      const app = await openExtensionPage('app.html#/stories');
      await app.setViewportSize({ width, height: 900 });
      await app.keyboard.press('Control+k');
      await app.waitForTimeout(400);
      await scan(app, `palette ${theme} ${width}`, problems);
      await app.close();
      for (const step of ['allow', 'tabs', 'done']) {
        const ob = await openExtensionPage(`onboarding.html#/${step}`);
        await ob.setViewportSize({ width, height: 900 });
        await ob.waitForTimeout(step === 'tabs' ? 2500 : 500);
        await scan(ob, `onboarding ${step} ${theme} ${width}`, problems);
        await ob.close();
      }
    }
  }

  // The playground with the overlay painted on its sheet.
  for (const theme of THEMES) {
    await setSettings(worker, { theme });
    const pg = await openExtensionPage('app.html?capture#/playground');
    await pg.setViewportSize({ width: 1440, height: 900 });
    await expect
      .poll(() => pg.evaluate(() => typeof window.__frame), { timeout: 120_000 })
      .toBe('function');
    await pg.evaluate(() => window.__frame?.(1700, 1000));
    await pg.waitForTimeout(600);
    await scan(pg, `playground ${theme}`, problems);
    await pg.close();
  }

  expect(problems).toEqual([]);
});
