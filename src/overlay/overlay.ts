/**
 * The in-page overlay (SPEC F8-F12, DESIGN.md Surface 1). Vanilla TypeScript, no framework.
 *
 * What it touches on someone else's page, and nothing else:
 *   - inline `opacity` (and a short `transition`) on faded paragraphs, restored on teardown;
 *   - one `::highlight(on-drift)` rule on the changed token;
 *   - one host element appended to <html>, whose closed shadow root holds every tag, chip, card,
 *     pill and tray. Nothing is inserted into the page's flow, so the page never shifts.
 * The reader's own N fold is the single exception: it collapses old paragraphs by inline style.
 */
import type { AnalyseResponse, ParagraphResult } from '../host/engineHost';
import { driftChipText, provenanceLabel, readWhen } from '../engine/present';
import type { PreviouslyOnCard } from '../engine/story';
import type { Tier } from '../engine/tiers';
import { OVERLAY_ATTR } from '../extract/map';
import type { FadeStrength } from '../paint/contrastFloor';
import { EASE_IN_OUT, EASE_OUT, EASE_OUT_SOFT, h, isEditable, svgOf } from './dom';
import { DISSOLVE, clampX, placeTag, planDissolve, pulseFrames, shouldDissolve } from './geometry';
import type { TagMode } from './geometry';
import { ICON } from './icons';
import { fadeFor, themeOf } from './ink';
import { findToken } from './locate';
import type { PillCounts } from './pill';
import { PillView } from './pill';
import { highlightCss, overlayCss } from './style';
import { Timeline } from './timeline';
import type { OverlayTheme } from './tokens';
import { paletteFor } from './tokens';

declare const __OLD_NEWS_E2E__: boolean | undefined;

export interface OverlaySettings {
  fadeStrength: FadeStrength;
  dissolve: boolean;
  keys: boolean;
  /** Hold the dissolve until `dissolveTimeline.seek(t)` drives it (deterministic frame capture). */
  capture?: boolean;
}

export interface OverlayDeps {
  feedback(fingerprint: string, oldParagraphId: string): Promise<void>;
  openApp(route: string): void;
  /** Stories whose "Previously on" tray the reader hid. */
  hiddenStories: Set<string>;
  saveHidden(): void;
  now?(): number;
}

export interface SectionBlock {
  ordinal: number;
  element: Element;
}

export type SectionData = Pick<
  AnalyseResponse,
  'paragraphs' | 'summary' | 'degraded' | 'storyId' | 'previouslyOn'
>;

interface Chip {
  el: HTMLElement;
  range: Range | null;
  pulses: HTMLElement[];
  text: string;
}

interface Item {
  section: Section;
  ordinal: number;
  el: HTMLElement;
  res: ParagraphResult;
  /** Effective tier: a seen paragraph the reader marked "Not old news" counts as new. */
  tier: Tier;
  /** Opacity of the faded paragraph, 1 when it is not faded. */
  alpha: number;
  fade: boolean;
  fallbackRule: HTMLElement | null;
  tag: HTMLElement | null;
  dot: HTMLElement | null;
  mode: TagMode;
  chips: Chip[];
  more: HTMLElement | null;
  saved: { opacity: string; transition: string; tabindex: string | null; outline: string };
  hover: boolean;
  folded: boolean;
  revealed: boolean;
  /** Inline style text and display value from before the reader folded this paragraph. */
  foldSaved: { css: string; display: string };
}

interface FoldRun {
  items: Item[];
  button: HTMLElement | null;
  open: boolean;
}

interface Section {
  key: string;
  items: Item[];
  degraded: boolean;
  card: PreviouslyOnCard | null;
  runs: FoldRun[];
}

export interface Counts extends PillCounts {
  degraded: boolean;
}

const E2E = typeof __OLD_NEWS_E2E__ !== 'undefined' && __OLD_NEWS_E2E__;
const HOVER_OPEN_MS = 300;

export class Overlay {
  readonly doc: Document;
  private readonly win: Window;
  private settings: OverlaySettings;
  private readonly deps: OverlayDeps & { now(): number };
  private readonly ac = new AbortController();
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private root!: HTMLElement;
  private layer!: HTMLElement;
  private theme: OverlayTheme = 'light';
  private pill!: PillView;
  private readonly sections: Section[] = [];
  private active: Section | null = null;
  private dissolved = false;
  private timeline: Timeline | null = null;
  private folded = false;
  private marker: HTMLElement | null = null;
  private current: Item | null = null;
  private card: HTMLElement | null = null;
  private cardItem: { item: Item; anchor: HTMLElement } | null = null;
  private hoverTimer = 0;
  private closeTimer = 0;
  private layoutQueued = false;
  private sheet: CSSStyleSheet | null = null;
  private highlight: Highlight | null = null;
  private readonly reduced: boolean;
  private lastActive = 0;
  /** Called after the reader changes what is lit (Not old news), so the badge can update. */
  onChange: ((counts: Counts) => void) | null = null;

