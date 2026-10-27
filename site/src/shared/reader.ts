/**
 * Behaviour for the rows drawn by render.ts: the hover card, N (fold), J/K (jump between what is
 * new). Plain DOM, shared by the landing demo and the web app. High-frequency actions (N, J, K)
 * run with zero animation (bible P1); the hover card is the only thing that animates.
 */
import { GLYPH, hostOf } from './render';

export interface ReaderOptions {
  root: HTMLElement;
  /** 'root': keys work while focus or the pointer is inside root. 'document': whenever no input has focus. */
  keyScope: 'root' | 'document';
  /** "Not old news": called with the row element; resolve when the choice is stored. */
  onNotOld?: (row: HTMLElement) => void | Promise<void>;
  /** N/J/K enabled (default true). Escape and the card always work. */
  keys?: boolean;
  /** Called after fold state changes (for button labels). */
  onFoldChange?: (folded: boolean) => void;
}

export interface Reader {
  toggleFold(): void;
  jump(direction: 1 | -1): void;
  closeCard(): void;
  readonly folded: boolean;
  destroy(): void;
}

const FADED = new Set(['seen', 'similar']);
const LIT = new Set(['new', 'changed']);

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

export function attachReader(opts: ReaderOptions): Reader {
  const { root } = opts;
  let card: HTMLElement | null = null;
  let cardAnchor: HTMLElement | null = null;
  let hoverTimer = 0;
  let folded = false;
  let focusIndex = -1;
  const ac = new AbortController();
  const sig = { signal: ac.signal };

  const rows = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.on-row')];

  function closeCard(returnFocus = false): void {
    window.clearTimeout(hoverTimer);
    if (!card) return;
    const gone = card;
    card = null;
    gone.classList.add('is-leaving');
    window.setTimeout(() => gone.remove(), 120);
    if (cardAnchor) {
      cardAnchor.setAttribute('aria-expanded', 'false');
      if (returnFocus) cardAnchor.focus();
    }
    cardAnchor = null;
  }

  function openCard(anchor: HTMLElement, row: HTMLElement): void {
    if (card && cardAnchor === anchor) return;
    closeCard();
    const d = row.dataset;
    const url = d['url'] ?? '';
    const host = hostOf(url);
    const fixture = host.endsWith('.example');
    const pasted = host.endsWith('.invalid');
    const el = document.createElement('div');
    el.className = 'on-card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Where you read this paragraph');
    const outlet = document.createElement('div');
    const o = document.createElement('span');
    o.className = 'c-outlet';
    o.textContent = d['outlet'] ?? '';
    const w = document.createElement('span');
    w.className = 'c-when';
    w.textContent = d['when'] ?? '';
    outlet.append(o, w);
    const title = document.createElement('div');
    title.className = 'c-title';
    title.textContent = d['title'] ?? '';
    const snip = document.createElement('div');
    snip.className = 'c-snippet';
    snip.textContent = `“${d['snippet'] ?? ''}”`;
    const match = document.createElement('div');
    match.className = 'c-match';
    match.textContent = d['match'] ?? '';
    const actions = document.createElement('div');
    actions.className = 'c-actions';
    if (url && !fixture) {
      const a = document.createElement('a');
      a.className = 'btn btn-ghost';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Open original';
      actions.append(a);
    } else if (host && !pasted) {
      const span = document.createElement('span');
      span.className = 'c-match';
      span.style.padding = '0 12px';
      span.textContent = fixture ? `${host} (fixture story)` : host;
      actions.append(span);
    }
    if (row.dataset['tier'] !== 'changed') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-ghost';
      b.textContent = 'Not old news';
      b.addEventListener('click', () => {
        row.dataset['notold'] = '';
        b.textContent = 'Marked as new';
        b.disabled = true;
        void Promise.resolve(opts.onNotOld?.(row));
        window.setTimeout(() => closeCard(true), 1200);
      });
      actions.append(b);
    }
    el.append(outlet, title, snip, match, actions);
    root.append(el);

    // Place under the anchor on wide screens; as a bottom sheet on narrow ones.
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    if (narrow) {
      el.classList.add('is-sheet');
    } else {
      const r = anchor.getBoundingClientRect();
      const base = root.getBoundingClientRect();
      const width = 320;
      let left = r.left - base.left;
      left = Math.max(8, Math.min(left, base.width - width - 8));
      el.style.left = `${left}px`;
      el.style.top = `${r.bottom - base.top + 6}px`;
    }
    anchor.setAttribute('aria-expanded', 'true');
    card = el;
    cardAnchor = anchor;
    el.getBoundingClientRect();
    el.classList.add('is-open');
  }

  root.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement;
      const tag = t.closest<HTMLElement>('.on-tag, .on-chip');
      if (tag && root.contains(tag)) {
        const row = tag.closest<HTMLElement>('.on-row');
        if (!row) return;
        if (card && cardAnchor === tag) closeCard(true);
        else openCard(tag, row);
        return;
      }
      const fold = t.closest<HTMLElement>('.on-fold');
      if (fold) {
        unfoldRun(fold);
        return;
      }
      if (card && !card.contains(t)) closeCard();
    },
    sig,
  );

  // Hover opens after 300 ms on devices that hover; touch uses tap only.
  root.addEventListener(
    'pointerover',
    (e) => {
      if ((e as PointerEvent).pointerType !== 'mouse') return;
      const tag = (e.target as HTMLElement).closest<HTMLElement>('.on-tag');
      if (!tag || !root.contains(tag)) return;
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => {
        const row = tag.closest<HTMLElement>('.on-row');
        if (row) openCard(tag, row);
      }, 300);
    },
    sig,
  );
  root.addEventListener('pointerout', () => window.clearTimeout(hoverTimer), sig);

  function foldRuns(): void {
    const rs = rows();
    let i = 0;
    while (i < rs.length) {
      const first = rs[i] as HTMLElement;
      if (!FADED.has(first.dataset['tier'] ?? '') || 'notold' in first.dataset) {
        i++;
        continue;
      }
      const run: HTMLElement[] = [];
      while (i < rs.length) {
        const r = rs[i] as HTMLElement;
        if (!FADED.has(r.dataset['tier'] ?? '') || 'notold' in r.dataset) break;
        run.push(r);
        i++;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'on-fold';
      const label = `Show ${run.length} old ${run.length === 1 ? 'paragraph' : 'paragraphs'}`;
      btn.setAttribute('aria-label', label);
      btn.innerHTML = `<span>${label}</span>`;
      first.before(btn);
      for (const r of run) r.dataset['folded'] = '';
    }
  }

  function unfoldRun(btn: HTMLElement): void {
    let n = btn.nextElementSibling as HTMLElement | null;
    while (n && 'folded' in n.dataset) {
      delete n.dataset['folded'];
      n = n.nextElementSibling as HTMLElement | null;
    }
    btn.remove();
  }

  function toggleFold(): void {
    closeCard();
    folded = !folded;
    if (folded) {
      foldRuns();
    } else {
      for (const b of root.querySelectorAll<HTMLElement>('.on-fold')) b.remove();
      for (const r of rows()) delete r.dataset['folded'];
    }
    opts.onFoldChange?.(folded);
  }

  function jump(direction: 1 | -1): void {
    const lit = rows().filter((r) => LIT.has(r.dataset['tier'] ?? '') || 'notold' in r.dataset);
    if (lit.length === 0) return;
    const current = rows().findIndex((r) => 'focus' in r.dataset);
    let target: HTMLElement | undefined;
    if (current === -1) {
      target = direction === 1 ? lit[0] : lit[lit.length - 1];
    } else {
      const all = rows();
      const after = direction === 1 ? all.slice(current + 1) : all.slice(0, current).reverse();
      target = after.find((r) => lit.includes(r));
      target ??= direction === 1 ? lit[0] : lit[lit.length - 1];
    }
    for (const r of rows()) delete r.dataset['focus'];
    if (!target) return;
    target.dataset['focus'] = '';
    const p = target.querySelector<HTMLElement>('.on-p');
    if (p) {
      p.tabIndex = -1;
      p.focus({ preventScroll: true });
    }
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    focusIndex = lit.indexOf(target);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (card) {
        e.stopPropagation();
        closeCard(true);
      }
      return;
    }
    if (isTyping(document.activeElement)) return;
    if (
      opts.keyScope === 'root' &&
      !(root.contains(document.activeElement) || root.matches(':hover'))
    )
      return;
    const k = e.key.toLowerCase();
    if (k === 'n') {
      e.preventDefault();
      toggleFold();
    } else if (k === 'j') {
      e.preventDefault();
      jump(1);
    } else if (k === 'k') {
      e.preventDefault();
      jump(-1);
    }
  };
  document.addEventListener('keydown', onKey, sig);

  return {
    toggleFold,
    jump,
    closeCard: () => closeCard(),
    get folded() {
      return folded;
    },
    destroy() {
      closeCard();
      ac.abort();
      void focusIndex;
      void GLYPH;
    },
  };
}
