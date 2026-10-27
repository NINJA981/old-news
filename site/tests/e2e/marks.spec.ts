/**
 * QA round 1 regressions on the site (runs in the `phone` 375x812 and `desktop` 1440x900 projects):
 *  - a drift chip never covers text (landing hero, the drift beat, the web app result);
 *  - the pill is deterministic under `?capture`: frame 0 reads "n of n" with every paragraph in full
 *    ink, the count only goes down, and the capsule never changes width while it counts.
 */
import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '@playwright/test';

const press = (info: TestInfo, l: Locator): Promise<void> =>
  info.project.name === 'phone' ? l.tap() : l.click();

interface Hit {
  chip: string;
  line: string;
}

/** Every visible chip box against every line box of text in the same root. */
async function chipsOverText(page: Page, rootSel: string): Promise<{ chips: number; hits: Hit[] }> {
  return page.evaluate((sel) => {
    const roots = [...document.querySelectorAll<HTMLElement>(sel)];
    const hits: { chip: string; line: string }[] = [];
    let chips = 0;
    for (const root of roots) {
      const lines: { r: DOMRect; text: string }[] = [];
      for (const p of root.querySelectorAll<HTMLElement>('.on-p')) {
        const range = document.createRange();
        range.selectNodeContents(p);
        for (const r of range.getClientRects()) {
          if (r.width > 0 && r.height > 0)
            lines.push({ r, text: p.textContent?.slice(0, 40) ?? '' });
        }
      }
      for (const c of root.querySelectorAll<HTMLElement>('.on-chip')) {
        const b = c.getBoundingClientRect();
        if (b.width === 0 || getComputedStyle(c).visibility === 'hidden') continue;
        chips++;
        for (const { r, text } of lines) {
          const overlap =
            Math.min(b.right, r.right) - Math.max(b.left, r.left) > 1 &&
            Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 1;
          if (overlap) hits.push({ chip: c.textContent ?? '', line: text });
        }
      }
    }
    return { chips, hits };
  }, rootSel);
}

test.describe('drift chips never cover text', () => {
  test('landing: hero and the drift beat', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#drift-demo').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const hero = await chipsOverText(page, '#hero-rows');
    expect(hero.chips, 'hero chips').toBeGreaterThan(0);
    expect(hero.hits).toEqual([]);
    const drift = await chipsOverText(page, '#drift-demo');
    expect(drift.chips, 'drift beat chips').toBe(2);
    expect(drift.hits).toEqual([]);
  });

  test('web app: both samples with changed facts', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const button of ['Try a sample story', 'Day-2 update sample']) {
      await page.goto('/app/');
      await press(info, page.getByRole('button', { name: button }));
      await expect(page.locator('[data-pill]')).toBeVisible({ timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      const r = await chipsOverText(page, '.reader');
      expect(r.chips, `${button}: chips`).toBeGreaterThan(0);
      expect(r.hits, button).toEqual([]);
    }
  });
});

test.describe('pill countdown is deterministic', () => {
  test('?capture: frame 0 is full ink at 23 of 23; the count only falls; width is fixed', async ({
    page,
  }) => {
    await page.goto('/?capture');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => typeof window.__frame === 'function');
    const frames = await page.evaluate(() => {
      const pill = document.querySelector<HTMLElement>('#hero-sheet [data-pill]')!;
      const out: { n: number; w: number; inked: number; faded: number }[] = [];
      for (let i = 0; i <= 60; i++) {
        window.__frame!(i, 30);
        const ps = [...document.querySelectorAll<HTMLElement>('#hero-sheet .on-p[data-a]')];
        out.push({
          n: Number(document.querySelector('#hero-sheet [data-pill-n]')?.textContent),
          w: pill.getBoundingClientRect().width,
          inked: ps.filter((p) => Number(getComputedStyle(p).opacity) === 1).length,
          faded: ps.length,
        });
      }
      return out;
    });
    const first = frames[0]!;
    expect(first.n).toBe(23);
    expect(first.inked).toBe(first.faded);
    expect(frames[frames.length - 1]!.n).toBe(4);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.n, `frame ${i}`).toBeLessThanOrEqual(frames[i - 1]!.n);
    }
    // The pill enters with a translate, which does not change its width.
    const widths = new Set(frames.slice(7).map((f) => Math.round(f.w)));
    expect([...widths], 'pill width across frames').toHaveLength(1);
  });
});
