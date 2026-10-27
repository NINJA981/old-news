// @vitest-environment jsdom
/**
 * The overlay on a jsdom page: what it touches (inline opacity, one host element), that it undoes
 * all of it, that nothing is hidden unless the reader folds, and the keyboard rules. Geometry and
 * animation are not available in jsdom, so layout-dependent behaviour is covered in e2e.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParagraphResult } from '../../../src/host/engineHost';
import { OVERLAY_ATTR } from '../../../src/extract/map';
import { fadeFor, themeOf } from '../../../src/overlay/ink';
import { findToken } from '../../../src/overlay/locate';
import { Overlay } from '../../../src/overlay/overlay';
import { blend, contrastRatio, parseCssColor } from '../../../src/paint/contrastFloor';

const TEXT = [
  'Police investigating the Port Alder warehouse fire have arrested a 34-year-old man on suspicion of arson.',
  'At least 40 firefighters were sent to the scene from Port Alder and three neighbouring towns today.',
  'The warehouse, owned by the logistics firm Brennock Freight, held packaging and household goods.',
  'Harbour Road and Quay Lane reopened on Tuesday morning, and the town council advised drivers.',
  'Brennock Freight said in a statement that all of its staff on the night shift had been accounted for.',
];

function page(bg = '#ffffff', ink = '#121212'): HTMLElement[] {
  document.body.innerHTML = '';
  document.body.style.background = bg;
  document.body.style.color = ink;
  return TEXT.map((t) => {
    const p = document.createElement('p');
    p.textContent = t;
    document.body.append(p);
    return p;
  });
}

function result(ordinal: number, tier: ParagraphResult['tier']): ParagraphResult {
  const prov = {
    paragraphId: `old-${ordinal}`,
    articleId: 'a',
    siteName: 'Fenwick Wire',
    title: 'Fire guts Port Alder warehouse',
    url: 'https://fenwick.example/fire',
    readAt: Date.now() - 6 * 60_000,
    snippet: 'At least 40 firefighters were sent',
  };
  return {
    ordinal,
    tier,
    fingerprint: `fp-${ordinal}`,
    matchKind: tier === 'new' ? null : 'wording',
    provenance: tier === 'new' ? null : prov,
    drift: [],
  };
}

const data = (tiers: ParagraphResult['tier'][]) => ({
  paragraphs: tiers.map((t, i) => result(i, t)),
  summary: { total: tiers.length, new: 0, seen: 0, similar: 0, changed: 0 },
  degraded: false,
  storyId: null,
  previouslyOn: null,
});

function make(keys = true) {
  const feedback = vi.fn().mockResolvedValue(undefined);
  const overlay = new Overlay(
    document,
    { fadeStrength: 'standard', dissolve: false, keys },
    { feedback, openApp: vi.fn(), hiddenStories: new Set(), saveHidden: vi.fn() },
  );
  return { overlay, feedback };
}

const blocks = (els: HTMLElement[]) => els.map((element, ordinal) => ({ ordinal, element }));

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('fade levels (AC8.1)', () => {
  it.each([
    ['light', '#ffffff', '#121212'],
    ['dark', '#121212', '#e6e6e6'],
    ['tinted', '#f4ecd8', '#3b2f1e'],
  ])('lands seen on 4.6:1 and similar on 7:1 on a %s page', (_n, bg, ink) => {
    const [el] = page(bg, ink) as [HTMLElement];
    const bgc = parseCssColor(bg)!;
    const inkc = parseCssColor(ink)!;
    const seen = fadeFor(el, 'seen', 'standard');
    const sim = fadeFor(el, 'similar', 'standard');
    const cs = contrastRatio(blend(inkc, bgc, seen.opacity), bgc);
    const cm = contrastRatio(blend(inkc, bgc, sim.opacity), bgc);
    expect(cs).toBeGreaterThan(4.4);
    expect(cs).toBeLessThan(4.8);
    expect(cm).toBeGreaterThan(6.7);
    expect(cm).toBeLessThan(7.3);
  });

  it('picks light or dark overlay tokens from the article background, never the OS', () => {
    const [a] = page('#ffffff', '#121212') as [HTMLElement];
    expect(themeOf(a)).toBe('light');
    const [b] = page('#121212', '#e6e6e6') as [HTMLElement];
    expect(themeOf(b)).toBe('dark');
  });
});

describe('painting', () => {
  it('fades seen and similar, leaves new and changed untouched, and hides nothing (AC8.2)', async () => {
    const els = page();
    const { overlay } = make();
    await overlay.addSection('k', blocks(els), data(['seen', 'similar', 'new', 'changed', 'seen']));
    await new Promise((r) => setTimeout(r, 30));
    const op = els.map((e) => e.style.opacity);
    expect(Number(op[0])).toBeLessThan(1);
    expect(Number(op[1])).toBeLessThan(1);
    expect(op[2]).toBe('');
    expect(op[3]).toBe('');
    for (const e of els) {
      expect(e.style.display).not.toBe('none');
      expect(e.hasAttribute('hidden')).toBe(false);
    }
    // Similar is lighter than seen.
    expect(Number(op[1])).toBeGreaterThan(Number(op[0]));
    overlay.destroy();
  });

  it('puts one host element on the page and removes it, with every inline style, on teardown', async () => {
    const els = page();
    els[0]!.style.opacity = '0.9';
    const before = els.map((e) => e.getAttribute('style'));
    const { overlay } = make();
    await overlay.addSection('k', blocks(els), data(['seen', 'seen', 'new', 'new', 'seen']));
    expect(document.querySelectorAll(`[${OVERLAY_ATTR}]`)).toHaveLength(1);
    overlay.destroy();
    expect(document.querySelectorAll(`[${OVERLAY_ATTR}]`)).toHaveLength(0);
    expect(els.map((e) => e.getAttribute('style'))).toEqual(before);
  });

  it('keeps a faded tier without a named source lit', async () => {
    const els = page();
    const d = data(['seen', 'new', 'new', 'new', 'new']);
    d.paragraphs[0] = { ...d.paragraphs[0]!, provenance: null };
    const { overlay } = make();
    await overlay.addSection('k', blocks(els), d);
    expect(els[0]!.style.opacity).toBe('');
    expect(overlay.counts().new).toBe(5);
    overlay.destroy();
  });

  it('counts the lit paragraphs for the pill and badge', async () => {
    const els = page();
    const { overlay } = make();
    await overlay.addSection('k', blocks(els), data(['seen', 'similar', 'new', 'changed', 'seen']));
    expect(overlay.counts()).toMatchObject({ total: 5, new: 1, seen: 2, similar: 1, changed: 1 });
    overlay.destroy();
  });
});

describe('keyboard (AC12.1)', () => {
  async function ready(keys = true) {
    const els = page();
    const { overlay, feedback } = make(keys);
    await overlay.addSection('k', blocks(els), data(['seen', 'new', 'seen', 'changed', 'seen']));
    return { els, overlay, feedback };
  }
  const press = (key: string, target: EventTarget = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));

  it('N folds runs of old paragraphs to a hairline and back, restoring every inline style', async () => {
    const { els, overlay } = await ready();
    await new Promise((r) => setTimeout(r, 30));
    const before = els.map((e) => e.getAttribute('style'));
    press('n');
    expect(overlay.isFolded).toBe(true);
    expect(els[0]!.style.height).toBe('1px');
    expect(els[1]!.style.height).toBe('');
    press('n');
    expect(overlay.isFolded).toBe(false);
    expect(els.map((e) => e.getAttribute('style'))).toEqual(before);
    overlay.destroy();
  });

  it('J and K move focus between new and changed paragraphs only', async () => {
    const { els, overlay } = await ready();
    press('j');
    expect(document.activeElement).toBe(els[1]);
    press('j');
    expect(document.activeElement).toBe(els[3]);
    press('k');
    expect(document.activeElement).toBe(els[1]);
    overlay.destroy();
    expect(els[1]!.hasAttribute('tabindex')).toBe(false);
  });

  it('ignores keys while an input has focus, and with modifiers', async () => {
    const { overlay } = await ready();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    press('n', input);
    press('j', input);
    expect(overlay.isFolded).toBe(false);
    expect(document.activeElement).toBe(input);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }),
    );
    expect(overlay.isFolded).toBe(false);
    overlay.destroy();
  });

  it('does nothing when the keys setting is off', async () => {
    const { overlay } = await ready(false);
    press('n');
    expect(overlay.isFolded).toBe(false);
    overlay.destroy();
  });
});

describe('locating the changed token', () => {
  it('finds a number, a word and a phrase in the live DOM across markup', () => {
    const p = document.createElement('p');
    p.innerHTML =
      'About <b>14</b> people were treated, and the road   reopened on  <i>Tuesday</i> morning.';
    document.body.append(p);
    expect(findToken(p, '14')?.toString()).toBe('14');
    expect(findToken(p, 'Tuesday')?.toString()).toBe('Tuesday');
    expect(findToken(p, 'road reopened')?.toString()).toBe('road   reopened');
    expect(findToken(p, 'closed')).toBeNull();
  });

  it('matches whole words only and prefers the occurrence nearest the hint', () => {
    const p = document.createElement('p');
    p.textContent = 'A 12 note, then 112 here, and later 12 again.';
    document.body.append(p);
    const first = findToken(p, '12', 0)!;
    const last = findToken(p, '12', 1)!;
    expect(first.startOffset).toBeLessThan(last.startOffset);
    expect(findToken(p, '11')).toBeNull();
  });
});
