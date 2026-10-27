/**
 * Playground (SPEC F18, DESIGN.md Surface 3): three fixture articles (one invented story, three
 * invented outlets) run through the same engine and the same overlay as a real page. Read tab 1,
 * open tab 3, and the dissolve plays. `?capture` holds the sequence for deterministic frames
 * (`window.__frame(i, fps)`), which the README GIF and the launch videos are rendered from.
 */
import { Check, CircleAlert, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import story from '../../../tests/fixtures/corpus/stories/harrow-bridge.json';
import { browser } from 'wxt/browser';
import type { PlaygroundEngine } from '../../adapters/playgroundEngine';
import { startPlaygroundEngine } from '../../adapters/playgroundEngine';
import type { AnalyseResponse, ReadResponse } from '../../host/engineHost';
import { Overlay } from '../../overlay/overlay';
import { modelSizeLabel } from '../../core/model';
import { wordCount } from '../../engine/normalize';
import { GhostButton, PrimaryButton } from '../components/Button';
import { Notice, TIER_LABEL, cn } from '../kit';
import { useApp } from './context';
import { PageHeader } from './parts';

interface Fixture {
  key: string;
  url: string;
  siteName: string;
  title: string;
  paragraphs: string[];
  labels: { tier: string }[];
}

const KEYS = ['wire', 'calder', 'morrow'] as const;
const FIXTURES: Fixture[] = KEYS.map((key) => ({
  key,
  ...((story.articles as unknown as Record<string, Omit<Fixture, 'key'>>)[key] as Omit<
    Fixture,
    'key'
  >),
}));
const ORDER = story.readingOrder as string[];

declare global {
  interface Window {
    __frame?: (i: number, fps: number) => void;
  }
}

let fontsRegistered = false;
function registerOverlayFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  for (const [name, file] of [
    ['ON Hanken', 'overlay-hanken.woff2'],
    ['ON Newsreader', 'overlay-newsreader.woff2'],
  ] as const) {
    const url = browser.runtime.getURL(`/fonts/${file}` as never);
    const face = new FontFace(name, `url(${url})`, { weight: '100 900' });
    void face.load().then(
      () => document.fonts.add(face),
      () => undefined,
    );
  }
}

const meta = (f: Fixture) => ({
  url: f.url,
  canonicalUrl: f.url,
  siteName: f.siteName,
  title: f.title,
  kind: 'news' as const,
});
const paras = (f: Fixture) => f.paragraphs.map((text, ordinal) => ({ ordinal, text }));

type Progress = { done: number; total: number } | null;

