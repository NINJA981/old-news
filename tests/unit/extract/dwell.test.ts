import { describe, expect, it } from 'vitest';
import {
  DwellTracker,
  MAX_DWELL_MS,
  MIN_DWELL_MS,
  requiredDwellMs,
  VISIBLE_RATIO,
} from '../../../src/extract/dwell';

const words = (...n: number[]): Map<number, number> => new Map(n.map((w, i) => [i, w]));

describe('requiredDwellMs (SPEC F4)', () => {
  it('is max(1.2 s, words / 6 s) capped at 6 s', () => {
    expect(requiredDwellMs(0)).toBe(MIN_DWELL_MS);
    expect(requiredDwellMs(6)).toBe(1200); // 1 s of reading, floored to 1.2 s
    expect(requiredDwellMs(12)).toBe(2000);
    expect(requiredDwellMs(30)).toBe(5000);
    expect(requiredDwellMs(36)).toBe(MAX_DWELL_MS);
    expect(requiredDwellMs(500)).toBe(MAX_DWELL_MS);
  });
});

describe('DwellTracker (AC4.1)', () => {
  it('marks a paragraph read after its cumulative visible time', () => {
    const t = new DwellTracker(words(12), 0);
    t.setRatio(0, 1, 0);
    expect(t.takeRead(1999)).toEqual([]);
    expect(t.takeRead(2000)).toEqual([0]);
    expect(t.isRead(0)).toBe(true);
  });

  it('reports each paragraph once', () => {
    const t = new DwellTracker(words(12), 0);
    t.setRatio(0, 1, 0);
    expect(t.takeRead(5000)).toEqual([0]);
    expect(t.takeRead(9000)).toEqual([]);
  });

  it('needs at least 60% visible', () => {
    const t = new DwellTracker(words(12), 0);
    t.setRatio(0, VISIBLE_RATIO - 0.01, 0);
    expect(t.takeRead(10_000)).toEqual([]);
    t.setRatio(0, VISIBLE_RATIO, 10_000);
    expect(t.takeRead(12_000)).toEqual([0]);
  });

  it('accumulates across separate visits', () => {
    const t = new DwellTracker(words(12), 0);
    t.setRatio(0, 1, 0);
    t.setRatio(0, 0, 1000); // 1000 ms seen
    expect(t.takeRead(5000)).toEqual([]);
    t.setRatio(0, 1, 5000);
    expect(t.takeRead(5999)).toEqual([]);
    expect(t.takeRead(6000)).toEqual([0]);
  });

  it('does not count time while the tab is hidden or unfocused', () => {
    const t = new DwellTracker(words(12), 0);
    t.setRatio(0, 1, 0);
    t.setActive(false, 500);
    expect(t.takeRead(60_000)).toEqual([]);
    t.setActive(true, 60_000);
    expect(t.takeRead(61_499)).toEqual([]);
    expect(t.takeRead(61_500)).toEqual([0]);
  });

  it('starts inactive when the tab is not focused', () => {
    const t = new DwellTracker(words(12), 0, false);
    t.setRatio(0, 1, 0);
    expect(t.takeRead(30_000)).toEqual([]);
    t.setActive(true, 30_000);
    expect(t.takeRead(32_000)).toEqual([0]);
  });

  it('scrolling straight to the bottom in under a second stores nothing (AC4.2)', () => {
    const t = new DwellTracker(words(40, 40, 40), 0);
    for (const [i, at] of [
      [0, 0],
      [1, 250],
      [2, 500],
    ] as const) {
      t.setRatio(i, 1, at);
      t.setRatio(i, 0, at + 250);
    }
    expect(t.takeRead(900)).toEqual([]);
  });

  it('tracks several visible paragraphs independently, in threshold order', () => {
    const t = new DwellTracker(words(36, 6), 0);
    t.setRatio(0, 1, 0);
    t.setRatio(1, 1, 0);
    expect(t.takeRead(1200)).toEqual([1]);
    expect(t.takeRead(6000)).toEqual([0]);
  });

  it('ignores unknown ordinals and never reports markRead paragraphs', () => {
    const t = new DwellTracker(words(12), 0);
    t.setRatio(99, 1, 0);
    t.markRead([0]);
    t.setRatio(0, 1, 0);
    expect(t.takeRead(10_000)).toEqual([]);
    expect(t.isRead(0)).toBe(true);
  });

  it('accepts paragraphs that appear later (live blog, infinite scroll)', () => {
    const t = new DwellTracker(words(12), 0);
    t.add(7, 6);
    t.add(7, 600); // second add is ignored
    t.setRatio(7, 1, 100);
    expect(t.takeRead(1300)).toEqual([7]);
  });

  it('ignores time that runs backwards', () => {
    const t = new DwellTracker(words(12), 1000);
    t.setRatio(0, 1, 500);
    expect(t.takeRead(900)).toEqual([]);
  });
});
