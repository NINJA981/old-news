import { expect, test, type Page } from '@playwright/test';

const P = (s: string): string =>
  `${s} said officials on Tuesday, in a statement that ran to more than sixty characters.`;

/** Records every request the page makes and returns those that left the origin. */
function trackRequests(page: Page): { foreign: () => string[]; all: () => string[] } {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  const origin = 'http://localhost:4391';
  return {
    all: () => urls,
    foreign: () =>
      urls.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')),
  };
}

test.describe('landing page', () => {
  test('hero is real HTML, links to the web app, and loads nothing from other origins', async ({
    page,
  }) => {
    const reqs = trackRequests(page);
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('You’ve read this before.');
    await expect(page.locator('.try-link')).toHaveAttribute('href', '/app/');
    // the third tab's pill carries the engine's own sentence
    await expect(page.locator('#hero-sheet [data-pill]')).toContainText(
      'of 7 paragraphs are new to you',
    );
    await page.waitForLoadState('load');
    expect(reqs.foreign()).toEqual([]);
    await expect(page.locator('#ledger')).toHaveText('0');
  });

  test('the dissolve ends on the engine result, and reduced motion lands instantly', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('#hero-sheet')).not.toHaveClass(/is-dissolving/);
    await expect(page.locator('#replay')).toHaveText('Play');
    await expect(page.locator('#hero-sheet [data-pill-n]')).toHaveText('4');
    await ctx.close();

    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto('/');
    await p2.locator('#hero-sheet').scrollIntoViewIfNeeded();
    await expect(p2.locator('#hero-sheet')).not.toHaveClass(/is-dissolving/, { timeout: 8000 });
    await expect(p2.locator('#hero-sheet [data-pill-n]')).toHaveText('4');
    await ctx2.close();
  });

  test('N folds the old paragraphs in the demo and J jumps to a new one', async ({ page }) => {
    await page.goto('/');
    const demo = page.locator('#demo');
    await demo.scrollIntoViewIfNeeded();
    await demo.focus();
    await page.keyboard.press('n');
    await expect(demo.locator('.on-fold').first()).toBeVisible();
    await expect(demo.locator('.on-row[data-folded]').first()).toBeHidden();
    await page.keyboard.press('j');
    await expect(demo.locator('.on-row[data-focus]')).toHaveCount(1);
    await page.keyboard.press('n');
    await expect(demo.locator('.on-fold')).toHaveCount(0);
  });

  test('no horizontal scroll at 375 and the hero CTA is visible without scrolling', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator('.try-link')).toBeInViewport();
    await ctx.close();
  });
});