export function Playground() {
  const { settings, go } = useApp();
  const [active, setActive] = useState<string>('wire');
  const [read, setRead] = useState<string[]>([]);
  const [busy, setBusy] = useState<'idle' | 'reading' | 'analysing'>('idle');
  const [progress, setProgress] = useState<Progress>(null);
  const [result, setResult] = useState<{ key: string; data: AnalyseResponse } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const engineRef = useRef<Promise<PlaygroundEngine> | null>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const capture = useRef(new URLSearchParams(window.location.search).has('capture'));

  const engine = useCallback((): Promise<PlaygroundEngine> => {
    engineRef.current ??= startPlaygroundEngine((done, total) => setProgress({ done, total }));
    return engineRef.current;
  }, []);

  const send = useCallback(
    async <T,>(message: unknown): Promise<T> => {
      const e = await engine();
      const reply = await e.engine.handle(message);
      setModelError(e.modelError());
      if (!reply.ok) throw new Error(reply.error);
      return reply.data as T;
    },
    [engine],
  );

  const clearOverlay = useCallback(() => {
    overlayRef.current?.destroy();
    overlayRef.current = null;
  }, []);

  // Paints the overlay onto the sheet whenever a new analysis arrives.
  useEffect(() => {
    clearOverlay();
    const sheet = sheetRef.current;
    if (!result || !sheet) return;
    const blocks = [...sheet.querySelectorAll<HTMLElement>('p[data-o]')].map((element) => ({
      ordinal: Number(element.dataset['o']),
      element,
    }));
    registerOverlayFonts();
    const hidden = new Set<string>();
    const overlay = new Overlay(
      document,
      {
        fadeStrength: settings.fadeStrength,
        dissolve: settings.dissolve,
        keys: settings.keys,
        capture: capture.current,
      },
      {
        feedback: (fingerprint, oldParagraphId) =>
          send({ type: 'page/feedback', fingerprint, oldParagraphId }),
        openApp: (route) => go(route),
        hiddenStories: hidden,
        saveHidden: () => undefined,
      },
    );
    overlayRef.current = overlay;
    void overlay.addSection(result.key, blocks, result.data);
    if (capture.current) {
      window.__frame = (i, fps) => overlay.dissolveTimeline?.seek((i * 1000) / fps);
    }
    return clearOverlay;
    // The overlay is rebuilt per analysis; settings changes apply on the next open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const fixture = FIXTURES.find((f) => f.key === active) as Fixture;

  async function open(key: string, alreadyRead: readonly string[] = read): Promise<void> {
    const f = FIXTURES.find((x) => x.key === key) as Fixture;
    setActive(key);
    setNote(null);
    setResult(null);
    if (alreadyRead.includes(key)) return;
    setBusy('analysing');
    try {
      const data = await send<AnalyseResponse>({
        type: 'page/analyse',
        page: meta(f),
        paragraphs: paras(f),
      });
      setResult({ key, data });
    } catch (err) {
      setNote(`The engine stopped: ${err instanceof Error ? err.message : 'unknown error'}.`);
    } finally {
      setBusy('idle');
      setProgress(null);
    }
  }

  async function readTab(key: string, fast = false): Promise<string[]> {
    const f = FIXTURES.find((x) => x.key === key) as Fixture;
    setActive(key);
    setResult(null);
    setBusy('reading');
    setNote(null);
    try {
      const pace = !fast && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (pace) await scrollAtReadingPace(sheetRef.current, f);
      const done = await send<ReadResponse>({
        type: 'page/ingest',
        page: meta(f),
        paragraphs: paras(f),
      });
      const next = [...new Set([...read, key])];
      setRead(next);
      setNote(`Remembered ${done.remembered} paragraphs from ${f.siteName}.`);
      return next;
    } catch (err) {
      setNote(`The engine stopped: ${err instanceof Error ? err.message : 'unknown error'}.`);
      return read;
    } finally {
      setBusy('idle');
      setProgress(null);
    }
  }

  async function reset(): Promise<void> {
    clearOverlay();
    setResult(null);
    setRead([]);
    setNote(null);
    setActive('wire');
    await send({ type: 'memory/wipe' }).catch(() => undefined);
  }

  // `?capture`: read tabs 1 and 2 without pacing, then open tab 3 and hold the dissolve.
  useEffect(() => {
    if (!capture.current) return;
    void (async () => {
      await readTab('wire', true);
      await readTab('calder', true);
      await open('morrow', ['wire', 'calder']);
    })();
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next: 'read1' | 'read2' | 'open3' | null =
    busy !== 'idle'
      ? null
      : !read.includes('wire')
        ? 'read1'
        : !read.includes('calder') && active !== 'morrow'
          ? 'read2'
          : !result || result.key !== 'morrow'
            ? 'open3'
            : null;
  const NEXT_LABEL = { read1: 'Read tab 1', read2: 'Read tab 2', open3: 'Open tab 3' } as const;
  function runNext(): void {
    if (next === 'read1') void readTab('wire');
    else if (next === 'read2') void readTab('calder');
    else if (next === 'open3') void open('morrow');
  }

  const compare = result ? expectedFor(result.key, read) : null;
  const rows = result?.data.paragraphs ?? [];
  const mismatches = compare ? rows.filter((r) => compare[r.ordinal] !== r.tier).length : 0;

  return (
    <>
      <PageHeader
        title="Playground"
        actions={
          <GhostButton onClick={() => void reset()} disabled={busy !== 'idle'}>
            <RotateCcw size={14} strokeWidth={1.5} aria-hidden />
            Reset
          </GhostButton>
        }
      >
        Three fixture articles on one invented story, run through the same engine as a real page.
        Nothing here is added to your memory.
      </PageHeader>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div
          role="tablist"
          aria-label="Fixture articles"
          className="flex gap-1 rounded-sm border border-border bg-surface p-0.5"
        >
          {FIXTURES.map((f, i) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={active === f.key}
              disabled={busy !== 'idle'}
              onClick={() => void open(f.key)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-xs px-3 text-ui-strong transition-colors duration-100',
                active === f.key ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              <span className="tnum">Tab {i + 1}</span>
              <span className="hidden font-normal sm:inline">{f.siteName}</span>
              {read.includes(f.key) ? <Check size={12} strokeWidth={2} aria-label="Read" /> : null}
            </button>
          ))}
        </div>
        {next ? <PrimaryButton onClick={runNext}>{NEXT_LABEL[next]}</PrimaryButton> : null}
        <p className="min-h-5 text-caption text-fg-muted tnum" role="status" aria-live="polite">
          {busy === 'reading'
            ? 'Reading at reading pace…'
            : busy === 'analysing'
              ? progress && progress.total > 0
                ? `Embedding ${progress.done} / ${progress.total} paragraphs`
                : 'Loading the on-device model…'
              : (note ?? '')}
        </p>
      </div>

      {modelError ? (
        <Notice tone="info" icon={<CircleAlert size={14} strokeWidth={1.5} />} className="mt-4">
          The model didn’t load: {modelError}. MinHash and the fact guard still run.
        </Notice>
      ) : null}

      <div className="mt-6 grid">
        <div
          ref={sheetRef}
          className="paper w-full max-w-[720px] rounded-lg p-6 shadow-e1 sm:p-10 xl:max-w-[960px] xl:pr-[232px]"
          data-testid="sheet"
        >
          <p className="mb-4 text-caption text-fg-muted">{fixture.siteName}, fixture story</p>
          <h2 className="font-read text-h1 text-fg">{fixture.title}</h2>
          <div className="mt-6 space-y-5 font-read text-read-body text-fg">
            {fixture.paragraphs.map((text, i) => (
              <p key={`${fixture.key}-${i}`} data-o={i}>
                {text}
              </p>
            ))}
          </div>
        </div>
      </div>

      <section aria-labelledby="pg-table" className="mt-8 max-w-[720px]">
        <h2 id="pg-table" className="text-label-h3 text-fg">
          How each paragraph was matched
        </h2>
        {result ? (
          <>
            <p className="mt-2 text-body text-fg-muted tnum">
              Engine time {Math.round(result.data.timingMs)} ms for {rows.length} paragraphs.{' '}
              {compare
                ? mismatches === 0
                  ? 'Every tier matches the corpus label.'
                  : `${mismatches} ${mismatches === 1 ? 'paragraph differs' : 'paragraphs differ'} from the corpus label.`
                : 'Read the earlier tabs first to compare with the corpus labels.'}
            </p>
            <div className="mt-3 overflow-x-auto rounded-md bg-surface shadow-e1">
              <table className="w-full text-left text-ui">
                <caption className="sr-only">Tier per paragraph</caption>
                <thead className="border-b border-border text-caption text-fg-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Paragraph
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Tier
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Matched by
                    </th>
                    {compare ? (
                      <th scope="col" className="px-4 py-2 font-semibold">
                        Corpus label
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ordinal} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 tnum">{r.ordinal + 1}</td>
                      <td
                        className={cn(
                          'px-4 py-2 text-ui-strong',
                          r.tier === 'changed' && 'text-drift',
                        )}
                      >
                        {TIER_LABEL[r.tier]}
                      </td>
                      <td className="px-4 py-2 text-fg-muted">
                        {r.tier === 'changed'
                          ? r.drift
                              .map(
                                (d) =>
                                  `${d.before || 'not mentioned'} → ${d.after || 'not mentioned'}`,
                              )
                              .join(', ')
                          : r.matchKind === 'wording'
                            ? 'Same wording'
                            : r.matchKind === 'meaning'
                              ? 'Similar meaning'
                              : 'Nothing earlier'}
                      </td>
                      {compare ? (
                        <td className="px-4 py-2 text-fg-muted">
                          {TIER_LABEL[(compare[r.ordinal] ?? 'new') as keyof typeof TIER_LABEL]}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-2 text-body text-fg-muted">
            Open a tab you have not read to see how its paragraphs match what you read. The first
            analysis loads the on-device model ({modelSizeLabel()}).
          </p>
        )}
      </section>
    </>
  );
}

/** The corpus's own labels for `key`, when every earlier article in its reading order has been read. */
function expectedFor(key: string, read: readonly string[]): Record<number, string> | null {
  const i = ORDER.indexOf(key);
  if (i < 0) return null;
  if (!ORDER.slice(0, i).every((k) => read.includes(k))) return null;
  const f = FIXTURES.find((x) => x.key === key);
  if (!f) return null;
  return Object.fromEntries(f.labels.map((l, n) => [n, l.tier]));
}

/** Scrolls the sheet into view at roughly reading pace (cosmetic; capped at 5 s). */
function scrollAtReadingPace(sheet: HTMLElement | null, f: Fixture): Promise<void> {
  if (!sheet) return Promise.resolve();
  const words = f.paragraphs.reduce((n, p) => n + wordCount(p), 0);
  const duration = Math.min(5000, Math.max(1800, words * 28));
  const rect = sheet.getBoundingClientRect();
  const startY = window.scrollY;
  const endY = Math.max(startY, startY + rect.bottom - window.innerHeight + 24);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / duration);
      window.scrollTo(0, startY + (endY - startY) * t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
