/**
 * Accessibility (Stage 4): axe-core on every surface of the site in light and dark, at the phone
 * viewport and at desktop size (one run per Playwright project). Rules: WCAG 2.0/2.1 A and AA,
 * including colour contrast. Zero violations is the gate.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { ARTICLE_A, joinParas } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const SCHEMES = ['light', 'dark'] as const;

const press = (info: TestInfo, l: Locator): Promise<void> =>
  info.project.name === 'phone' ? l.tap() : l.click();

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

test.describe('axe, WCAG 2.1 A and AA', () => {
  test('landing page', async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
      await page.goto('/');
      // The dissolve plays once the sheet is in view; on a phone it starts below the fold.
      await page.locator('#hero-sheet').scrollIntoViewIfNeeded();
      await expect(page.locator('#hero-sheet [data-pill-n]')).toHaveText('4', { timeout: 15_000 });
      await expect(page.locator('#hero-sheet')).not.toHaveClass(/is-dissolving/, {
        timeout: 15_000,
      });
      await scan(page, `landing ${scheme}`, problems);
      // Every section scrolled into view (content-visibility defers rendering of the lower bands).
      for (const band of await page.locator('main > section, section').all()) {
        await band.scrollIntoViewIfNeeded().catch(() => undefined);
      }
      // The scroll-triggered dissolves (the drift chip fades in) must be over: axe measures live colours.
      await expect(page.locator('.is-dissolving')).toHaveCount(0, { timeout: 15_000 });
      await page.waitForTimeout(300);
      await scan(page, `landing ${scheme} (scrolled)`, problems);
    }
    // Reduced motion lands on the final frame; that state is a surface too.
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#replay')).toHaveText('Play');
    await scan(page, 'landing reduced-motion', problems);
    expect(problems).toEqual([]);
  });

  test('web app: empty, errors, composer, result, hover card, stories, settings', async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    const problems: string[] = [];
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/app/');
      await expect(
        page.getByRole('heading', { name: 'Paste two articles about the same story.' }),
      ).toBeVisible();
      await scan(page, `app empty ${scheme}`, problems);

      // Error state (empty input), then too-short text.
      await press(info, page.getByRole('button', { name: 'Add article' }));
      await expect(page.getByRole('alert')).toBeVisible();
      await scan(page, `app error ${scheme}`, problems);

      // First pasted article: the "nothing to compare yet" state.
      await page.getByLabel('Paste an article').fill(joinParas(ARTICLE_A));
      await press(info, page.getByRole('button', { name: 'Add article' }));
      await expect(page.getByText('Nothing to compare yet.')).toBeVisible({ timeout: 30_000 });
      await scan(page, `app nothing-to-compare ${scheme}`, problems);

      // A sample result: tags, chips, pill, then the open hover card.
      await page.goto('/app/');
      await press(info, page.getByRole('button', { name: 'Try a sample story' }));
      await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.reader')).not.toHaveClass(/is-dissolving/, { timeout: 10_000 });
      await scan(page, `app result ${scheme}`, problems);
      await press(info, page.locator('.on-tag').first());
      await expect(page.locator('.on-card.is-open')).toBeVisible();
      await page.waitForTimeout(400);
      await scan(page, `app hover-card ${scheme}`, problems);
      await page.keyboard.press('Escape');
      // The card fades out over a few frames; axe would measure its text mid-fade.
      await expect(page.locator('.on-card.is-open')).toHaveCount(0);
      await page.waitForTimeout(400);

      // Add-article composer open over a result.
      await press(info, page.locator('.art-add'));
      await scan(page, `app composer-over-result ${scheme}`, problems);

      await press(info, page.getByRole('link', { name: 'Stories' }));
      await expect(page.getByText('Fire guts Port Alder').first()).toBeVisible();
      await scan(page, `app stories ${scheme}`, problems);

      await press(info, page.getByRole('link', { name: 'Settings' }));
      await expect(page.getByText('Paragraphs remembered', { exact: true })).toBeVisible();
      await scan(page, `app settings ${scheme}`, problems);

      // Forget everything: the confirm step, then the empty memory state.
      await press(info, page.getByRole('button', { name: 'Forget everything' }));
      await expect(page.getByText('This can’t be undone.')).toBeVisible();
      await scan(page, `app settings confirm ${scheme}`, problems);
      await press(
        info,
        page
          .getByRole('group', { name: 'Confirm forgetting' })
          .getByRole('button', { name: 'Forget everything' }),
      );
      await expect(page.getByText(/Forgot \d+ paragraphs/)).toBeVisible();
      await press(info, page.getByRole('link', { name: 'Stories' }));
      await scan(page, `app stories-empty ${scheme}`, problems);
    }
    expect(problems).toEqual([]);
  });

  test('web app: offline banner', async ({ page, context }) => {
    await page.goto('/app/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('You’re offline. Everything here still works.')).toBeVisible();
    const problems: string[] = [];
    await scan(page, 'app offline', problems);
    await context.setOffline(false);
    expect(problems).toEqual([]);
  });
});