  constructor(doc: Document, settings: OverlaySettings, deps: OverlayDeps) {
    this.doc = doc;
    this.win = doc.defaultView as Window;
    this.settings = settings;
    this.deps = { now: () => Date.now(), ...deps };
    this.reduced = this.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  setSettings(s: OverlaySettings): void {
    this.settings = s;
  }

  // ---- Host ----------------------------------------------------------------------------------

  private ensureHost(anchor?: Element): void {
    if (this.host) return;
    if (anchor) this.theme = themeOf(anchor);
    const host = this.doc.createElement('div');
    host.setAttribute(OVERLAY_ATTR, '');
    host.style.cssText =
      'all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: E2E ? 'open' : 'closed' });
    const style = this.doc.createElement('style');
    style.textContent = overlayCss(paletteFor(this.theme));
    this.root = h(this.doc, 'div', { class: 'root' });
    this.layer = h(this.doc, 'div', { class: 'layer' });
    this.pill = new PillView(
      this.doc,
      {
        openApp: (r) => this.deps.openApp(r),
        hiddenStories: this.deps.hiddenStories,
        saveHidden: () => this.deps.saveHidden(),
        now: this.deps.now,
      },
      () => undefined,
    );
    this.root.append(this.layer, this.pill.tray, this.pill.pill);
    shadow.append(style, this.root);
    this.doc.documentElement.append(host);
    this.host = host;
    this.shadow = shadow;
    this.bind();
    this.installHighlight();
  }

  private bind(): void {
    const opts = { signal: this.ac.signal };
    const queue = (): void => this.queueLayout();
    this.win.addEventListener('resize', queue, opts);
    this.win.addEventListener('load', queue, opts);
    this.win.addEventListener('scroll', () => this.updateActive(), { ...opts, passive: true });
    this.doc.addEventListener('keydown', (e) => this.onKey(e), { ...opts, capture: true });
    const finish = (): void => this.timeline?.finish();
    for (const type of ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const) {
      this.doc.addEventListener(type, finish, { ...opts, capture: true, passive: true });
    }
    this.doc.fonts?.ready.then(queue, () => undefined);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(queue);
      ro.observe(this.doc.documentElement);
      this.ac.signal.addEventListener('abort', () => ro.disconnect());
    }
  }

  private installHighlight(): void {
    try {
      if (!('highlights' in CSS) || typeof Highlight === 'undefined') return;
      const sheet = new (this.win as unknown as typeof globalThis).CSSStyleSheet();
      sheet.replaceSync(highlightCss(paletteFor(this.theme)));
      this.doc.adoptedStyleSheets = [...this.doc.adoptedStyleSheets, sheet];
      this.sheet = sheet;
      this.highlight = new Highlight();
      CSS.highlights.set('on-drift', this.highlight);
    } catch {
      this.highlight = null;
    }
  }

  // ---- Public status API ---------------------------------------------------------------------

  showAnalysing(total: number, anchor?: Element): void {
    this.ensureHost(anchor);
    this.pill.showAnalysing(total);
  }

  showError(retry: () => void): void {
    this.ensureHost();
    this.pill.showError(retry);
  }

  /** Counts for the pill and badge, from what is lit right now. */
  counts(section: Section | null = this.active): Counts {
    const c: Counts = { total: 0, new: 0, seen: 0, similar: 0, changed: 0, degraded: false };
    if (!section) return c;
    for (const it of section.items) {
      c.total++;
      c[it.tier]++;
    }
    c.degraded = section.degraded;
    return c;
  }

  get sectionKeys(): string[] {
    return this.sections.map((s) => s.key);
  }

  /** The active dissolve, for deterministic capture (`window.__frame`). */
  get dissolveTimeline(): Timeline | null {
    return this.timeline;
  }

  // ---- Sections ------------------------------------------------------------------------------

  async addSection(key: string, blocks: readonly SectionBlock[], data: SectionData): Promise<void> {
    const first = blocks[0]?.element;
    this.ensureHost(first);
    const section: Section = {
      key,
      items: [],
      degraded: data.degraded,
      card: data.previouslyOn,
      runs: [],
    };
    this.sections.push(section);
    this.active = section;
    this.buildItems(section, blocks, data.paragraphs);
    this.pill.setCard(section.card);
    await this.paint(section, section.items, !this.dissolved);
    if (!this.dissolved) this.dissolved = true;
    this.finishSection(section);
  }

  /** Live-blog posts appended to an existing section: matched, then faded with a short transition. */
  async appendToSection(
    key: string,
    blocks: readonly SectionBlock[],
    data: SectionData,
  ): Promise<void> {
    const section = this.sections.find((s) => s.key === key);
    if (!section) return this.addSection(key, blocks, data);
    section.degraded = data.degraded;
    // Posts may be prepended, so the new items are not necessarily the tail of the sorted list.
    const added = this.buildItems(section, blocks, data.paragraphs);
    await this.paint(section, added, false);
    this.finishSection(section);
  }

  private finishSection(section: Section): void {
    if (this.folded) this.applyFold(true);
    this.queueLayout();
    this.updateActive(true);
    this.renderPill(section);
  }

