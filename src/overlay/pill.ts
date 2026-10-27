/**
 * The status pill (bottom-right capsule) and the "Previously on" tray (SPEC F11, F14).
 * Both are fixed-position inside the overlay's shadow root. Copy comes from engine/present.ts so
 * the in-page text, the popup and the tests say exactly the same thing.
 */
import { pillText, relativeTime } from '../engine/present';
import type { PreviouslyOnCard } from '../engine/story';
import { h, svgOf, withNumbers } from './dom';
import { glyph, ICON } from './icons';

export interface PillCounts {
  total: number;
  new: number;
  seen: number;
  similar: number;
  changed: number;
}

export interface PillDeps {
  openApp(route: string): void;
  hiddenStories: Set<string>;
  saveHidden(): void;
  now(): number;
}

export class PillView {
  readonly pill: HTMLElement;
  readonly tray: HTMLElement;
  private readonly text: HTMLElement;
  private readonly sr: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly slot: HTMLElement;
  private onlyEl: HTMLElement | null = null;
  private busyTimer = 0;
  private shownBusyAt = 0;
  private hiddenByReader = false;
  private card: PreviouslyOnCard | null = null;
  private undoTimer = 0;

  constructor(
    private readonly doc: Document,
    private readonly deps: PillDeps,
    private readonly onHide: () => void,
  ) {
    this.mark = h(doc, 'span', { class: 'mark' });
    this.mark.append(svgOf(doc, glyph(16)));
    this.text = h(doc, 'span', { class: 'txt', 'aria-hidden': 'true' });
    this.sr = h(doc, 'span', { class: 'sr' });
    this.sub = h(doc, 'span', { class: 'sub' });
    this.sub.hidden = true;
    this.slot = h(doc, 'span', { class: 'slot' });
    const close = h(doc, 'button', {
      class: 'x',
      type: 'button',
      'aria-label': 'Hide for this page',
    });
    close.append(svgOf(doc, ICON.x));
    close.addEventListener('click', () => {
      this.hiddenByReader = true;
      this.pill.hidden = true;
      this.tray.hidden = true;
      this.onHide();
    });
    const keys = h(
      doc,
      'span',
      { class: 'keys' },
      h(doc, 'kbd', {}, 'N'),
      'Fold old',
      h(doc, 'kbd', {}, 'J'),
      h(doc, 'kbd', {}, 'K'),
      'Next or previous new',
    );
    this.pill = h(doc, 'div', { class: 'pill', role: 'status', hidden: '' });
    this.pill.append(this.mark, this.text, this.slot, close, this.sub, keys, this.sr);
    this.tray = h(doc, 'div', { class: 'tray', hidden: '' });
  }

  private reveal(): void {
    if (this.hiddenByReader) return;
    this.pill.hidden = false;
    // Next frame, so the enter transition runs from the hidden state.
    requestAnimationFrame(() => this.pill.classList.add('on'));
  }

  private setText(content: Node[], spoken: string): void {
    this.text.replaceChildren(...content);
    this.sr.textContent = spoken;
  }

  /** "Checking 23 paragraphs…" after a 300 ms delay, kept at least 400 ms (DESIGN.md pill states). */
  showAnalysing(total: number): void {
    window.clearTimeout(this.busyTimer);
    this.busyTimer = window.setTimeout(() => {
      this.shownBusyAt = this.deps.now();
      this.mark.classList.add('busy');
      this.slot.replaceChildren();
      this.sub.hidden = true;
      this.setText(
        withNumbers(this.doc, `Checking ${total} paragraphs…`),
        `Checking ${total} paragraphs`,
      );
      this.reveal();
    }, 300);
  }

  private afterBusy(fn: () => void): void {
    window.clearTimeout(this.busyTimer);
    const wait = this.shownBusyAt ? Math.max(0, 400 - (this.deps.now() - this.shownBusyAt)) : 0;
    this.shownBusyAt = 0;
    if (wait > 0) window.setTimeout(fn, wait);
    else fn();
  }

  showError(retry: () => void): void {
    this.afterBusy(() => {
      this.mark.classList.remove('busy');
      this.mark.className = 'mark err';
      this.mark.replaceChildren(svgOf(this.doc, ICON.alert));
      this.setText(
        [this.doc.createTextNode("Old News couldn't check this page.")],
        "Old News couldn't check this page.",
      );
      const btn = h(this.doc, 'button', { class: 'retry', type: 'button' }, 'Retry');
      btn.addEventListener('click', retry);
      this.slot.replaceChildren(btn);
      this.sub.hidden = true;
      this.reveal();
    });
  }

  /**
   * Result copy for the given counts. `from` is the number shown first when the dissolve counts
   * down (the pill opens at "23 of 23" and ends at the real count).
   */
  showResult(counts: PillCounts, degraded: boolean): void {
    this.afterBusy(() => {
      this.mark.className = 'mark';
      this.mark.replaceChildren(svgOf(this.doc, glyph(16)));
      this.slot.replaceChildren();
      const copy = pillText(counts);
      if (copy === null) {
        this.pill.hidden = true;
        this.pill.classList.remove('on');
        return;
      }
      this.onlyEl = null;
      const nodes = withNumbers(this.doc, copy);
      this.setText(nodes, copy);
      this.sub.hidden = !degraded;
      this.sub.textContent = degraded ? 'Similar-wording matching is off' : '';
      this.reveal();
    });
  }

