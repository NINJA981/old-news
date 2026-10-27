import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/product.css';
import '../styles/landing.css';
import { createDissolver } from '../shared/dissolve';
import { attachReader } from '../shared/reader';
import { watchChips } from '../shared/chips';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
/** Motion tiers (bible 11.4, CSS only): tier 0 = no autoplay (reduced motion, Save-Data, a phone with 2 GB or less). */
const tier0 = reduced || conn?.saveData === true || (memory !== undefined && memory <= 2);

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

// Drift chips start above their changed token where the row has room (chips.ts).
for (const id of ['#hero-rows', '#demo', '#drift-demo']) {
  const el = document.querySelector<HTMLElement>(id);
  if (el) watchChips(el);
}

// Hero: the dissolve plays once when the sheet is in view (after load and idle).
const heroSheet = $('#hero-sheet');
const replay = $<HTMLButtonElement>('#replay');
if (heroSheet) {
  const d = createDissolver(heroSheet, { reduced });
  const label = (k: 'play' | 'replay'): void => {
    if (replay)
      replay.textContent = replay.dataset[k === 'play' ? 'labelPlay' : 'labelReplay'] ?? '';
  };
  if (tier0) {
    // Poster only: the final frame is already in the HTML. Offer Play.
    heroSheet.classList.remove('hero-pre');
    label('play');
  } else {
    d.reset(); // full ink for one beat, as the third tab is when it opens
    heroSheet.classList.remove('hero-pre'); // same frame as the CSS opening state, so no flash
    let started = false;
    const start = (): void => {
      if (started) return;
      started = true;
      d.play();
    };
    const whenIdle = (cb: () => void): void => {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 2000 });
      else window.setTimeout(cb, 600);
    };
    const arm = (): void => {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            window.setTimeout(start, 250);
          }
        },
        { threshold: 0.45 },
      );
      io.observe(heroSheet);
    };
    if (document.readyState === 'complete') whenIdle(arm);
    else window.addEventListener('load', () => whenIdle(arm), { once: true });
  }
  replay?.addEventListener('click', () => {
    label('replay');
    d.play();
  });
}

// Beat 2: the interactive example.
const demo = $('#demo');
if (demo) {
  const reader = attachReader({
    root: demo,
    keyScope: 'root',
    onFoldChange: (folded) => {
      const b = $<HTMLButtonElement>('#demo-fold');
      if (!b) return;
      b.setAttribute('aria-pressed', String(folded));
      b.textContent = folded ? 'Unfold old paragraphs' : 'Fold old paragraphs';
    },
  });
  $('#demo-fold')?.addEventListener('click', () => reader.toggleFold());
  $('#demo-next')?.addEventListener('click', () => reader.jump(1));
  $('#demo-prev')?.addEventListener('click', () => reader.jump(-1));
}

// Beat 3a: the changed figure pulses once when it scrolls into view.
const driftRoot = $('#drift-demo');
if (driftRoot) {
  const d = createDissolver(driftRoot, { reduced });
  const replayBtn = $<HTMLButtonElement>('#drift-replay');
  if (!tier0) {
    d.reset();
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          d.play();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(driftRoot);
  } else if (replayBtn) {
    replayBtn.textContent = 'Play';
  }
  replayBtn?.addEventListener('click', () => d.play());
}

// Beat 3b: the tray opens and closes.
const trayToggle = $<HTMLButtonElement>('#tray-toggle');
const tray = $('#tray');
trayToggle?.addEventListener('click', () => {
  const open = trayToggle.getAttribute('aria-expanded') !== 'true';
  trayToggle.setAttribute('aria-expanded', String(open));
  if (open) tray?.removeAttribute('data-collapsed');
  else tray?.setAttribute('data-collapsed', '');
});

// Copy buttons: "Copied" with a check, then back.
for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  btn.addEventListener('click', async () => {
    const target = document.getElementById(btn.dataset['copy'] ?? '');
    const text = target?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const range = document.createRange();
      if (target) {
        range.selectNodeContents(target);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      return;
    }
    btn.setAttribute('data-copied', '');
    window.setTimeout(() => btn.removeAttribute('data-copied'), 1800);
  });
}

// Privacy: count what this page actually requested from other origins. Not an assertion, a reading.
const ledger = $('#ledger');
if (ledger) {
  const count = (): number =>
    performance.getEntriesByType('resource').filter((e) => {
      try {
        return new URL(e.name).origin !== location.origin;
      } catch {
        return false;
      }
    }).length;
  const paint = (): void => {
    ledger.textContent = String(count());
  };
  paint();
  window.addEventListener('load', paint, { once: true });
  new PerformanceObserver(paint).observe({ type: 'resource', buffered: true });
}
