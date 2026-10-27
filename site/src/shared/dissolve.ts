/**
 * The signature moment: the dissolve (DESIGN.md "Signature moment: the dissolve", frame by frame).
 * One Web Animations timeline that drives real DOM, used by the landing hero and the web app.
 *
 *   t = 0            pill enters (200 ms), its first number is the paragraph total
 *   0 .. 160         faded paragraphs start in document order, stagger = min(16, 160 / (n - 1)) ms
 *   start + 0..240   opacity 1 -> solved floor (--ease-out-soft); the pill number counts down by one
 *   start + 180..330 the provenance tag fades in (150 ms)
 *   ~400             "Only" fades into the pill (150 ms)
 *   420 .. 1620      drift highlight pulses twice (0 -> .9 -> .35 -> .9 -> rest); the chip rises
 *
 * Any pointer, key or wheel input finishes the sequence at once (input always wins). Reduced
 * motion: everything lands together in 150 ms with no pulse. `?capture` exposes
 * `window.__frame(i, fps)`, which seeks every animation so frames are deterministic.
 *
 * Markup contract (see product.css): rows `.on-row` hold `.on-p[data-a]` (faded paragraphs carry
 * their solved opacity), an optional `.on-tag`, and optional `.on-chip` / `.on-rect`; the pill is
 * `[data-pill]` with `[data-pill-n]` (count) and `[data-pill-only]`.
 */

export interface Dissolver {
  /** Resets to full ink, then plays the full sequence (or the 150 ms reduced version). */
  play(): void;
  /** Jumps to the final frame. */
  finish(): void;
  /** Puts the root in the start state (full ink, no tags, pill hidden). */
  reset(): void;
  readonly playing: boolean;
}

export interface DissolveOptions {
  reduced?: boolean;
  onDone?: () => void;
}

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_OUT_SOFT = 'cubic-bezier(0.25, 1, 0.5, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
const TOTAL_MS = 1700;
const CLASS = 'is-dissolving';

declare global {
  interface Window {
    __frame?: (i: number, fps?: number) => void;
  }
}

