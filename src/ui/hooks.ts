/**
 * Data hooks for extension pages. Each reads through the adapters (settings store, background
 * messaging, session summaries); none of them touches paragraph text.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { chromeSettingsStore } from '../adapters/chromeSettings';
import type { TabSummary } from '../adapters/messaging';
import { loadSummary, request } from '../adapters/messaging';
import type { Settings } from '../core/settings';
import { DEFAULT_SETTINGS } from '../core/settings';
import type { WeeklyReceipt } from '../engine/receipt';
import type { DriftRow, StoryOverview } from '../host/engineHost';
import type { Message } from '../messaging/protocol';
import type { MemoryStats } from '../store/repo';

const store = chromeSettingsStore();

/** Settings with an updater. Derived state stays derived: components read `settings` only. */
export function useSettings(): {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    void store.get().then((s) => {
      if (!live) return;
      setSettings(s);
      setLoaded(true);
    });
    const off = store.subscribe(setSettings);
    return () => {
      live = false;
      off();
    };
  }, []);
  const update = useCallback((patch: Partial<Settings>) => {
    void store.set(patch).then(() => request({ type: 'settings/changed' }).catch(() => undefined));
  }, []);
  return { settings, loaded, update };
}

export type Remote<T> =
  | { state: 'loading'; data: null; error: null }
  | { state: 'ready'; data: T; error: null }
  | { state: 'error'; data: null; error: string };

/** Sends one request to the background and tracks loading, data and error. `reload` re-runs it. */
export function useRequest<T>(
  message: Message | null,
  refreshKey: unknown = 0,
): Remote<T> & { reload: () => void } {
  const [result, setResult] = useState<Remote<T>>({ state: 'loading', data: null, error: null });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(message);
  useEffect(() => {
    if (!message) return;
    let live = true;
    request<T>(message).then(
      (data) => live && setResult({ state: 'ready', data, error: null }),
      (err: unknown) =>
        live &&
        setResult({
          state: 'error',
          data: null,
          error: err instanceof Error ? err.message : 'The request failed.',
        }),
    );
    return () => {
      live = false;
    };
    // `key` stands in for the message object, so a new object with the same content does not refetch.
  }, [key, refreshKey, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...result, reload };
}

/** True once `active` has been true for `ms` (skeletons appear after a 150 ms delay). */
export function useDelayed(active: boolean, ms = 150): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setOn(true), ms);
    return () => {
      window.clearTimeout(t);
      setOn(false);
    };
  }, [active, ms]);
  return active && on;
}

/** Stats plus the moment they were read, so render stays pure. */
export type StatsView = MemoryStats & {
  asOf: number;
  modelAvailable: boolean;
  embedderId: string | null;
  modelInfo: { backend?: string } | null;
};

const STATS_CACHE = 'old-news:stats';

function cachedStats(): StatsView | null {
  try {
    const raw = localStorage.getItem(STATS_CACHE);
    return raw ? (JSON.parse(raw) as StatsView) : null;
  } catch {
    return null;
  }
}

/** Memory stats. The last value is cached locally so the popup footer paints instantly. */
export function useMemoryStats(refreshKey = 0): StatsView | null {
  const [stats, setStats] = useState<StatsView | null>(cachedStats);
  useEffect(() => {
    let live = true;
    request<Omit<StatsView, 'asOf'>>({ type: 'memory/stats' }).then(
      (s) => {
        if (!live) return;
        const next = { ...s, asOf: Date.now() };
        setStats(next);
        try {
          localStorage.setItem(STATS_CACHE, JSON.stringify(next));
        } catch {
          // Storage blocked: the footer just waits for the live value.
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return stats;
}

export function useStories(refreshKey = 0) {
  return useRequest<StoryOverview[]>({ type: 'stories/overview' }, refreshKey);
}

export function useDriftRows(storyId?: string | null, refreshKey = 0) {
  return useRequest<DriftRow[]>(
    storyId === null ? null : { type: 'drift/overview', storyId },
    refreshKey,
  );
}

export function useReceipt(refreshKey = 0) {
  return useRequest<WeeklyReceipt | null>({ type: 'receipt/week' }, refreshKey);
}

function originOf(url: string | undefined): string | null {
  try {
    const u = new URL(url ?? '');
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

export interface ActiveTab {
  id: number;
  url: string;
  origin: string | null;
}

/** The active tab and its page summary from chrome.storage.session, kept live. */
export function useActiveTab(): {
  tab: ActiveTab | null;
  summary: TabSummary | null;
  ready: boolean;
} {
  const [tab, setTab] = useState<ActiveTab | null>(null);
  const [summary, setSummary] = useState<TabSummary | null>(null);
  const [ready, setReady] = useState(false);
  const idRef = useRef<number | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      // `popup.html?tab=<id>` points the popup at another tab (e2e and screenshots open it as a page).
      const asked = Number(new URLSearchParams(window.location.search).get('tab'));
      const [t] = asked
        ? [await browser.tabs.get(asked)]
        : await browser.tabs.query({ active: true, currentWindow: true });
      if (!live) return;
      if (t?.id === undefined) return setReady(true);
      idRef.current = t.id;
      const origin = originOf(t.url);
      setTab({ id: t.id, url: t.url ?? '', origin });
      setSummary(await loadSummary(t.id));
      if (live) setReady(true);
    })();
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
      const id = idRef.current;
      if (area !== 'session' || id === null) return;
      const c = changes[`summary:${id}`];
      if (c) setSummary((c.newValue as TabSummary | undefined) ?? null);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => {
      live = false;
      browser.storage.onChanged.removeListener(onChange);
    };
  }, []);
  return { tab, summary, ready };
}

/** Keeps `window.location.hash` and React state in sync (the app's routes live in the URL hash). */
export function useHash(): [string, (next: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash || '#/stories');
  useEffect(() => {
    const on = (): void => setHash(window.location.hash || '#/stories');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((next: string) => {
    window.location.hash = next;
  }, []);
  return [hash, go];
}
