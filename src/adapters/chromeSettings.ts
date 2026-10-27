/**
 * Browser-API adapters for settings. The only places that touch chrome.storage / localStorage.
 * Everything else in src/core depends on the SettingsStore interface.
 */
import type { Settings, SettingsStore } from '../core/settings';
import { normalizeSettings, SETTINGS_KEY } from '../core/settings';

/** The slice of chrome.storage.local that we use, so tests can pass a fake. */
export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface StorageChangesLike {
  addListener(cb: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void;
  removeListener(cb: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void;
}

/** chrome.storage.local (extension) implementation. */
export class ChromeSettingsStore implements SettingsStore {
  constructor(
    private readonly area: StorageAreaLike,
    private readonly onChanged: StorageChangesLike,
    private readonly areaName = 'local',
  ) {}

  async get(): Promise<Settings> {
    const got = await this.area.get(SETTINGS_KEY);
    return normalizeSettings(got[SETTINGS_KEY]);
  }

  async set(patch: Partial<Settings>): Promise<Settings> {
    const next = normalizeSettings({ ...(await this.get()), ...patch });
    await this.area.set({ [SETTINGS_KEY]: next });
    return next;
  }

  subscribe(listener: (s: Settings) => void): () => void {
    const cb = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
      const change = changes[SETTINGS_KEY];
      if (area === this.areaName && change) listener(normalizeSettings(change.newValue));
    };
    this.onChanged.addListener(cb);
    return () => this.onChanged.removeListener(cb);
  }
}

/** Builds the store from the live `chrome` global; throws outside an extension context. */
export function chromeSettingsStore(): SettingsStore {
  const c = (globalThis as { chrome?: typeof chrome }).chrome;
  if (!c?.storage?.local) throw new Error('chrome.storage.local is not available in this context.');
  return new ChromeSettingsStore(c.storage.local, c.storage.onChanged);
}

/** The slice of Web Storage we use. */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * localStorage implementation for the web app. Reads and writes are wrapped because storage can
 * throw (private windows, blocked site data); the store then behaves as in-memory.
 */
export class WebSettingsStore implements SettingsStore {
  private cache: Settings | null = null;
  private readonly listeners = new Set<(s: Settings) => void>();

  constructor(
    private readonly storage: WebStorageLike,
    private readonly key = `old-news:${SETTINGS_KEY}`,
  ) {}

  private read(): Settings {
    if (this.cache) return this.cache;
    let raw: unknown;
    try {
      const text = this.storage.getItem(this.key);
      raw = text ? JSON.parse(text) : undefined;
    } catch {
      raw = undefined;
    }
    this.cache = normalizeSettings(raw);
    return this.cache;
  }

  async get(): Promise<Settings> {
    return this.read();
  }

  async set(patch: Partial<Settings>): Promise<Settings> {
    const next = normalizeSettings({ ...this.read(), ...patch });
    this.cache = next;
    try {
      this.storage.setItem(this.key, JSON.stringify(next));
    } catch {
      // Storage is unavailable: keep the value for this session only.
    }
    for (const l of this.listeners) l(next);
    return next;
  }

  subscribe(listener: (s: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
