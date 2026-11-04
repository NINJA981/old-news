import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBatcher } from '../../../src/extract/batcher';

describe('mutation batcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flushes on schedule even when mutations never stop (no debounce starvation)', () => {
    const flushed: number[][] = [];
    const b = createBatcher<number>(150, 500, (items) => flushed.push(items));
    // A ticker that mutates every 50 ms for one second.
    for (let t = 0; t < 1000; t += 50) {
      b.push([t]);
      vi.advanceTimersByTime(50);
    }
    // Batches went out while the ticker was still running, not only after it stopped.
    expect(flushed.length).toBeGreaterThanOrEqual(6);
    vi.advanceTimersByTime(150);
    expect(flushed.flat()).toHaveLength(20);
  });

  it('keeps at most `max` items per batch', () => {
    const flushed: string[][] = [];
    const b = createBatcher<string>(150, 3, (items) => flushed.push(items));
    b.push(['a', 'b']);
    b.push(['c', 'd', 'e']);
    vi.advanceTimersByTime(150);
    expect(flushed).toEqual([['a', 'b', 'c']]);
    b.push(['f']);
    vi.advanceTimersByTime(150);
    expect(flushed[1]).toEqual(['f']);
  });

  it('cancel drops pending items and the timer', () => {
    const flush = vi.fn();
    const b = createBatcher<number>(150, 10, flush);
    b.push([1]);
    b.cancel();
    vi.advanceTimersByTime(1000);
    expect(flush).not.toHaveBeenCalled();
  });
});
