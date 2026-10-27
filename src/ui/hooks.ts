/**
 * Data hooks for extension pages. Each reads through the adapters (settings store, background
 * messaging, session summaries); none of them touches paragraph text.
 */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { chromeSettingsStore } from '../adapters/chromeSettings';
import type { TabSummary } from '../adapters/messaging';
import { loadSummary, request } from '../adapters/messaging';
import type { Settings } from '../core/settings';
import { DEFAULT_SETTINGS } from '../core/settings';
import type { WeeklyReceipt } from '../engine/receipt';
import type { MemoryStats } from '../store/repo';

const store = chromeSettingsStore();

/** Settings with an updater. Derived state stays derived: components read `settings` only. */
export function useSettings(): { settings: Settings; update: (patch: Partial<Settings>) => void } {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    let live = true;
    void store.get().then((s) => live && setSettings(s));
    const off = store.subscribe(setSettings);
    return () => {
      live = false;
      off();
    };
  }, []);
  const update = useCallback((patch: Partial<Settings>) => {
    void store.set(patch).then(() => request({ type: 'settings/changed' }).catch(() => undefined));
  }, []);
  return { settings, update };
}

/** Stats plus the moment they were read, so render stays pure. */
export type StatsView = MemoryStats & { asOf: number };

export function useMemoryStats(refreshKey = 0): StatsView | null {
  const [stats, setStats] = useState<StatsView | null>(null);
  useEffect(() => {
    let live = true;
    request<MemoryStats>({ type: 'memory/stats' }).then(
      (s) => live && setStats({ ...s, asOf: Date.now() }),
      () => live && setStats(null),
    );
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return stats;
}

export function useReceipt(): WeeklyReceipt | null {
  const [receipt, setReceipt] = useState<WeeklyReceipt | null>(null);
  useEffect(() => {
    let live = true;
    request<WeeklyReceipt | null>({ type: 'receipt/week' }).then(
      (r) => live && setReceipt(r),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return receipt;
}

/** The status summary of the active tab, from chrome.storage.session. */
export function useActiveTabSummary(): TabSummary | null | undefined {
  const [summary, setSummary] = useState<TabSummary | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const found = tab?.id === undefined ? null : await loadSummary(tab.id);
      if (live) setSummary(found);
    })();
    return () => {
      live = false;
    };
  }, []);
  return summary;
}