test.describe('web app', () => {
  test('375: empty state, a sample reads through the real engine, no foreign requests', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    const reqs = trackRequests(page);
    await page.goto('/app/');
    await expect(
      page.getByText('Runs entirely in your browser. Nothing is uploaded.'),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Paste two articles about the same story.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Try a sample story' }).click();
    await expect(page.locator('[data-pill]')).toContainText('of 7 paragraphs are new to you', {
      timeout: 30_000,
    });
    await expect(page.locator('.on-chip').first()).toContainText('Twelve → 14');
    // tiers: 3 seen, 2 changed, 2 new
    await expect(page.locator('.on-row[data-tier="seen"]')).toHaveCount(3);
    await expect(page.locator('.on-row[data-tier="changed"]')).toHaveCount(2);

    // every faded paragraph stays at or above the 4.5:1 floor against its sheet
    const worst = await page.evaluate(() => {
      const num = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = (rgb: number[]): number => {
        const [r, g, b] = rgb.map((v) => {
          const s = (v as number) / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
      };
      const sheet = document.querySelector('.on-sheet') as HTMLElement;
      const bg = num(getComputedStyle(sheet).backgroundColor);
      let min = 99;
      for (const p of document.querySelectorAll<HTMLElement>('.on-p[data-a]')) {
        const a = Number(getComputedStyle(p).opacity);
        const ink = num(getComputedStyle(p).color);
        const mixed = ink.map((v, i) => v * a + (bg[i] as number) * (1 - a));
        const [hi, lo] = [lum(mixed), lum(bg)].sort((x, y) => y - x) as [number, number];
        min = Math.min(min, (hi + 0.05) / (lo + 0.05));
      }
      return min;
    });
    expect(worst).toBeGreaterThanOrEqual(4.5);

    // tap a tag: the hover card opens as a sheet with where it was read
    await page.locator('.on-tag').first().click();
    await expect(page.locator('.on-card.is-open')).toContainText('Fenwick Wire');
    await page.waitForTimeout(400); // the card finishes its 160 ms enter before sizes are measured
    await expect(page.locator('.on-card')).toContainText('Same wording as a paragraph you read');
    await page.keyboard.press('Escape');
    await expect(page.locator('.on-card')).toHaveCount(0);

    // touch targets of everything interactive that is visible
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          'button, a[href], input:not([hidden]), textarea, [role=switch]',
        ),
      ]
        .filter(
          (el) =>
            el.getClientRects().length > 0 &&
            !el.classList.contains('on-tag') &&
            !el.classList.contains('on-chip') &&
            !el.classList.contains('skip-link'),
        )
        .map((el) => ({
          el: el.outerHTML.slice(0, 80),
          h: el.getBoundingClientRect().height,
          w: el.getBoundingClientRect().width,
        }))
        .filter((r) => r.h < 43.5 || r.w < 43.5),
    );
    expect(small).toEqual([]);

    expect(reqs.foreign()).toEqual([]);
    await ctx.close();
  });

  test('pasting two articles fades the repeated paragraph and flags the changed number', async ({
    page,
  }) => {
    await page.goto('/app/');
    const a = [
      P(
        'A fire tore through the Harbour Street warehouse late on Sunday, closing two roads, officials',
      ),
      P(
        'Twelve people were treated for smoke inhalation after the blaze at the warehouse, officials',
      ),
      P(
        'At least forty firefighters were sent to the scene and the fire took six hours to bring under control, crews',
      ),
    ].join('\n\n');
    const b = [
      P(
        'Council leaders promised a full review of the warehouse licensing rules after the blaze, a spokesperson',
      ),
      P(
        'Fourteen people were treated for smoke inhalation after the blaze at the warehouse, officials',
      ),
      P(
        'At least forty firefighters were sent to the scene and the fire took six hours to bring under control, crews',
      ),
    ].join('\n\n');
    await page.getByLabel('Paste an article').fill(a);
    await page.getByLabel('Source name (optional)').fill('Harbour Post');
    await page.getByRole('button', { name: 'Add article' }).click();
    await expect(page.getByText('Nothing to compare yet.')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Add article' }).first().click();
    await page.getByLabel('Paste an article').fill(b);
    await page.getByLabel('Source name (optional)').fill('Dock Daily');
    await page.getByRole('button', { name: 'Add article' }).last().click();
    await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.on-row[data-tier="seen"]')).toHaveCount(1);
    await expect(page.locator('.on-row[data-tier="changed"] .on-chip')).toContainText('→');
    await expect(page.locator('.on-tag')).toContainText('Harbour Post');
  });

  test('too little text is explained, not swallowed', async ({ page }) => {
    await page.goto('/app/');
    await page.getByLabel('Paste an article').fill('Just one short line.');
    await page.getByRole('button', { name: 'Add article' }).click();
    await expect(page.getByRole('alert')).toContainText('at least 2');
    await expect(page.getByLabel('Paste an article')).toHaveValue('Just one short line.');
  });

  test('works offline after the first load, and history survives a reload', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/app/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload(); // now controlled by the service worker
    await page.getByRole('button', { name: 'Try a sample story' }).click();
    await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });

    await ctx.setOffline(true);
    await page.reload();
    await expect(
      page.getByText('Runs entirely in your browser. Nothing is uploaded.'),
    ).toBeVisible();
    await expect(page.getByText('You’re offline. Everything here still works.')).toBeVisible();
    await page.getByRole('link', { name: 'Stories' }).click();
    await expect(page.getByText('Fire guts Port Alder').first()).toBeVisible();
    // a fresh sample still reads offline (the vectors are part of the precache)
    await page.getByRole('link', { name: 'Read' }).click();
    await page.getByRole('button', { name: 'Rail closure sample' }).click();
    await expect(page.locator('[data-pill]')).toContainText('paragraphs are new to you', {
      timeout: 30_000,
    });
    await ctx.close();
  });

  test('Forget everything asks twice and empties memory', async ({ page }) => {
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Try a sample story' }).click();
    await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Forget everything' }).click();
    await expect(page.getByText('This can’t be undone.')).toBeVisible();
    await page
      .getByRole('group', { name: 'Confirm forgetting' })
      .getByRole('button', { name: 'Forget everything' })
      .click();
    await expect(page.getByText(/Forgot \d+ paragraphs/)).toBeVisible();
    await expect(page.getByText('Paragraphs remembered')).toBeVisible();
  });

  test('375 touch: every control in the empty, result and settings views has a 44 px hit area', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    const small = (): Promise<string[]> =>
      page.evaluate(() => {
        const out: string[] = [];
        const sel = 'a[href], button, input:not([type=hidden]), textarea, select, summary';
        for (const e of document.querySelectorAll<HTMLElement>(sel)) {
          if (e.classList.contains('skip-link')) continue;
          e.scrollIntoView({ block: 'center', behavior: 'instant' });
          const r = e.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // Inline links inside a sentence are exempt (WCAG 2.5.8 inline exception).
          if (e.tagName === 'A' && e.closest('p') && e.parentElement?.tagName === 'P') continue;
          const hit = (dy: number): boolean => {
            const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2 + dy);
            return t === e || e.contains(t);
          };
          const tall = r.height >= 44 || (hit(-21) && hit(21));
          const wide = r.width >= 44 || (hit(-1) && r.width >= 24);
          if (!tall || !wide)
            out.push(
              e.tagName +
                ' ' +
                (e.textContent ?? '').trim().slice(0, 24) +
                ' ' +
                Math.round(r.width) +
                'x' +
                Math.round(r.height),
            );
        }
        return out;
      });
    await page.goto('/app/');
    expect(await small()).toEqual([]);
    await page.getByRole('button', { name: 'Try a sample story' }).click();
    await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });
    expect(await small()).toEqual([]);
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByText('Paragraphs remembered', { exact: true })).toBeVisible();
    expect(await small()).toEqual([]);
    await ctx.close();
  });

  test('reduced motion shows the final result without the sequence', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Try a sample story' }).click();
    await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-pill-n]')).toHaveText('4');
    await expect(page.locator('.reader')).not.toHaveClass(/is-dissolving/, { timeout: 3000 });
    await ctx.close();
  });
});
