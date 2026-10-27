/**
 * Lazy, idle-unloading embedder wrapper (SPEC F5): nothing loads until the first article needs
 * it, and the model is released after `idleMs` (default 5 min) with no requests. Pure scheduling
 * logic: timers and the model factory are injected, so it is unit-tested without a model.
 */
import type { Embedder } from '../engine/embedder';

export const IDLE_UNLOAD_MS = 5 * 60_000;

export interface DisposableEmbedder extends Embedder {
  dispose(): Promise<void> | void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const REAL_TIMERS: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface LazyEmbedderOptions {
  create: () => Promise<DisposableEmbedder>;
  idleMs?: number;
  timers?: Timers;
  /** Called after the model was released because of idleness. */
  onUnload?: () => void;
  /** Called after the model finished loading. */
  onLoad?: (embedder: DisposableEmbedder) => void;
}

export class LazyEmbedder implements Embedder {
  private inner: DisposableEmbedder | null = null;
  private loading: Promise<DisposableEmbedder> | null = null;
  private inflight = 0;
  private timer: unknown = null;
  private readonly idleMs: number;
  private readonly timers: Timers;

  constructor(private readonly opts: LazyEmbedderOptions) {
    this.idleMs = opts.idleMs ?? IDLE_UNLOAD_MS;
    this.timers = opts.timers ?? REAL_TIMERS;
  }

  get id(): string {
    return this.inner?.id ?? 'lazy-unloaded';
  }

  get loaded(): boolean {
    return this.inner !== null;
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private armTimer(): void {
    this.cancelTimer();
    if (this.inflight > 0) return;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.unload().then((did) => {
        if (did) this.opts.onUnload?.();
      });
    }, this.idleMs);
  }

  private async ensure(): Promise<DisposableEmbedder> {
    if (this.inner) return this.inner;
    this.loading ??= this.opts.create().then(
      (e) => {
        this.inner = e;
        this.loading = null;
        this.opts.onLoad?.(e);
        return e;
      },
      (err: unknown) => {
        // A failed load is retried on the next request.
        this.loading = null;
        throw err;
      },
    );
    return this.loading;
  }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    this.cancelTimer();
    this.inflight++;
    try {
      const e = await this.ensure();
      return await e.embed(texts);
    } finally {
      this.inflight--;
      if (this.inner) this.armTimer();
    }
  }

  /** Releases the model now. Returns false when nothing was loaded or a request is running. */
  async unload(): Promise<boolean> {
    if (!this.inner || this.inflight > 0) return false;
    this.cancelTimer();
    const e = this.inner;
    this.inner = null;
    await e.dispose();
    return true;
  }

  /** Releases the model and cancels any timer (extension shutdown). */
  async dispose(): Promise<void> {
    this.cancelTimer();
    await this.unload();
  }
}
