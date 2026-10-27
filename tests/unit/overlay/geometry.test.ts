import { describe, expect, it } from 'vitest';
import {
  countAt,
  DISSOLVE,
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
    expect(countAt(0, 23, starts)).toBe(22);
    expect(countAt(9, 23, starts)).toBe(21);
    expect(countAt(Infinity, 23, starts)).toBe(20);
  });

  it('pulses twice in 1.2 s: 0.9, 0.35, 0.9, then rest', () => {
    const len = DISSOLVE.pulseEnd - DISSOLVE.pulseStart;
    expect(len).toBe(1200);
    const f = pulseFrames(0);
    expect(f.map(([, o]) => o)).toEqual([0, 0.9, 0.35, 0.9, 0]);
    expect(f.map(([t]) => Math.round(t * len))).toEqual([0, 180, 600, 780, 1200]);
  });
});