  private buildItems(
    section: Section,
    blocks: readonly SectionBlock[],
    results: readonly ParagraphResult[],
  ): Item[] {
    const created: Item[] = [];
    const byOrdinal = new Map(results.map((r) => [r.ordinal, r]));
    for (const b of blocks) {
      const res = byOrdinal.get(b.ordinal);
      if (!res || !(b.element as HTMLElement).style) continue;
      const el = b.element as HTMLElement;
      // A faded tier without a named source cannot be explained, so it stays lit.
      const tier: Tier =
        (res.tier === 'seen' || res.tier === 'similar') && !res.provenance ? 'new' : res.tier;
      const item: Item = {
        section,
        ordinal: b.ordinal,
        el,
        res,
        tier,
        alpha: 1,
        fade: false,
        fallbackRule: null,
        tag: null,
        dot: null,
        mode: 'right',
        chips: [],
        more: null,
        saved: {
          opacity: el.style.opacity,
          transition: el.style.transition,
          tabindex: el.getAttribute('tabindex'),
          outline: el.style.outline,
        },
        hover: false,
        folded: false,
        revealed: false,
        foldSaved: { css: '', display: '' },
      };
      section.items.push(item);
      created.push(item);
    }
    section.items.sort((a, b) =>
      a.el === b.el
        ? 0
        : a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
    );
    return created;
  }

  // ---- Painting ------------------------------------------------------------------------------

  private async paint(
    section: Section,
    items: readonly Item[],
    firstPaint: boolean,
  ): Promise<void> {
    const vh = this.win.innerHeight;
    const faded = items.filter((i) => i.tier === 'seen' || i.tier === 'similar');
    // Reads first, writes after: solve every fade, then touch the page.
    const inRange = new Map<Item, boolean>();
    for (const it of faded) {
      const solved = fadeFor(it.el, it.tier as 'seen' | 'similar', this.settings.fadeStrength);
      it.alpha = solved.faded ? solved.opacity : 1;
      it.fade = solved.faded;
      const r = it.el.getBoundingClientRect();
      inRange.set(it, r.bottom > 0 && r.top < vh * 2);
      if (solved.fallback) it.fallbackRule = h(this.doc, 'div', { class: 'rule' });
    }

    for (const it of faded) this.makeTag(it);
    for (const it of items) if (it.tier === 'changed') this.makeChips(it);
    this.attachHover(items);
    this.queueLayoutNow();

    const fadedInRange = faded.filter((i) => inRange.get(i)).length;
    const dissolve =
      firstPaint && shouldDissolve(fadedInRange, this.settings.dissolve, this.reduced);
    const total = section.items.length;
    const lit = section.items.filter((i) => i.tier === 'new' || i.tier === 'changed').length;

    if (dissolve) {
      this.pill.beginCountdown(total);
      this.runDissolve(section, faded, inRange, total, lit, items);
    } else {
      this.runQuick(faded, items);
      this.pill.showResult(this.counts(section), section.degraded);
      this.pill.setCard(section.card);
    }
  }

  private animate(
    el: Element,
    frames: Keyframe[],
    opts: KeyframeAnimationOptions,
  ): Animation | null {
    if (typeof el.animate !== 'function') return null;
    try {
      return el.animate(frames, { fill: 'both', ...opts });
    } catch {
      return null;
    }
  }

  private commitFade(it: Item): void {
    it.el.style.transition = 'opacity 100ms ' + EASE_OUT;
    it.el.style.opacity = String(it.hover ? 1 : it.alpha);
  }

  /** One 150 ms opacity transition for everything (no dissolve, reduced motion, appended posts). */
  private runQuick(faded: readonly Item[], items: readonly Item[]): void {
    const tl = new Timeline();
    for (const it of faded) {
      if (it.fade) {
        const a = this.animate(it.el, [{ opacity: 1 }, { opacity: it.alpha }], {
          duration: DISSOLVE.reduced,
          easing: EASE_OUT_SOFT,
        });
        if (a) tl.add(a, DISSOLVE.reduced, () => this.commitFade(it));
        else this.commitFade(it);
      }
      this.revealTag(it, tl, 0, DISSOLVE.reduced);
    }
    for (const it of items)
      for (const c of it.chips) this.revealChip(c, tl, 0, DISSOLVE.reduced, false);
    this.timeline = tl;
    tl.onEnd(() => this.finalizeHighlights(items));
    tl.play();
    if (tl.duration === 0) tl.finish();
  }

