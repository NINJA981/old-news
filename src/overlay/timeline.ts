/**
 * The dissolve as one seekable timeline of Web Animations (DESIGN.md "Signature moment").
 * Playing it is real WAAPI; `seek(t)` pauses everything at an exact time, which is how the
 * playground and landing page capture deterministic frames (`window.__frame`).
 */
import { countAt } from './geometry';

export class Timeline {
  private readonly anims: Animation[] = [];
  private readonly starts: number[] = [];
  private raf = 0;
  private t0 = 0;
  private done = false;
  private readonly finishers: (() => void)[] = [];
  private endCallbacks: (() => void)[] = [];
  private readonly marks: { t: number; fn: () => void; fired: boolean }[] = [];
  private total = 0;
  private onCount: (n: number) => void = () => undefined;

  /** Total length in ms (last animation end). */
  duration = 0;

  add(anim: Animation | null, end: number, onFinish?: () => void): void {
    if (!anim) return;
    this.anims.push(anim);
    this.duration = Math.max(this.duration, end);
    if (onFinish) this.finishers.push(onFinish);
  }

  /** Registers when a faded paragraph's number tick happens. */
  countdown(total: number, starts: readonly number[], onCount: (n: number) => void): void {
    this.total = total;
    this.starts.push(...starts);
    this.onCount = onCount;
    onCount(total);
  }

  /** Runs `fn` once the timeline reaches `t` ms (also when seeking past it). */
  at(t: number, fn: () => void): void {
    this.marks.push({ t, fn, fired: false });
    this.duration = Math.max(this.duration, t);
  }

  private fire(t: number): void {
    for (const m of this.marks) {
      if (!m.fired && m.t <= t) {
        m.fired = true;
        m.fn();
      }
    }
  }

  onEnd(fn: () => void): void {
    this.endCallbacks.push(fn);
  }

  get finished(): boolean {
    return this.done;
  }

  play(now: () => number = () => performance.now()): void {
    this.t0 = now();
    const step = (): void => {
      if (this.done) return;
      const t = now() - this.t0;
      this.onCount(countAt(t, this.total, this.starts));
      this.fire(t);
      if (t >= this.duration) this.complete();
      else this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Jumps every animation to its end state. Input always wins (principle P6). */
  finish(): void {
    if (this.done) return;
    for (const a of this.anims) {
      try {
        a.finish();
      } catch {
        // An animation that cannot finish (infinite) is simply cancelled on complete.
      }
    }
    this.complete();
  }

  /** Pauses at time `t` ms and shows that exact frame. */
  seek(t: number): void {
    cancelAnimationFrame(this.raf);
    for (const a of this.anims) {
      if (a.playState !== 'finished' || t < this.duration) {
        a.pause();
        a.currentTime = t;
      }
    }
    this.onCount(countAt(t, this.total, this.starts));
    this.fire(t);
    if (t >= this.duration && !this.done) this.complete();
  }

  private complete(): void {
    if (this.done) return;
    this.done = true;
    cancelAnimationFrame(this.raf);
    this.onCount(countAt(Infinity, this.total, this.starts));
    this.fire(Infinity);
    for (const f of this.finishers) f();
    for (const a of this.anims) a.cancel();
    for (const e of this.endCallbacks) e();
  }

  cancel(): void {
    this.done = true;
    cancelAnimationFrame(this.raf);
    for (const a of this.anims) a.cancel();
  }
}
