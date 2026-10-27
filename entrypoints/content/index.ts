/**
 * Content script (ADR-0001 §3 flow 1). Vanilla TypeScript, no UI framework: it gates, detects,
 * extracts, maps (or does nothing), asks the engine for tiers, paints the overlay, reports status
 * for the badge and popup, and tracks dwell so read paragraphs are remembered.
 *
 * Registered at runtime once the reader grants site access (see background.ts), and also injected
 * on demand into already-open tabs for install-time ingest. The content script never fetches.
 */
import { browser } from 'wxt/browser';
import { chromeSettingsStore } from '../../src/adapters/chromeSettings';
import { request } from '../../src/adapters/messaging';
import { pageGate, statusFromAnalysis, storyCardOf } from '../../src/core/page';
import type { Settings } from '../../src/core/settings';
import { pauseScope } from '../../src/core/settings';
import { wordCount } from '../../src/engine/normalize';
import type { MappedBlock } from '../../src/extract';
import {
  analyseDocument,
  analyseSubtree,
  DwellTracker,
  LiveBlogTracker,
  longParagraphCount,
} from '../../src/extract';
import type { AnalyseResponse } from '../../src/host/engineHost';
import type { PageStatus } from '../../src/messaging/protocol';
import type { Counts, OverlaySettings } from '../../src/overlay/overlay';
import { Overlay } from '../../src/overlay/overlay';

const STARTED = Symbol.for('old-news.content.started');
const FLUSH_MS = 5000;
const TICK_MS = 500;
const MUTATION_DEBOUNCE_MS = 150;
const HIDDEN_KEY = 'hiddenStories';

type Mapped = Extract<ReturnType<typeof analyseDocument>, { status: 'mapped' }>;

function report(status: PageStatus): void {
  request({ type: 'page/status', url: location.href, status }).catch(() => undefined);
}

function pageMeta(a: Pick<Mapped, 'page'> & { kind?: Mapped['kind'] }) {
  return { ...a.page, kind: a.kind ?? ('news' as const) };
}

/**
 * Visible share of a paragraph. A paragraph taller than the viewport can never be 60% visible,
 * so its share is measured against the viewport height instead.
 */
function visibleRatio(entry: IntersectionObserverEntry): number {
  const h = entry.boundingClientRect.height;
  if (h <= 0) return 0;
  return entry.intersectionRect.height / Math.min(h, window.innerHeight);
}

interface Dwell {
  add(blocks: readonly MappedBlock[]): void;
  stop(): void;
}