  private runDissolve(
    section: Section,
    faded: readonly Item[],
    inRange: ReadonlyMap<Item, boolean>,
    total: number,
    lit: number,
    items: readonly Item[],
  ): void {
    const tl = new Timeline();
    const steps = planDissolve(faded.map((it, index) => ({ index, inRange: !!inRange.get(it) })));
    const starts = steps.map((s) => s.start);
    faded.forEach((it, i) => {
      const step = steps[i];
      if (!step) return;
      if (!step.animate) {
        if (it.fade) this.commitFade(it);
        this.revealTag(it, null, 0, 0);
        return;
      }
      if (it.fade) {
        const a = this.animate(it.el, [{ opacity: 1 }, { opacity: it.alpha }], {
          duration: DISSOLVE.para,
          delay: step.start,
          easing: EASE_OUT_SOFT,
        });
        if (a) tl.add(a, step.start + DISSOLVE.para, () => this.commitFade(it));
        else this.commitFade(it);
      }
      this.revealTag(it, tl, step.start + DISSOLVE.tagLead, DISSOLVE.tagFade);
    });
    tl.countdown(total, starts, (n) => {
      this.pill.setCountdown(Math.max(n, lit));
    });
    // "Only" fades into the pill as the last paragraph settles.
    const lastStart = Math.max(0, ...starts);
    const onlyAt = Math.max(DISSOLVE.settle, lastStart + DISSOLVE.para);
    tl.at(onlyAt, () => this.pill.showOnly());

    // Drift pulse, then the chips rising over it.
    let chipIndex = 0;
    for (const it of items) {
      for (const c of it.chips) {
        const rest = this.highlight ? 0 : 0.35;
        for (const p of c.pulses) {
          const len = DISSOLVE.pulseEnd - DISSOLVE.pulseStart;
          const a = this.animate(
            p,
            pulseFrames(rest).map(([offset, opacity]) => ({ offset, opacity })),
            { duration: len, delay: DISSOLVE.pulseStart, easing: EASE_IN_OUT },
          );
          tl.add(a, DISSOLVE.pulseEnd, () => {
            p.style.opacity = String(rest);
          });
        }
        this.revealChip(c, tl, DISSOLVE.chipStart + chipIndex * 40, DISSOLVE.chipRise, true);
        chipIndex++;
      }
    }
    this.timeline = tl;
    tl.onEnd(() => {
      this.pill.showResult(this.counts(section), section.degraded);
      this.pill.speak(this.counts(section));
      this.finalizeHighlights(items);
    });
    // Reads and writes are done; start on the next frame so the first paint is the full-ink page.
    if (!this.settings.capture) requestAnimationFrame(() => tl.play());
  }

  private revealTag(it: Item, tl: Timeline | null, delay: number, dur: number): void {
    const visible = it.mode === 'right' || it.mode === 'left';
    const els = [it.tag, it.dot].filter((e): e is HTMLElement => !!e);
    for (const el of els) {
      const show = (): void => {
        it.revealed = true;
        el.classList.add('on');
      };
      if (!tl || dur === 0) {
        show();
        continue;
      }
      if (!visible && el === it.tag) continue;
      const a = this.animate(el, [{ opacity: 0 }, { opacity: 1 }], {
        duration: dur,
        delay,
        easing: EASE_OUT,
      });
      tl.add(a, delay + dur, show);
      if (!a) show();
    }
    if (it.fallbackRule) it.fallbackRule.style.opacity = '1';
  }

  private revealChip(
    c: Chip,
    tl: Timeline | null,
    delay: number,
    dur: number,
    rise: boolean,
  ): void {
    const show = (): void => c.el.classList.add('on');
    if (!tl) return show();
    const a = this.animate(
      c.el,
      rise
        ? [
            { opacity: 0, transform: 'translateY(4px)' },
            { opacity: 1, transform: 'none' },
          ]
        : [{ opacity: 0 }, { opacity: 1 }],
      { duration: dur, delay, easing: EASE_OUT },
    );
    tl.add(a, delay + dur, show);
    if (!a) show();
    if (!rise) for (const p of c.pulses) p.style.opacity = this.highlight ? '0' : '0.35';
  }

  private finalizeHighlights(items: readonly Item[]): void {
    if (!this.highlight) return;
    for (const it of items) {
      for (const c of it.chips) {
        if (c.range) this.highlight.add(c.range);
        for (const p of c.pulses) p.style.opacity = '0';
      }
    }
  }

  // ---- Tags, dots, chips ---------------------------------------------------------------------

  private makeTag(it: Item): void {
    const p = it.res.provenance;
    if (!p) return;
    const now = this.deps.now();
    const label = provenanceLabel(it.tier, p.siteName, p.readAt, now);
    if (!label) return;
    const tag = h(this.doc, 'button', {
      class: 'tag',
      type: 'button',
      'aria-haspopup': 'dialog',
      'aria-label': `${label}. Show details`,
    });
    tag.textContent = label;
    tag.addEventListener('click', () => this.openCard(it, tag, true));
    tag.addEventListener('focus', () => {
      this.showFloating(it, true);
      this.openCard(it, tag, false);
    });
    tag.addEventListener('pointerenter', () => this.scheduleCard(it, tag));
    tag.addEventListener('pointerleave', () => this.scheduleClose());
    tag.addEventListener('blur', () => this.focusLeft(tag));
    it.tag = tag;
    this.layer.append(tag);
    if (it.fallbackRule) this.layer.append(it.fallbackRule);
  }

  private makeChips(it: Item): void {
    const p = it.res.provenance;
    if (!p) return;
    const now = this.deps.now();
    const findings = it.res.drift.slice(0, 3);
    const shown = findings.slice(0, 2);
    shown.forEach((f) => {
      const full = driftChipText(f, p.siteName, p.readAt, now);
      const cut = full.indexOf(' · ');
      const head = cut > 0 ? full.slice(0, cut) : full;
      const rest = cut > 0 ? full.slice(cut) : '';
      const el = h(this.doc, 'button', {
        class: 'chip',
        type: 'button',
        'aria-haspopup': 'dialog',
        'aria-label': full.replace(' · ', '. '),
      });
      el.append(h(this.doc, 'b', {}, head), h(this.doc, 'span', {}, rest));
      const range = f.after ? findToken(it.el, f.after, it.res.drift.indexOf(f) / 4) : null;
      const chip: Chip = { el, range, pulses: [], text: full };
      el.addEventListener('click', () => this.openCard(it, el, true));
      el.addEventListener('focus', () => this.openCard(it, el, false));
      el.addEventListener('pointerenter', () => this.scheduleCard(it, el));
      el.addEventListener('pointerleave', () => this.scheduleClose());
      el.addEventListener('blur', () => this.focusLeft(el));
      it.chips.push(chip);
      this.layer.append(el);
    });
    if (findings.length > 2) {
      it.more = h(this.doc, 'span', { class: 'more' }, `+${it.res.drift.length - 2}`);
      this.layer.append(it.more);
    }
  }