  /** The dissolve's opening frame: every paragraph is still new, and "Only" is not there yet. */
  beginCountdown(total: number): void {
    window.clearTimeout(this.busyTimer);
    this.shownBusyAt = 0;
    this.mark.className = 'mark';
    this.mark.replaceChildren(svgOf(this.doc, glyph(16)));
    this.slot.replaceChildren();
    const only = h(this.doc, 'span', { class: 'only off' }, 'Only ');
    this.onlyEl = only;
    this.text.replaceChildren(
      only,
      h(this.doc, 'b', { class: 'n' }, String(total)),
      ' of ',
      h(this.doc, 'b', {}, String(total)),
      ' paragraphs are new to you',
    );
    this.reveal();
  }

  setCountdown(n: number): void {
    const el = this.text.querySelector('b.n');
    if (el) el.textContent = String(n);
  }

  showOnly(): void {
    this.onlyEl?.classList.remove('off');
  }

  /** Re-renders the spoken text only (during the countdown, so screen readers hear the end state). */
  speak(counts: PillCounts): void {
    this.sr.textContent = pillText(counts) ?? '';
  }

  // ---- Tray ----------------------------------------------------------------------------------

  setCard(card: PreviouslyOnCard | null): void {
    this.card = card;
    window.clearTimeout(this.undoTimer);
    this.renderTray(false);
  }

  private renderTray(open: boolean): void {
    const card = this.card;
    if (!card || this.hiddenByReader || this.deps.hiddenStories.has(card.storyId)) {
      this.tray.hidden = true;
      return;
    }
    const now = this.deps.now();
    const n = card.articles.length;
    const k = card.changedFigures.length;
    const label =
      `Previously on this story: ${n} ${n === 1 ? 'article' : 'articles'}` +
      (k > 0 ? `, ${k} ${k === 1 ? 'figure' : 'figures'} changed` : '');
    const head = h(this.doc, 'button', {
      class: 't-head',
      type: 'button',
      'aria-expanded': String(open),
    });
    head.append(svgOf(this.doc, ICON.chevronUp), label);
    const rows = card.articles.slice(0, 6).map((a) => {
      const row = h(
        this.doc,
        a.url ? 'a' : 'div',
        {
          class: 't-row',
          ...(a.url ? { href: a.url, target: '_blank', rel: 'noopener noreferrer' } : {}),
        },
        h(
          this.doc,
          'div',
          { class: 't-site' },
          a.siteName,
          ' ',
          h(this.doc, 'span', {}, relativeTime(a.readAt, now)),
        ),
        h(this.doc, 'div', { class: 't-title' }, a.title),
      );
      return row;
    });
    const changes = card.changedFigures
      .slice(0, 5)
      .map((d) =>
        h(
          this.doc,
          'div',
          { class: 't-chg' },
          h(this.doc, 'span', {}, d.context),
          h(this.doc, 'b', {}, `${d.before || 'not mentioned'} → ${d.after || 'not mentioned'}`),
        ),
      );
    const openDrift = h(this.doc, 'button', { class: 'btn', type: 'button' }, 'Open Drift list');
    openDrift.addEventListener('click', () => this.deps.openApp('#/drift'));
    const hide = h(this.doc, 'button', { class: 'btn', type: 'button' }, 'Hide for this story');
    hide.addEventListener('click', () => this.hideStory(card.storyId));
    const inner = h(this.doc, 'div', { class: 't-in' }, ...rows);
    if (changes.length > 0)
      inner.append(h(this.doc, 'div', { class: 't-h' }, 'What changed'), ...changes);
    inner.append(h(this.doc, 'div', { class: 't-foot' }, openDrift, hide));
    const wrap = h(
      this.doc,
      'div',
      { class: 't-wrap' },
      h(this.doc, 'div', { class: 't-body' }, inner),
    );
    this.tray.className = open ? 'tray open' : 'tray';
    this.tray.replaceChildren(head, wrap);
    this.tray.hidden = false;
    head.addEventListener('click', () => this.renderTray(!this.tray.classList.contains('open')));
  }

  get trayOpen(): boolean {
    return this.tray.classList.contains('open') && !this.tray.hidden;
  }

  closeTray(): boolean {
    if (!this.trayOpen) return false;
    this.renderTray(false);
    return true;
  }

  private hideStory(id: string): void {
    this.deps.hiddenStories.add(id);
    this.deps.saveHidden();
    const undo = h(this.doc, 'button', { class: 'btn', type: 'button' }, 'Undo');
    undo.addEventListener('click', () => {
      this.deps.hiddenStories.delete(id);
      this.deps.saveHidden();
      window.clearTimeout(this.undoTimer);
      this.renderTray(false);
    });
    this.tray.className = 'tray';
    this.tray.replaceChildren(
      h(this.doc, 'div', { class: 't-head' }, 'Hidden for this story', undo),
    );
    this.tray.hidden = false;
    this.undoTimer = window.setTimeout(() => {
      this.tray.hidden = true;
    }, 6000);
  }

  destroy(): void {
    window.clearTimeout(this.busyTimer);
    window.clearTimeout(this.undoTimer);
  }
}
