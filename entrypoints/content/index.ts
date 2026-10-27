/**
 * Content script bootstrap (ADR-0001 §3 flow 1). Vanilla TypeScript, no UI framework: it gates,
 * detects, extracts, maps (or does nothing), asks the engine for tiers, reports status for the
 * badge and popup, and tracks dwell so read paragraphs are remembered.
 *
 * Registered at runtime once the reader grants site access (see background.ts), and also injected
 * on demand into already-open tabs for install-time ingest. The content script never fetches.
 *
 * Painting (fades, tags, chips, pill) is the overlay stage and is not wired here yet.
 */
import { browser } from 'wxt/browser';
import { chromeSettingsStore } from '../../src/adapters/chromeSettings';
import { request } from '../../src/adapters/messaging';
import { wordCount } from '../../src/engine/normalize';
import type { MappedBlock } from '../../src/extract';
import { analyseDocument, DwellTracker } from '../../src/extract';
import { pageGate, statusFromAnalysis, statusFromResult } from '../../src/core/page';
import type { AnalyseResponse } from '../../src/host/engineHost';
import type { PageStatus } from '../../src/messaging/protocol';

const STARTED = Symbol.for('old-news.content.started');
const FLUSH_MS = 5000;
const TICK_MS = 500;

type Mapped = Extract<ReturnType<typeof analyseDocument>, { status: 'mapped' }>;

function report(status: PageStatus): void {
  request({ type: 'page/status', url: location.href, status }).catch(() => undefined);
}

function pageMeta(a: Mapped) {
  return { ...a.page, kind: a.kind };
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

function trackDwell(blocks: readonly MappedBlock[], canonicalUrl: string): void {
  const words = new Map(blocks.map((b) => [b.ordinal, wordCount(b.text)]));
  const isActive = (): boolean => document.visibilityState === 'visible' && document.hasFocus();
  const tracker = new DwellTracker(words, performance.now(), isActive());
  const byElement = new Map<Element, number>(blocks.map((b) => [b.element, b.ordinal]));
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
  for (const b of blocks) observer.observe(b.element);

  const flush = (): void => {
    pending.push(...tracker.takeRead(performance.now()));
    if (pending.length === 0) return;
    const ordinals = pending;
    pending = [];
    request({ type: 'page/read', canonicalUrl, ordinals }).catch(() => undefined);
  };
  const sync = (): void => tracker.setActive(isActive(), performance.now());

  document.addEventListener('visibilitychange', sync);
  window.addEventListener('focus', sync);
  window.addEventListener('blur', sync);
  window.addEventListener('pagehide', flush);
  setInterval(() => pending.push(...tracker.takeRead(performance.now())), TICK_MS);
  setInterval(flush, FLUSH_MS);
}

async function runAuto(): Promise<void> {
  const settings = await chromeSettingsStore().get();
  const gate = pageGate({
    settings,
    origin: location.origin,
    protocol: location.protocol,
    incognito: chrome.extension.inIncognitoContext,
  });
  if (!gate.run) return report(gate.status);

  const analysis = analyseDocument(document, location.href);
  const early = statusFromAnalysis(analysis);
  if (early) return report(early);
  if (analysis.status !== 'mapped') return;

  report({ status: 'analysing', total: analysis.blocks.length });
  try {
    const data = await request<AnalyseResponse>({
      type: 'page/analyse',
      page: pageMeta(analysis),
      paragraphs: analysis.blocks.map((b) => ({ ordinal: b.ordinal, text: b.text })),
    });
    report(statusFromResult(data));
    trackDwell(analysis.blocks, analysis.page.canonicalUrl);
  } catch (err) {
    // The message never carries page text; only the reason string is reported.
    report({
      status: 'error',
      reason: err instanceof Error ? err.message.slice(0, 200) : 'failed',
    });
  }
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