export function createDissolver(root: HTMLElement, opts: DissolveOptions = {}): Dissolver {
  let anims: Animation[] = [];
  let clock: Animation | null = null;
  let raf = 0;
  let playing = false;
  let detach: (() => void) | null = null;

  const rows = (): HTMLElement[] =>
    [...root.querySelectorAll<HTMLElement>('.on-row')].filter((r) =>
      r.querySelector('.on-p[data-a]'),
    );
  const pill = root.querySelector<HTMLElement>('[data-pill]');
  const pillN = root.querySelector<HTMLElement>('[data-pill-n]');
  const pillOnly = root.querySelector<HTMLElement>('[data-pill-only]');
  const total = Number(pill?.dataset['total'] ?? '0');
  const lit = Number(pill?.dataset['lit'] ?? '0');

  const staggerOf = (n: number): number => (n > 1 ? Math.min(16, 160 / (n - 1)) : 0);

  function setCount(t: number): void {
    if (!pillN) return;
    const faded = rows();
    const step = staggerOf(faded.length);
    let started = 0;
    faded.forEach((_, i) => {
      if (i * step <= t) started++;
    });
    pillN.textContent = String(Math.max(lit, total - started));
  }

  function clear(): void {
    cancelAnimationFrame(raf);
    for (const a of anims) a.cancel();
    anims = [];
    clock?.cancel();
    clock = null;
    detach?.();
    detach = null;
    playing = false;
  }

  function reset(): void {
    clear();
    root.classList.add(CLASS);
    root.classList.remove('is-reduced-play');
    if (pillN) pillN.textContent = String(total);
    for (const m of root.querySelectorAll<HTMLElement>('.on-mark')) m.dataset['state'] = 'start';
  }

  function finish(): void {
    const wasPlaying = playing;
    clear();
    root.classList.remove(CLASS);
    root.classList.remove('is-reduced-play');
    if (pillN) pillN.textContent = String(lit);
    for (const m of root.querySelectorAll<HTMLElement>('.on-mark')) m.dataset['state'] = 'rest';
    if (wasPlaying) opts.onDone?.();
  }

  function listenForInput(): void {
    const stop = (): void => finish();
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, stop, { once: true, passive: true });
    detach = () => {
      for (const e of events) window.removeEventListener(e, stop);
    };
  }

  const add = (
    el: Element | null,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ): void => {
    if (!el) return;
    anims.push(el.animate(keyframes, { fill: 'both', ...options }));
  };

  function playFull(): void {
    reset();
    playing = true;
    const faded = rows();
    const step = staggerOf(faded.length);

    faded.forEach((row, i) => {
      const start = i * step;
      const p = row.querySelector<HTMLElement>('.on-p[data-a]');
      const a = Number(p?.dataset['a'] ?? '1');
      add(p, [{ opacity: 1 }, { opacity: a }], {
        delay: start,
        duration: 240,
        easing: EASE_OUT_SOFT,
      });
      add(row.querySelector('.on-tag'), [{ opacity: 0 }, { opacity: 1 }], {
        delay: start + 180,
        duration: 150,
        easing: EASE_OUT,
      });
    });

    add(
      pill,
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 200, easing: EASE_OUT },
    );
    add(pillOnly, [{ opacity: 0 }, { opacity: 1 }], {
      delay: 400,
      duration: 150,
      easing: EASE_OUT,
    });

    for (const chip of root.querySelectorAll('.on-chip')) {
      add(
        chip,
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { delay: 520, duration: 200, easing: EASE_OUT },
      );
    }
    for (const rect of root.querySelectorAll('.on-rect')) {
      const T = 1620;
      add(
        rect,
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: 420 / T, easing: EASE_OUT },
          { opacity: 0.9, offset: 600 / T, easing: EASE_IN_OUT },
          { opacity: 0.35, offset: 1020 / T, easing: EASE_OUT },
          { opacity: 0.9, offset: 1200 / T, easing: EASE_IN_OUT },
          { opacity: 0, offset: 1 },
        ],
        { duration: T },
      );
    }

    clock = new Animation(new KeyframeEffect(null, null, { duration: TOTAL_MS }));
    clock.play();
    const tick = (): void => {
      if (!clock) return;
      setCount(Number(clock.currentTime ?? 0));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    clock.onfinish = () => finish();
    listenForInput();
  }

  /** Reduced motion: everything lands together in 150 ms, no pulse, final copy immediately. */
  function playReduced(): void {
    reset();
    root.classList.add('is-reduced-play');
    if (pillN) pillN.textContent = String(lit);
    for (const row of rows()) {
      add(
        row.querySelector('.on-p[data-a]'),
        [
          { opacity: 1 },
          { opacity: Number(row.querySelector<HTMLElement>('.on-p')?.dataset['a'] ?? '1') },
        ],
        {
          duration: 150,
        },
      );
      add(row.querySelector('.on-tag'), [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
    }
    for (const el of root.querySelectorAll('.on-chip')) {
      add(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
    }
    playing = true;
    const done = anims[0]?.finished;
    if (done) void done.then(finish, finish);
    else finish();
  }

  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('capture')) {
    window.__frame = (i: number, fps = 30): void => {
      if (!playing) playFull();
      cancelAnimationFrame(raf);
      detach?.();
      const t = (i * 1000) / fps;
      for (const a of anims) {
        a.pause();
        a.currentTime = t;
      }
      setCount(t);
      if (t >= TOTAL_MS)
        for (const m of root.querySelectorAll<HTMLElement>('.on-mark')) m.dataset['state'] = 'rest';
    };
  }

  return {
    play: () => (opts.reduced ? playReduced() : playFull()),
    finish,
    reset,
    get playing() {
      return playing;
    },
  };
}