function trackDwell(initial: readonly MappedBlock[], canonicalUrl: string): Dwell {
  const byElement = new Map<Element, number>();
  const isActive = (): boolean => document.visibilityState === 'visible' && document.hasFocus();
  const tracker = new DwellTracker(new Map(), performance.now(), isActive());
  let pending: number[] = [];

  const observer = new IntersectionObserver(
    (entries) => {
      const now = performance.now();
      for (const e of entries) {
        const ordinal = byElement.get(e.target);
        if (ordinal !== undefined) tracker.setRatio(ordinal, visibleRatio(e), now);
      }
    },
    { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
  );
  const add = (blocks: readonly MappedBlock[]): void => {
    for (const b of blocks) {
      tracker.add(b.ordinal, wordCount(b.text));
      byElement.set(b.element, b.ordinal);
      observer.observe(b.element);
    }
  };
  add(initial);

  const flush = (): void => {
    pending.push(...tracker.takeRead(performance.now()));
    if (pending.length === 0) return;
    const ordinals = pending;
    pending = [];
    request({ type: 'page/read', canonicalUrl, ordinals }).catch(() => undefined);
  };
  const sync = (): void => tracker.setActive(isActive(), performance.now());

  const ac = new AbortController();
  const opts = { signal: ac.signal };
  document.addEventListener('visibilitychange', sync, opts);
  window.addEventListener('focus', sync, opts);
  window.addEventListener('blur', sync, opts);
  window.addEventListener('pagehide', flush, opts);
  const tick = setInterval(() => pending.push(...tracker.takeRead(performance.now())), TICK_MS);
  const send = setInterval(flush, FLUSH_MS);
  return {
    add,
    stop() {
      flush();
      ac.abort();
      clearInterval(tick);
      clearInterval(send);
      observer.disconnect();
    },
  };
}

// ---- Overlay plumbing ------------------------------------------------------------------------

function overlaySettings(s: Settings): OverlaySettings {
  return { fadeStrength: s.fadeStrength, dissolve: s.dissolve, keys: s.keys };
}

async function loadHidden(): Promise<Set<string>> {
  try {
    const got = await browser.storage.local.get(HIDDEN_KEY);
    const list = got[HIDDEN_KEY];
    return new Set(
      Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

let fontsReady: Promise<void> | null = null;

/** Registers the two private overlay faces from base64 delivered by the background (0 requests). */
function loadFonts(): Promise<void> {
  fontsReady ??= (async () => {
    const faces: [string, 'newsreader' | 'hanken'][] = [
      ['ON Newsreader', 'newsreader'],
      ['ON Hanken', 'hanken'],
    ];
    await Promise.all(
      faces.map(async ([name, family]) => {
        const b64 = await request<string>({ type: 'font/get', family });
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const face = new FontFace(name, bytes.buffer, { weight: '100 900' });
        await face.load();
        document.fonts.add(face);
      }),
    );
  })().catch(() => undefined);
  return fontsReady;
}

function statusFromCounts(
  c: Counts,
  data: Pick<AnalyseResponse, 'storyId' | 'previouslyOn'>,
): PageStatus {
  return {
    status: 'result',
    total: c.total,
    new: c.new,
    seen: c.seen,
    similar: c.similar,
    changed: c.changed,
    degraded: c.degraded,
    storyId: data.storyId,
    story: storyCardOf(data.previouslyOn),
  };
}

/** One running pass over the page: overlay, observers and dwell trackers. `stop()` undoes it all. */
class Session {
  private overlay: Overlay | null = null;
  private observer: MutationObserver | null = null;
  private timer = 0;
  private url = location.href;
  private blogUrl = '';
  private liveblog: LiveBlogTracker | null = null;
  private records: MutationRecord[] = [];
  private stopped = false;
  private base: Mapped | null = null;
  private readonly dwellByUrl = new Map<string, Dwell>();

  constructor(private readonly settings: Settings) {}

  async start(): Promise<void> {
    const gate = pageGate({
      settings: this.settings,
      origin: location.origin,
      protocol: location.protocol,
      incognito: chrome.extension.inIncognitoContext,
    });
    if (!gate.run) return report(gate.status);

    const analysis = analyseDocument(document, location.href);
    const early = statusFromAnalysis(analysis);
    if (early) return report(early);
    if (analysis.status !== 'mapped') return;
    this.base = analysis;

    let blocks: MappedBlock[] = analysis.blocks;
    if (analysis.kind === 'liveblog') {
      this.liveblog = new LiveBlogTracker();
      blocks = this.liveblog.scan(document).map((p) => ({
        ordinal: p.ordinal,
        text: p.text,
        element: p.element,
      }));
    }
    const canonicalUrl = analysis.page.canonicalUrl;
    this.blogUrl = canonicalUrl;

    const hidden = await loadHidden();
    const overlay = new Overlay(document, overlaySettings(this.settings), {
      feedback: (fingerprint, oldParagraphId) =>
        request({ type: 'page/feedback', fingerprint, oldParagraphId }),
      openApp: (route) => void request({ type: 'app/open', route }).catch(() => undefined),
      hiddenStories: hidden,
      saveHidden: () =>
        void browser.storage.local.set({ [HIDDEN_KEY]: [...hidden] }).catch(() => undefined),
    });
    this.overlay = overlay;

    report({ status: 'analysing', total: blocks.length });
    overlay.showAnalysing(blocks.length, blocks[0]?.element);
    void loadFonts();
    try {
      const data = await this.analyse(pageMeta(analysis), blocks, false);
      if (this.stopped) return;
      await Promise.race([loadFonts(), new Promise((r) => setTimeout(r, 250))]);
      overlay.onChange = (c) => report(statusFromCounts(c, data));
      await overlay.addSection(canonicalUrl, blocks, data);
      report(statusFromCounts(overlay.counts(), data));
      this.dwellByUrl.set(canonicalUrl, trackDwell(blocks, canonicalUrl));
      this.watch();
    } catch (err) {
      // The message never carries page text; only the reason string is reported.
      const reason = err instanceof Error ? err.message.slice(0, 200) : 'failed';
      report({ status: 'error', reason });
      overlay.showError(() => void this.restart());
    }
  }

  private async restart(): Promise<void> {
    this.stop();
    const next = new Session(this.settings);
    session = next;
    await next.start();
  }

  private analyse(
    page: ReturnType<typeof pageMeta>,
    blocks: readonly MappedBlock[],
    append: boolean,
  ): Promise<AnalyseResponse> {
    return request<AnalyseResponse>({
      type: 'page/analyse',
      page,
      paragraphs: blocks.map((b) => ({ ordinal: b.ordinal, text: b.text })),
      append,
    });
  }

  // ---- Live blogs and infinite scroll ----------------------------------------------------------

  private watch(): void {
    this.observer = new MutationObserver((records) => {
      this.records.push(...records);
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.onMutations(), MUTATION_DEBOUNCE_MS);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private async onMutations(): Promise<void> {
    const records = this.records;
    this.records = [];
    if (this.stopped || !this.overlay || !this.base) return;
    try {
      if (this.liveblog) await this.appendPosts(this.liveblog);
      if (location.href !== this.url) await this.nextArticle(records);
    } catch {
      // A failed append leaves the page as it is; the next mutation retries.
    }
  }

  private async appendPosts(tracker: LiveBlogTracker): Promise<void> {
    const overlay = this.overlay;
    const base = this.base;
    if (!overlay || !base) return;
    const fresh = tracker.scan(document);
    if (fresh.length === 0) return;
    const blocks: MappedBlock[] = fresh.map((p) => ({
      ordinal: p.ordinal,
      text: p.text,
      element: p.element,
    }));
    const data = await this.analyse(pageMeta(base), blocks, true);
    if (this.stopped) return;
    await overlay.appendToSection(this.blogUrl, blocks, data);
    this.dwellByUrl.get(this.blogUrl)?.add(blocks);
    report(statusFromCounts(overlay.counts(), data));
  }

  private async nextArticle(records: readonly MutationRecord[]): Promise<void> {
    const overlay = this.overlay;
    const base = this.base;
    if (!overlay || !base) return;
    const url = location.href;
    const added = records
      .flatMap((r) => [...r.addedNodes])
      .filter((n): n is Element => n.nodeType === 1);
    const roots = added.filter((el) => !added.some((o) => o !== el && o.contains(el)));
    const root = roots.find((el) => longParagraphCount(el) >= 3);
    if (!root) return;
    const sub = analyseSubtree(root, url, base.page);
    this.url = url;
    if (sub.status !== 'mapped') return;
    const data = await this.analyse(pageMeta({ page: sub.page, kind: 'news' }), sub.blocks, false);
    if (this.stopped) return;
    await overlay.addSection(sub.page.canonicalUrl, sub.blocks, data);
    this.dwellByUrl.set(sub.page.canonicalUrl, trackDwell(sub.blocks, sub.page.canonicalUrl));
    report(statusFromCounts(overlay.counts(), data));
  }

  applySettings(s: Settings): void {
    this.overlay?.setSettings(overlaySettings(s));
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
    this.observer?.disconnect();
    for (const d of this.dwellByUrl.values()) d.stop();
    this.overlay?.destroy();
    this.overlay = null;
  }
}

let session: Session | null = null;

async function runAuto(): Promise<void> {
  const store = chromeSettingsStore();
  let settings = await store.get();
  session = new Session(settings);
  await session.start();

  // Settings that change what is on the page take effect without a reload.
  store.subscribe((next) => {
    const changed =
      pauseScope(next, location.origin) !== pauseScope(settings, location.origin) ||
      next.fadeStrength !== settings.fadeStrength;
    settings = next;
    if (changed) {
      session?.stop();
      session = new Session(next);
      void session.start();
    } else {
      session?.applySettings(next);
    }
  });
}

/** Install-time ingest and onboarding probes (SPEC F13): reads the already-loaded DOM only. */
function answerIngest(message: unknown, sendResponse: (r: unknown) => void): boolean {
  const type = (message as { type?: string } | null)?.type;
  if (type !== 'ingest/probe' && type !== 'ingest/run') return false;
  const analysis = analyseDocument(document, location.href);
  if (analysis.status !== 'mapped') {
    sendResponse(type === 'ingest/probe' ? { article: false } : { remembered: 0 });
    return false;
  }
  if (type === 'ingest/probe') {
    sendResponse({
      article: true,
      title: analysis.page.title,
      siteName: analysis.page.siteName,
      url: analysis.page.url,
      paragraphs: analysis.total,
    });
    return false;
  }
  request<{ remembered: number }>({
    type: 'page/ingest',
    page: pageMeta(analysis),
    paragraphs: analysis.blocks.map((b) => ({ ordinal: b.ordinal, text: b.text })),
  }).then(
    (r) => sendResponse({ remembered: r.remembered }),
    () => sendResponse({ remembered: 0 }),
  );
  return true;
}

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  registration: 'runtime',
  runAt: 'document_idle',
  main() {
    const g = globalThis as Record<symbol, unknown>;
    if (g[STARTED]) return;
    g[STARTED] = true;
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) =>
      answerIngest(message, sendResponse),
    );
    void runAuto();
  },
});
