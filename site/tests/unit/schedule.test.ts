import { describe, expect, it } from 'vitest';
import { DISSOLVE, countAt } from '@overlay/geometry';
import { schedule } from '../../src/shared/dissolve.ts';

describe('dissolve schedule (the extension overlay maths)', () => {
  it('reads n of n at frame 0 and reaches the real count before "Only" arrives', () => {
    // The hero: 5 faded paragraphs drawn, 14 more below, 23 total, 4 lit.
    const s = schedule(5, 14, 1);
    expect(s.ticks).toHaveLength(19);
    expect(countAt(0, 23, s.ticks)).toBe(23);
    expect(countAt(s.onlyAt, 23, s.ticks)).toBe(4);
    expect(s.onlyAt).toBeGreaterThanOrEqual(DISSOLVE.settle);
    expect(s.end).toBeGreaterThanOrEqual(DISSOLVE.pulseEnd);
  });
  it('counts down monotonically, one per tick', () => {
    const s = schedule(5, 14, 1);
    let prev = 23;
    for (let t = 0; t <= s.end; t += 5) {
      const n = countAt(t, 23, s.ticks);
      expect(n).toBeLessThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBe(4);
  });
  it('staggers drawn paragraphs by min(16, 160 / (n - 1)) ms', () => {
    const s = schedule(11, 0, 0);
    expect(s.steps[1]!.start).toBe(16);
    expect(schedule(21, 0, 0).steps[1]!.start).toBe(8);
  });
});