  private attachHover(items: readonly Item[]): void {
    const opts = { signal: this.ac.signal };
    for (const it of items) {
      if (it.tier !== 'seen' && it.tier !== 'similar') continue;
      const to = (on: boolean): void => {
        it.hover = on;
        if (it.fade && it.tier !== 'new') {
          it.el.style.transition = 'opacity 100ms ' + EASE_OUT;
          it.el.style.opacity = on || this.current === it ? '1' : String(it.alpha);
        }
        if (it.mode === 'dot' || it.mode === 'hover') this.showFloating(it, on);
      };
      it.el.addEventListener('pointerenter', () => to(true), opts);
      it.el.addEventListener('pointerleave', () => to(false), opts);
      it.el.addEventListener('focusin', () => to(true), opts);
      it.el.addEventListener('focusout', () => to(false), opts);
    }
  }

  private showFloating(it: Item, on: boolean): void {
    if (!it.tag || (it.mode !== 'dot' && it.mode !== 'hover')) return;
    it.tag.classList.toggle('on', on);
  }

  // ---- Hover card ----------------------------------------------------------------------------

  private ensureCard(): HTMLElement {
    if (this.card) return this.card;
    const card = h(this.doc, 'div', {
      class: 'card',
      role: 'dialog',
      'aria-label': 'Where you read this',
    });
    card.addEventListener('pointerenter', () => window.clearTimeout(this.closeTimer));
    card.addEventListener('pointerleave', () => this.scheduleClose());
    card.addEventListener('focusout', () => this.focusLeft(card));
    this.card = card;
    this.layer.append(card);
    return card;
  }

  private scheduleCard(it: Item, anchor: HTMLElement): void {
    window.clearTimeout(this.closeTimer);
    window.clearTimeout(this.hoverTimer);
    this.hoverTimer = window.setTimeout(() => this.openCard(it, anchor, false), HOVER_OPEN_MS);
  }

