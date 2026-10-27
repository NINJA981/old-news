/**
 * Read tracking (SPEC F4, AC4.1). Pure state machine: the caller feeds visibility ratios and
 * page-activity changes with timestamps (from IntersectionObserver and visibility/focus events),
 * and asks which paragraphs became "read".
 *
 * A paragraph counts as read once >= 60% of it has been visible, in a focused and visible tab,
 * for a cumulative max(1.2 s, words / 6 s), capped at 6 s.
 */

export const VISIBLE_RATIO = 0.6;
export const MIN_DWELL_MS = 1200;
export const MAX_DWELL_MS = 6000;
export const WORDS_PER_SECOND = 6;

export function requiredDwellMs(words: number): number {
  return Math.min(MAX_DWELL_MS, Math.max(MIN_DWELL_MS, (words / WORDS_PER_SECOND) * 1000));
}

interface ParaState {
  required: number;
  accumulated: number;
  visible: boolean;
  read: boolean;
}

export class DwellTracker {
  private readonly paras = new Map<number, ParaState>();
  private active: boolean;
  /** Time up to which accumulation has been settled. */
  private settledAt: number;
  private readonly pending: number[] = [];

  constructor(words: ReadonlyMap<number, number>, now: number, active = true) {
    for (const [ordinal, w] of words) {
      this.paras.set(ordinal, {
        required: requiredDwellMs(w),
        accumulated: 0,
        visible: false,
        read: false,
      });
    }
    this.active = active;
    this.settledAt = now;
  }

  /** Adds visible time since the last settle to every currently counting paragraph. */
  private settle(now: number): void {
    const dt = Math.max(0, now - this.settledAt);
    this.settledAt = Math.max(this.settledAt, now);
    if (dt === 0 || !this.active) return;
    for (const [ordinal, p] of this.paras) {
      if (!p.visible || p.read) continue;
      p.accumulated += dt;
      if (p.accumulated >= p.required) {
        p.read = true;
        this.pending.push(ordinal);
      }
    }
  }

  /** Intersection ratio update for one paragraph. */
  setRatio(ordinal: number, ratio: number, now: number): void {
    const p = this.paras.get(ordinal);
    if (!p) return;
    this.settle(now);
    p.visible = ratio >= VISIBLE_RATIO;
  }

  /** The tab became visible+focused (true) or hidden/blurred (false). */
  setActive(active: boolean, now: number): void {
    this.settle(now);
    this.active = active;
  }

  /** Ordinals that became read since the last call, in the order they crossed the threshold. */
  takeRead(now: number): number[] {
    this.settle(now);
    return this.pending.splice(0, this.pending.length);
  }

  /** Marks paragraphs as already read (e.g. remembered earlier), so they are never reported. */
  markRead(ordinals: Iterable<number>): void {
    for (const o of ordinals) {
      const p = this.paras.get(o);
      if (p) p.read = true;
    }
  }

  isRead(ordinal: number): boolean {
    return this.paras.get(ordinal)?.read ?? false;
  }

  /** Adds a paragraph that appeared later (live-blog post, infinite scroll). */
  add(ordinal: number, words: number): void {
    if (this.paras.has(ordinal)) return;
    this.paras.set(ordinal, {
      required: requiredDwellMs(words),
      accumulated: 0,
      visible: false,
      read: false,
    });
  }
}
