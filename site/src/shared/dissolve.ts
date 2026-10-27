/**
 * The signature moment: the dissolve (DESIGN.md "Signature moment: the dissolve", frame by frame).
 * One Web Animations timeline that drives real DOM, used by the landing hero and the web app.
 *
 * The schedule is not re-implemented here: start times, the stagger, the pill's countdown ticks and
 * the pulse keyframes come from the extension's own overlay maths (`src/overlay/geometry.ts`, via the
 * `@overlay` alias), so the site plays exactly the extension's timeline.
 *
 *   t = 0            pill enters (200 ms) reading "n of n": every paragraph is still in full ink
 *   0 .. 160         faded paragraphs start in document order, stagger = min(16, 160 / (n - 1)) ms
 *   start + 0..240   opacity 1 -> solved floor (--ease-out-soft); the pill number ticks down by one
 *   start + 180..330 the provenance tag fades in (150 ms)
 *   ~400             "Only" fades into the pill (150 ms)
 *   420 .. 1620      drift highlight pulses twice (0 -> .9 -> .35 -> .9 -> rest); the chip rises at 520
 *
 * Paragraphs that are not drawn (the hero shows the top of a 23-paragraph article) tick inside the
 * settle window, as the overlay does for paragraphs below the fold. The pill is locked to its
 * opening width, so it never resizes while the digits change.
 *
 * Any pointer, key or wheel input finishes the sequence at once (input always wins). Reduced
 * motion: everything lands together in 150 ms with no pulse and the final pill copy at once.
 * `?capture` exposes `window.__frame(i, fps)`, which seeks every animation so frames are deterministic.
 *
 * Markup contract (see product.css): rows `.on-row` hold `.on-p[data-a]` (faded paragraphs carry
 * their solved opacity), an optional `.on-tag`, optional `.on-chip` and `.on-mark > .on-rect`; the
 * pill is `[data-pill]` with `[data-pill-n]` (count) and `[data-pill-only]`. `data-offscreen` on the
 * root counts faded paragraphs of the article that are not in the DOM.
 */
import {
  DISSOLVE,
  countAt,
  countTicks,
  planDissolve,
  pulseFrames,
  type DissolveStep,
} from '@overlay/geometry';

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
const CLASS = 'is-dissolving';
const CHIP_STEP = 40;

declare global {
  interface Window {
    __frame?: (i: number, fps?: number) => void;
  }
}

export interface Schedule {
  steps: DissolveStep[];
  ticks: number[];
  onlyAt: number;
  end: number;
}

/** The whole timeline for `drawn` faded paragraphs in the DOM plus `offscreen` ones that are not. */
export function schedule(drawn: number, offscreen: number, chips: number): Schedule {
  const steps = planDissolve([
    ...Array.from({ length: drawn }, (_, index) => ({ index, inRange: true })),
    ...Array.from({ length: offscreen }, (_, k) => ({ index: drawn + k, inRange: false })),
  ]);
  const ticks = countTicks(steps);
  const lastStart = Math.max(0, ...steps.filter((s) => s.animate).map((s) => s.start));
  const onlyAt = Math.max(DISSOLVE.settle, lastStart + DISSOLVE.para);
  const chipsEnd = chips > 0 ? DISSOLVE.chipStart + (chips - 1) * CHIP_STEP + DISSOLVE.chipRise : 0;
  const end = Math.max(DISSOLVE.pulseEnd, chipsEnd, onlyAt + 150) + 80;
  return { steps, ticks, onlyAt, end };
}

const captured: ((i: number, fps?: number) => void)[] = [];