  private scheduleClose(): void {
    window.clearTimeout(this.hoverTimer);
    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => this.closeCard(false), 160);
  }

  private focusLeft(from: HTMLElement): void {
    window.setTimeout(() => {
      const active = this.shadow?.activeElement ?? null;
      if (active && (active === this.card || this.card?.contains(active) || active === from))
        return;
      if (active && this.cardItem && active === this.cardItem.anchor) return;
      if (active?.classList.contains('tag') || active?.classList.contains('chip')) return;
      this.closeCard(false);
    }, 0);
  }

  private openCard(it: Item, anchor: HTMLElement, focusInto: boolean): void {
    const p = it.res.provenance;
    if (!p) return;
    window.clearTimeout(this.hoverTimer);
    window.clearTimeout(this.closeTimer);
    const card = this.ensureCard();
    const now = this.deps.now();
    card.replaceChildren();
    card.append(
      h(
        this.doc,
        'div',
        { class: 'c-head' },
        p.siteName,
        h(this.doc, 'span', {}, readWhen(p.readAt, now)),
      ),
      h(this.doc, 'p', { class: 'c-title' }, p.title),
      h(this.doc, 'p', { class: 'c-snip' }, `“${p.snippet}”`),
      h(
        this.doc,
        'p',
        { class: 'c-match' },
        it.tier === 'changed'
          ? 'An earlier version of this passage. The highlighted detail differs.'
          : it.res.matchKind === 'meaning'
            ? 'Similar meaning, different wording'
            : 'Same wording as a paragraph you read',
      ),
    );
    const actions = h(this.doc, 'div', { class: 'c-actions' });
    if (p.url) {
      const open = h(this.doc, 'a', {
        class: 'btn',
        href: p.url,
        target: '_blank',
        rel: 'noopener noreferrer',
      });
      open.append('Open original', svgOf(this.doc, ICON.externalLink));
      actions.append(open);
    } else {
      actions.append(h(this.doc, 'span', { class: 'c-match' }, hostnameOf(p.url, p.siteName)));
    }
    if (it.tier === 'seen' || it.tier === 'similar') {
      const not = h(this.doc, 'button', { class: 'btn', type: 'button' }, 'Not old news');
      not.addEventListener('click', () => this.markNotOld(it, not));
      actions.append(not);
    }
    card.append(actions);

    anchor.after(card);
    this.cardItem = { item: it, anchor };
    this.placeCard(anchor);
    card.classList.add('open');
    anchor.setAttribute('aria-expanded', 'true');
    if (focusInto) (card.querySelector('a, button') as HTMLElement | null)?.focus();
  }

  private placeCard(anchor: HTMLElement): void {
    const card = this.card;
    if (!card) return;
    const o = this.root.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const vw = this.doc.documentElement.clientWidth;
    const vh = this.win.innerHeight;
    const height = card.offsetHeight || 200;
    const below = a.bottom + 8 + height <= vh - 8;
    const top = below ? a.bottom + 8 : Math.max(8, a.top - 8 - height);
    const left = clampX(a.left, 320, 8, vw - 8);
    card.style.left = `${left - o.left}px`;
    card.style.top = `${top - o.top}px`;
    card.style.transformOrigin = `${Math.max(0, a.left - left)}px ${below ? '0' : '100%'}`;
  }

  private closeCard(returnFocus: boolean): void {
    window.clearTimeout(this.hoverTimer);
    if (!this.card || !this.cardItem) return;
    const { anchor } = this.cardItem;
    this.card.classList.remove('open');
    anchor.removeAttribute('aria-expanded');
    this.cardItem = null;
    if (returnFocus) anchor.focus();
  }

  private markNotOld(it: Item, button: HTMLElement): void {
    const p = it.res.provenance;
    if (!p) return;
    void this.deps.feedback(it.res.fingerprint, p.paragraphId).catch(() => undefined);
    it.tier = 'new';
    it.el.style.transition = 'opacity 100ms ' + EASE_OUT;
    it.el.style.opacity = it.saved.opacity || '1';
    it.tag?.remove();
    it.dot?.remove();
    it.fallbackRule?.remove();
    it.tag = it.dot = it.fallbackRule = null;
    button.textContent = 'Marked as new';
    button.classList.add('swap');
    button.setAttribute('aria-disabled', 'true');
    window.setTimeout(() => this.closeCard(false), 1200);
    this.renderPill(it.section);
    this.onChange?.(this.counts(it.section));
  }

  // ---- Pill ----------------------------------------------------------------------------------

  private renderPill(section: Section): void {
    if (section !== this.active) return;
    if (this.timeline && !this.timeline.finished) return;
    this.pill.showResult(this.counts(section), section.degraded);
  }

  private updateActive(force = false): void {
    if (this.sections.length < 2) {
      this.active = this.sections[0] ?? null;
      return;
    }
    const now = performance.now();
    if (!force && now - this.lastActive < 100) return;
    this.lastActive = now;
    const mid = this.win.innerHeight / 2;
    let best: Section | null = null;
    let bestDist = Infinity;
    for (const s of this.sections) {
      const first = s.items[0]?.el.getBoundingClientRect();
      const last = s.items[s.items.length - 1]?.el.getBoundingClientRect();
      if (!first || !last) continue;
      const dist = mid < first.top ? first.top - mid : mid > last.bottom ? mid - last.bottom : 0;
      if (dist < bestDist) {
        best = s;
        bestDist = dist;
      }
    }
    if (best && best !== this.active) {
      this.active = best;
      this.pill.setCard(best.card);
      this.pill.showResult(this.counts(best), best.degraded);
      this.onChange?.(this.counts(best));
    }
  }

  // ---- Layout --------------------------------------------------------------------------------

  private queueLayout(): void {
    if (this.layoutQueued) return;
    this.layoutQueued = true;
    requestAnimationFrame(() => {
      this.layoutQueued = false;
      this.layoutAll();
    });
  }

  private queueLayoutNow(): void {
    this.layoutAll();
    this.queueLayout();
  }

  private isFree(x: number, y: number, width: number): boolean {
    const vh = this.win.innerHeight;
    if (y < 0 || y > vh - 1) return true;
    const doc = this.doc;
    for (const px of [x + 4, x + width - 4]) {
      if (px < 0 || px > this.doc.documentElement.clientWidth - 1) continue;
      const hit = doc.elementFromPoint(px, y);
      if (!hit || hit === doc.documentElement || hit === doc.body || hit === this.host) continue;
      if (hit.matches('img, video, iframe, canvas, svg, input, button, select, textarea, a'))
        return false;
      for (const n of hit.childNodes)
        if (n.nodeType === 3 && (n.textContent ?? '').trim()) return false;
    }
    return true;
  }

  private layoutAll(): void {
    if (!this.host) return;
    const o = this.root.getBoundingClientRect();
    const vw = this.doc.documentElement.clientWidth;
    type Job = { it: Item; r: DOMRect };
    const jobs: Job[] = [];
    for (const s of this.sections) {
      for (const it of s.items) {
        if (it.folded) continue;
        jobs.push({ it, r: it.el.getBoundingClientRect() });
      }
    }
    for (const { it, r } of jobs) {
      const visible = r.width > 0 && r.height > 0;
      if (it.tag) {
        it.tag.hidden = !visible;
        if (visible) this.placeTagFor(it, r, vw, o);
      }
      if (it.fallbackRule) {
        it.fallbackRule.hidden = !visible;
        it.fallbackRule.style.left = `${r.left - 8 - o.left}px`;
        it.fallbackRule.style.top = `${r.top - o.top}px`;
        it.fallbackRule.style.height = `${r.height}px`;
      }
      this.placeChips(it, o, vw, visible);
    }
    for (const s of this.sections) {
      for (const run of s.runs) this.placeFoldButton(run, o);
    }
    this.placeMarker(o);
    if (this.cardItem && this.card?.classList.contains('open'))
      this.placeCard(this.cardItem.anchor);
  }

  private placeTagFor(it: Item, r: DOMRect, vw: number, o: DOMRect): void {
    const tag = it.tag as HTMLElement;
    const width = tag.offsetWidth || 160;
    const placement = placeTag(
      { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      width,
      vw,
      (x, w) => this.isFree(x, r.top + 10, w),
    );
    it.mode = placement.mode;
    tag.dataset['mode'] = placement.mode;
    if (placement.mode === 'right' || placement.mode === 'left') {
      tag.style.left = `${placement.x - o.left}px`;
      tag.style.top = `${r.top - o.top}px`;
      if (it.revealed) tag.classList.add('on');
      it.dot?.remove();
      it.dot = null;
    } else {
      // Floating tag: 6 px above the paragraph's top-left; a dot marks the paragraph in dot mode.
      tag.style.left = `${r.left - o.left}px`;
      tag.style.top = `${r.top - 26 - o.top}px`;
      if (placement.mode === 'dot') {
        if (!it.dot) {
          const dot = h(this.doc, 'button', {
            class: 'dot on',
            type: 'button',
            'aria-label': tag.textContent ?? '',
          });
          dot.addEventListener('click', () => this.openCard(it, tag, true));
          dot.addEventListener('focus', () => {
            this.showFloating(it, true);
            this.openCard(it, tag, false);
          });
          dot.addEventListener('blur', () => this.focusLeft(dot));
          dot.addEventListener('pointerenter', () => {
            this.showFloating(it, true);
            this.scheduleCard(it, tag);
          });
          dot.addEventListener('pointerleave', () => {
            this.showFloating(it, false);
            this.scheduleClose();
          });
          it.dot = dot;
          this.layer.append(dot);
        }
        it.dot.style.left = `${placement.x - o.left}px`;
        it.dot.style.top = `${r.top + 6 - o.top}px`;
        tag.tabIndex = -1;
      } else {
        it.dot?.remove();
        it.dot = null;
      }
      if (!tag.matches(':focus')) tag.classList.toggle('on', it.hover);
    }
  }

  private placeChips(it: Item, o: DOMRect, vw: number, visible: boolean): void {
    let cursor = -Infinity;
    for (const c of it.chips) {
      c.el.hidden = !visible;
      if (!visible) continue;
      const rects = c.range ? [...c.range.getClientRects()] : [];
      const anchorRect = rects[0] ?? it.el.getBoundingClientRect();
      // Pulse rectangles over the token itself.
      if (c.pulses.length !== rects.length) {
        for (const p of c.pulses) p.remove();
        c.pulses = rects.map(() => h(this.doc, 'div', { class: 'pulse' }));
        const steady = this.timeline && this.timeline.finished ? (this.highlight ? 0 : 0.35) : null;
        for (const p of c.pulses) {
          if (steady !== null) p.style.opacity = String(steady);
          this.layer.append(p);
        }
      }
      rects.forEach((rect, i) => {
        const p = c.pulses[i] as HTMLElement;
        p.style.left = `${rect.left - 1 - o.left}px`;
        p.style.top = `${rect.top - 1 - o.top}px`;
        p.style.width = `${rect.width + 2}px`;
        p.style.height = `${rect.height + 2}px`;
      });
      const width = Math.min(360, c.el.offsetWidth || 240);
      const left = Math.max(cursor + 6, clampX(anchorRect.left, width, 8, vw - 8));
      c.el.style.left = `${left - o.left}px`;
      c.el.style.top = `${anchorRect.top - 6 - 24 - o.top}px`;
      cursor = left + width;
    }
    if (it.more) {
      it.more.hidden = !visible;
      it.more.classList.toggle('on', visible);
      it.more.style.left = `${cursor + 6 - o.left}px`;
      const top = it.chips[0]?.el.style.top;
      if (top) it.more.style.top = top;
    }
  }

  // ---- Keyboard: N, J, K, Esc ----------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.card?.classList.contains('open')) {
        this.closeCard(true);
        e.stopPropagation();
      } else if (this.pill.closeTray()) {
        e.stopPropagation();
      }
      return;
    }
    if (!this.settings.keys || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (isEditable(e.composedPath()[0] ?? e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'n') {
      e.preventDefault();
      this.toggleFold();
    } else if (k === 'j' || k === 'k') {
      e.preventDefault();
      this.jump(k === 'j' ? 1 : -1);
    }
  }

  /** New and changed paragraphs of every section, in document order. */
  private litItems(): Item[] {
    return this.sections
      .flatMap((s) => s.items)
      .filter((i) => (i.tier === 'new' || i.tier === 'changed') && !i.folded)
      .sort((a, b) =>
        a.el === b.el
          ? 0
          : a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1,
      );
  }

  jump(dir: 1 | -1): void {
    const list = this.litItems();
    if (list.length === 0) return;
    let next: Item | undefined;
    const i = this.current ? list.indexOf(this.current) : -1;
    if (i >= 0) next = list[i + dir] ?? list[i];
    else if (dir === 1) next = list.find((it) => it.el.getBoundingClientRect().top > 1) ?? list[0];
    else {
      const above = list.filter((it) => it.el.getBoundingClientRect().top < -1);
      next = above[above.length - 1] ?? list[list.length - 1];
    }
    if (next) this.focusItem(next);
  }

  private focusItem(it: Item): void {
    const prev = this.current;
    if (prev) {
      prev.el.style.outline = prev.saved.outline;
      if (prev.saved.tabindex === null) prev.el.removeAttribute('tabindex');
      else prev.el.setAttribute('tabindex', prev.saved.tabindex);
    }
    this.current = it;
    if (!it.el.hasAttribute('tabindex')) it.el.setAttribute('tabindex', '-1');
    it.el.style.outline = 'none';
    it.el.focus({ preventScroll: true });
    it.el.scrollIntoView?.({ block: 'center', behavior: 'instant' as ScrollBehavior });
    if (!this.marker) {
      this.marker = h(this.doc, 'div', { class: 'marker' });
      this.layer.append(this.marker);
    }
    this.placeMarker(this.root.getBoundingClientRect());
  }

  private placeMarker(o: DOMRect): void {
    if (!this.marker || !this.current) return;
    const r = this.current.el.getBoundingClientRect();
    this.marker.style.left = `${r.left - 10 - o.left}px`;
    this.marker.style.top = `${r.top - o.top}px`;
    this.marker.style.height = `${r.height}px`;
  }

  /** N: collapse runs of seen and similar paragraphs to hairlines, or put them back. */
  toggleFold(): void {
    this.folded = !this.folded;
    this.applyFold(this.folded);
    this.queueLayoutNow();
  }

  get isFolded(): boolean {
    return this.folded;
  }

  private applyFold(on: boolean): void {
    for (const s of this.sections) {
      for (const run of s.runs) this.setRun(run, false);
      for (const run of s.runs) run.button?.remove();
      s.runs = [];
      if (!on) continue;
      let cur: Item[] = [];
      const flush = (): void => {
        if (cur.length > 0) s.runs.push({ items: cur, button: null, open: false });
        cur = [];
      };
      for (const it of s.items) {
        if (it.tier === 'seen' || it.tier === 'similar') cur.push(it);
        else flush();
      }
      flush();
      for (const run of s.runs) this.setRun(run, true);
    }
    this.closeCard(false);
  }

  private setRun(run: FoldRun, fold: boolean): void {
    const [first, ...rest] = run.items;
    if (!first) return;
    if (fold) {
      first.foldSaved.css = first.el.style.cssText;
      first.el.style.cssText +=
        ';height:1px;overflow:hidden;margin-block:14px;padding:0;border:0;background:currentColor;transition:none';
      first.folded = true;
      for (const it of rest) {
        it.foldSaved.display = it.el.style.display;
        it.el.style.display = 'none';
        it.folded = true;
      }
      for (const it of run.items) {
        it.tag?.setAttribute('hidden', '');
        it.dot?.setAttribute('hidden', '');
      }
      const n = run.items.length;
      const label = `Show ${n} old ${n === 1 ? 'paragraph' : 'paragraphs'}`;
      const btn = h(
        this.doc,
        'button',
        { class: 'fold', type: 'button', 'aria-label': label },
        h(this.doc, 'span', {}, label),
      );
      btn.addEventListener('click', () => {
        this.setRun(run, false);
        btn.remove();
        run.button = null;
        this.queueLayoutNow();
      });
      run.button = btn;
      this.layer.append(btn);
    } else {
      if (!first.folded) return;
      first.el.style.cssText = first.foldSaved.css;
      first.folded = false;
      for (const it of rest) {
        it.el.style.display = it.foldSaved.display;
        it.folded = false;
      }
      for (const it of run.items) {
        it.tag?.removeAttribute('hidden');
        it.dot?.removeAttribute('hidden');
      }
    }
  }

  private placeFoldButton(run: FoldRun, o: DOMRect): void {
    const first = run.items[0];
    if (!run.button || !first?.folded) return;
    const r = first.el.getBoundingClientRect();
    run.button.style.left = `${r.left - o.left}px`;
    run.button.style.width = `${Math.max(r.width, 160)}px`;
    run.button.style.top = `${r.top + 0.5 - 12 - o.top}px`;
  }

  // ---- Teardown ------------------------------------------------------------------------------

  /** Puts every inline style back and removes everything Old News added to the page. */
  destroy(): void {
    this.ac.abort();
    window.clearTimeout(this.hoverTimer);
    window.clearTimeout(this.closeTimer);
    this.timeline?.cancel();
    if (this.folded) this.applyFold(false);
    for (const s of this.sections) {
      for (const it of s.items) {
        it.el.style.opacity = it.saved.opacity;
        it.el.style.transition = it.saved.transition;
        it.el.style.outline = it.saved.outline;
        if (it.saved.tabindex === null) it.el.removeAttribute('tabindex');
        else it.el.setAttribute('tabindex', it.saved.tabindex);
        if (it.el.getAttribute('style') === '') it.el.removeAttribute('style');
      }
    }
    this.pill?.destroy();
    this.highlight?.clear();
    try {
      CSS.highlights?.delete('on-drift');
      if (this.sheet) {
        this.doc.adoptedStyleSheets = this.doc.adoptedStyleSheets.filter((s) => s !== this.sheet);
      }
    } catch {
      // Highlight API not available: nothing to remove.
    }
    this.host?.remove();
    this.host = null;
  }

  /** Test and capture hook: the closed shadow root is only readable in the e2e build. */
  get shadowRoot(): ShadowRoot | null {
    return E2E ? this.shadow : null;
  }
}

function hostnameOf(url: string, fallback: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return fallback;
  }
}
