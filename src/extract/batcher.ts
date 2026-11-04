/**
 * Collects items (mutation records) and flushes them at most once per `delayMs`. The first item
 * of a batch starts the timer and later items do not push it back, so a page that mutates
 * constantly (a ticker, a carousel, an ad refresh) still gets its batches handled. At most `max`
 * items are kept per batch; the rest are dropped, since a flush only needs the newly added nodes.
 */
export interface Batcher<T> {
  push(items: readonly T[]): void;
  /** Drops what is pending and stops the timer. */
  cancel(): void;
}

export interface Timers {
  set(fn: () => void, ms: number): number;
  clear(id: number): void;
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clear: (id) => clearTimeout(id),
};

export function createBatcher<T>(
  delayMs: number,
  max: number,
  flush: (items: T[]) => void,
  timers: Timers = defaultTimers,
): Batcher<T> {
  let pending: T[] = [];
  let timer: number | null = null;
  return {
    push(items) {
      for (const item of items) {
        if (pending.length >= max) break;
        pending.push(item);
      }
      if (timer !== null) return;
      timer = timers.set(() => {
        timer = null;
        const batch = pending;
        pending = [];
        flush(batch);
      }, delayMs);
    },
    cancel() {
      if (timer !== null) timers.clear(timer);
      timer = null;
      pending = [];
    },
  };
}