export function createDissolver(root: HTMLElement, opts: DissolveOptions = {}): Dissolver {
  let anims: Animation[] = [];
  let clock: Animation | null = null;
  let raf = 0;
  let playing = false;
  let detach: (() => void) | null = null;
  let plan: Schedule | null = null;

  const rows = (): HTMLElement[] =>
    [...root.querySelectorAll<HTMLElement>('.on-row')].filter((r) =>
      r.querySelector('.on-p[data-a]'),
    );
  const pill = root.querySelector<HTMLElement>('[data-pill]');
  const pillN = root.querySelector<HTMLElement>('[data-pill-n]');
  const pillOnly = root.querySelector<HTMLElement>('[data-pill-only]');
  const total = Number(pill?.dataset['total'] ?? '0');
  const lit = Number(pill?.dataset['lit'] ?? '0');
  const offscreen = Number(root.dataset['offscreen'] ?? '0');

  function setCount(t: number): void {
    if (!pillN || !plan) return;
    pillN.textContent = String(Math.max(lit, countAt(t, total, plan.ticks)));
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

  function marks(state: 'start' | 'rest'): void {
    for (const m of root.querySelectorAll<HTMLElement>('.on-mark')) m.dataset['state'] = state;
  }

  /** The opening frame is the widest the countdown gets, so the capsule is locked to it. */
  function lockPill(): void {
    if (!pill) return;
    pill.style.minWidth = '';
    const w = pill.offsetWidth;
    if (w > 0) pill.style.minWidth = `${w}px`;
  }

  function reset(): void {
    clear();
    root.classList.add(CLASS);
    root.classList.remove('is-reduced-play');
    if (pillN) pillN.textContent = String(total);
    marks('start');
  }

  function finish(): void {
    const wasPlaying = playing;
    clear();
    root.classList.remove(CLASS);
    root.classList.remove('is-reduced-play');
    if (pillN) pillN.textContent = String(lit);
    marks('rest');
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
    lockPill();
    playing = true;
    const faded = rows();
    const chips = [...root.querySelectorAll('.on-chip')];
    plan = schedule(faded.length, offscreen, chips.length);
    const { steps, onlyAt, end } = plan;

    faded.forEach((row, i) => {
      const start = steps[i]?.start ?? 0;
      const p = row.querySelector<HTMLElement>('.on-p[data-a]');
      const a = Number(p?.dataset['a'] ?? '1');
      add(p, [{ opacity: 1 }, { opacity: a }], {
        delay: start,
        duration: DISSOLVE.para,
        easing: EASE_OUT_SOFT,
      });
      add(row.querySelector('.on-tag'), [{ opacity: 0 }, { opacity: 1 }], {
        delay: start + DISSOLVE.tagLead,
        duration: DISSOLVE.tagFade,
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
      delay: onlyAt,
      duration: 150,
      easing: EASE_OUT,
    });

    chips.forEach((chip, i) => {
      add(
        chip,
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          delay: DISSOLVE.chipStart + i * CHIP_STEP,
          duration: DISSOLVE.chipRise,
          easing: EASE_OUT,
        },
      );
    });
    // The highlight is off in the start frame, so the pulse settles at full strength (rest 1) and
    // hands over to the mark's own background with no visible step.
    const pulse = pulseFrames(1).map(([offset, opacity]) => ({ offset, opacity }));
    for (const rect of root.querySelectorAll('.on-rect')) {
      add(rect, pulse, {
        delay: DISSOLVE.pulseStart,
        duration: DISSOLVE.pulseEnd - DISSOLVE.pulseStart,
        easing: EASE_IN_OUT,
      });
    }

    clock = new Animation(new KeyframeEffect(null, null, { duration: end }));
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
    const fade = { duration: DISSOLVE.reduced };
    for (const row of rows()) {
      const p = row.querySelector<HTMLElement>('.on-p[data-a]');
      add(p, [{ opacity: 1 }, { opacity: Number(p?.dataset['a'] ?? '1') }], fade);
      add(row.querySelector('.on-tag'), [{ opacity: 0 }, { opacity: 1 }], fade);
    }
    for (const el of root.querySelectorAll('.on-chip, .on-rect')) {
      add(el, [{ opacity: 0 }, { opacity: 1 }], fade);
    }
    playing = true;
    const done = anims[0]?.finished;
    if (done) void done.then(finish, finish);
    else finish();
  }

  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('capture')) {
    // Every dissolver on the page is seeked together (the hero and the drift beat share one clock).
    captured.push((i: number, fps = 30): void => {
      if (!playing) playFull();
      cancelAnimationFrame(raf);
      detach?.();
      const t = (i * 1000) / fps;
      for (const a of anims) {
        a.pause();
        a.currentTime = t;
      }
      setCount(t);
      if (plan && t >= plan.end) marks('rest');
    });
    window.__frame = (i: number, fps?: number): void => {
      for (const f of captured) f(i, fps);
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
