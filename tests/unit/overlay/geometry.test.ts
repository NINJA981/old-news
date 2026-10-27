import { describe, expect, it } from 'vitest';
import {
  CHIP_H,
  countAt,
  countTicks,
  DISSOLVE,
  overlaps,
  placeChips,
  placeTag,
  planDissolve,
  pulseFrames,
  shouldDissolve,
  stagger,
} from '../../../src/overlay/geometry';

const para = (left: number, right: number) => ({ left, right, top: 100, bottom: 160 });

describe('tag placement (DESIGN.md provenance-tag)', () => {
  it('uses the right gutter when it holds the tag', () => {
    expect(placeTag(para(380, 1060), 150, 1440)).toEqual({ mode: 'right', x: 1072 });
  });

  it('needs at least 140 px, and room for the tag itself', () => {
    // 1060 + 12 = 1072; at 1200 wide only 112 px are left, so the right gutter is refused.
    expect(placeTag(para(380, 1060), 150, 1200).mode).not.toBe('right');
    // A tag wider than the gutter does not fit even when the gutter passes 140.
    expect(placeTag(para(100, 600), 400, 800).mode).not.toBe('right');
  });

  it('falls to the left gutter, then to a dot, then to hover-only', () => {
    expect(placeTag(para(300, 1000), 160, 1100)).toEqual({ mode: 'left', x: 128 });
    expect(placeTag(para(40, 340), 160, 375)).toEqual({ mode: 'dot', x: 20 });
    expect(placeTag(para(8, 360), 160, 375).mode).toBe('hover');
  });

  it('skips a gutter that other page content occupies', () => {
    const busyRight = (x: number) => x < 500;
    expect(placeTag(para(300, 700), 160, 1440, busyRight).mode).toBe('left');
    expect(placeTag(para(300, 700), 160, 1440, () => false).mode).toBe('dot');
  });
});

describe('dissolve schedule (DESIGN.md frame table)', () => {
  it('staggers min(16, 160 / (n - 1)) ms', () => {
    expect(stagger(19)).toBeCloseTo(8.89, 2);
    expect(stagger(2)).toBe(16);
    expect(stagger(30)).toBeCloseTo(160 / 29, 5);
    expect(stagger(1)).toBe(0);
    expect(stagger(0)).toBe(0);
  });

  it('starts the first paragraph at 0 and the last at 160 ms for 11 or more', () => {
    const steps = planDissolve(
      Array.from({ length: 19 }, (_, index) => ({ index, inRange: true })),
    );
    expect(steps[0]?.start).toBe(0);
    expect(steps[18]?.start).toBeCloseTo(160, 5);
  });

  it('sets paragraphs outside the viewport plus one screen instantly', () => {
    const steps = planDissolve([
      { index: 0, inRange: true },
      { index: 1, inRange: false },
      { index: 2, inRange: true },
    ]);
    expect(steps.map((s) => s.animate)).toEqual([true, false, true]);
    expect(steps[1]?.start).toBe(0);
    expect(steps[2]?.start).toBe(16);
  });

  it('plays only for 3 or more faded paragraphs in range, when enabled and motion is allowed', () => {
    expect(shouldDissolve(3, true, false)).toBe(true);
    expect(shouldDissolve(2, true, false)).toBe(false);
    expect(shouldDissolve(9, false, false)).toBe(false);
    expect(shouldDissolve(9, true, true)).toBe(false);
  });

  it('counts the pill down by one at each paragraph start', () => {
    const starts = [0, 8, 16];
    expect(countAt(-1, 23, starts)).toBe(23);
    // Frame 0 is the full-ink page: nothing has ticked yet.
    expect(countAt(0, 23, starts)).toBe(23);
    expect(countAt(1, 23, starts)).toBe(22);
    expect(countAt(9, 23, starts)).toBe(21);
    expect(countAt(Infinity, 23, starts)).toBe(20);
  });

  it('ticks instantly-set paragraphs inside the settle window, after the last animated start', () => {
    const steps = planDissolve([
      { index: 0, inRange: true },
      { index: 1, inRange: true },
      { index: 2, inRange: true },
      { index: 3, inRange: false },
      { index: 4, inRange: false },
    ]);
    const ticks = countTicks(steps);
    expect(ticks).toHaveLength(5);
    expect(ticks.slice(0, 3)).toEqual([0, 16, 32]);
    for (const t of ticks.slice(3)) {
      expect(t).toBeGreaterThan(32);
      expect(t).toBeLessThan(DISSOLVE.settle);
    }
    // Deterministic: the same plan gives the same ticks.
    expect(countTicks(steps)).toEqual(ticks);
    expect(countAt(0, 23, ticks)).toBe(23);
    expect(countAt(DISSOLVE.settle, 23, ticks)).toBe(18);
  });

  it('pulses twice in 1.2 s: 0.9, 0.35, 0.9, then rest', () => {
    const len = DISSOLVE.pulseEnd - DISSOLVE.pulseStart;
    expect(len).toBe(1200);
    const f = pulseFrames(0);
    expect(f.map(([, o]) => o)).toEqual([0, 0.9, 0.35, 0.9, 0]);
    expect(f.map(([t]) => Math.round(t * len))).toEqual([0, 180, 600, 780, 1200]);
  });
});

describe('drift chip placement (never over text)', () => {
  const token = { left: 460, right: 480, top: 338, bottom: 360 };
  const p = { left: 380, right: 1060, top: 334, bottom: 420 };

  it('sits above the token when the gap to the line above holds it, lifted at most 6 px', () => {
    const r = placeChips(token, p, [240], { above: 40, below: 0 }, 1440);
    expect(r.mode).toBe('above');
    expect(r.boxes[0]).toEqual({ x: 460, y: 338 - 6 - CHIP_H });
    // A tighter gap lifts it less, keeping CHIP_CLEAR px from the text above.
    const tight = placeChips(token, p, [240], { above: 26, below: 0 }, 1440);
    expect(tight.mode).toBe('above');
    expect(tight.boxes[0]?.y).toBe(338 - 3 - CHIP_H);
  });

  it('moves to the right gutter, level with the token line, when the line above is too close', () => {
    const r = placeChips(token, p, [240, 200], { above: 7, below: 7 }, 1440);
    expect(r.mode).toBe('right');
    expect(r.boxes[0]).toEqual({ x: 1072, y: 339 });
    expect(r.boxes[1]).toEqual({ x: 1072, y: 339 + CHIP_H + 6 });
  });

  it('uses the gap below, then hover-only, when there is no gutter', () => {
    const narrow = { left: 24, right: 351, top: 334, bottom: 420 };
    const t = { left: 100, right: 120, top: 396, bottom: 418 };
    expect(placeChips(t, narrow, [240], { above: 7, below: 40 }, 375).mode).toBe('below');
    expect(placeChips(t, narrow, [240], { above: 7, below: 7 }, 375).mode).toBe('hover');
  });

  it('keeps a chip row inside the viewport', () => {
    const t = { left: 300, right: 320, top: 338, bottom: 360 };
    const r = placeChips(t, p, [240], { above: 40, below: 0 }, 375);
    expect(r.boxes[0]?.x).toBe(375 - 8 - 240);
  });

  it('detects overlap with the pill', () => {
    const pill = { left: 1100, right: 1424, top: 848, bottom: 884 };
    expect(overlaps({ left: 1072, right: 1200, top: 850, bottom: 870 }, pill)).toBe(true);
    expect(overlaps({ left: 1072, right: 1200, top: 800, bottom: 820 }, pill)).toBe(false);
  });
});
