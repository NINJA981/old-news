/**
 * Applies the stored theme before first paint. Imported first by every extension page so the
 * document never flashes the wrong theme. Reads chrome.storage.local through the settings
 * adapter; any failure leaves the OS preference in charge (tokens.css handles that).
 */
import { chromeSettingsStore } from '../adapters/chromeSettings';
import type { Settings } from '../core/settings';
import { resolveTheme } from '../core/settings';

const dark = (): boolean => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function applyTheme(theme: Settings['theme']): void {
  document.documentElement.dataset['theme'] = resolveTheme(theme, dark());
}

export async function initTheme(): Promise<void> {
  try {
    const store = chromeSettingsStore();
    applyTheme((await store.get()).theme);
    store.subscribe((s) => applyTheme(s.theme));
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => void store.get().then((s) => applyTheme(s.theme)));
  } catch {
    // Not in an extension context or storage blocked: the OS preference applies.
  }
}
