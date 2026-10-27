import { describe, expect, it, vi } from 'vitest';
import {
  ChromeSettingsStore,
  WebSettingsStore,
  type StorageAreaLike,
  type StorageChangesLike,
} from '../../../src/adapters/chromeSettings';
import {
  DEFAULT_SETTINGS,
  MemorySettingsStore,
  normalizeSettings,
  pauseOrigin,
  pauseScope,
  resolveTheme,
  resumeOrigin,
  SETTINGS_KEY,
} from '../../../src/core/settings';

describe('normalizeSettings', () => {
  it('returns defaults for anything that is not an object', () => {
    for (const bad of [undefined, null, 5, 'x', [], true]) {
      expect(normalizeSettings(bad)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('keeps valid keys, repairs invalid ones, drops unknown ones', () => {
    const s = normalizeSettings({
      paused: true,
      fadeStrength: 'huge',
      theme: 'dark',
      keys: 'yes',
      surprise: 1,
      pausedOrigins: ['https://a.example', 'https://a.example'],
    });
    expect(s.paused).toBe(true);
    expect(s.fadeStrength).toBe('standard');
    expect(s.theme).toBe('dark');
    expect(s.keys).toBe(true);
    expect(s.pausedOrigins).toEqual(['https://a.example']);
    expect('surprise' in s).toBe(false);
  });

  it('never shares the defaults pausedOrigins array', () => {
    const a = normalizeSettings(undefined);
    a.pausedOrigins.push('x');
    expect(DEFAULT_SETTINGS.pausedOrigins).toEqual([]);
  });
});

describe('pause rules (AC17.3)', () => {
  it('global pause wins over everything', () => {
    expect(pauseScope({ paused: true, pausedOrigins: [] }, 'https://a.example')).toBe('global');
  });

  it('per-site pause applies to that origin only', () => {
    const s = pauseOrigin(DEFAULT_SETTINGS as never, 'https://a.example');
    expect(pauseScope(s, 'https://a.example')).toBe('site');
    expect(pauseScope(s, 'https://b.example')).toBeNull();
    expect(pauseScope(resumeOrigin(s, 'https://a.example'), 'https://a.example')).toBeNull();
  });

  it('pausing twice does not duplicate', () => {
    const once = pauseOrigin(DEFAULT_SETTINGS as never, 'https://a.example');
    expect(pauseOrigin(once, 'https://a.example').pausedOrigins).toHaveLength(1);
  });
});

describe('resolveTheme', () => {
  it('follows the system only for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('MemorySettingsStore', () => {
  it('merges patches, validates them and notifies subscribers', async () => {
    const store = new MemorySettingsStore();
    const seen: boolean[] = [];
    const off = store.subscribe((s) => seen.push(s.paused));
    await store.set({ paused: true });
    off();
    await store.set({ paused: false });
    expect(seen).toEqual([true]);
    expect((await store.get()).paused).toBe(false);
    await store.set({ theme: 'nope' as never });
    expect((await store.get()).theme).toBe('system');
  });
});

describe('ChromeSettingsStore', () => {
  function fake() {
    const data: Record<string, unknown> = {};
    const listeners = new Set<(c: Record<string, { newValue?: unknown }>, a: string) => void>();
    const area: StorageAreaLike = {
      get: async (k) => (k in data ? { [k]: data[k] } : {}),
      set: async (items) => {
        for (const [k, val] of Object.entries(items)) {
          data[k] = val;
          for (const l of listeners) l({ [k]: { newValue: val } }, 'local');
        }
      },
    };
    const changes: StorageChangesLike = {
      addListener: (cb) => listeners.add(cb),
      removeListener: (cb) => listeners.delete(cb),
    };
    return { data, area, changes, listeners };
  }

  it('persists under the settings key and reads back repaired values', async () => {
    const { data, area, changes } = fake();
    const store = new ChromeSettingsStore(area, changes);
    await store.set({ theme: 'dark', paused: true });
    expect(data[SETTINGS_KEY]).toMatchObject({ theme: 'dark', paused: true });
    data[SETTINGS_KEY] = { theme: 'neon', paused: true };
    expect((await store.get()).theme).toBe('system');
  });

  it('notifies on changes from any context and unsubscribes', async () => {
    const { area, changes, listeners } = fake();
    const store = new ChromeSettingsStore(area, changes);
    const fn = vi.fn();
    const off = store.subscribe(fn);
    await store.set({ keys: false });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]?.[0].keys).toBe(false);
    off();
    expect(listeners.size).toBe(0);
  });

  it('ignores other storage areas', () => {
    const { area, changes, listeners } = fake();
    const store = new ChromeSettingsStore(area, changes);
    const fn = vi.fn();
    store.subscribe(fn);
    for (const l of listeners) l({ [SETTINGS_KEY]: { newValue: {} } }, 'session');
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('WebSettingsStore', () => {
  it('round-trips through a Storage-like object', async () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, val: string) => void mem.set(k, val),
    };
    await new WebSettingsStore(storage).set({ fadeStrength: 'light' });
    expect((await new WebSettingsStore(storage).get()).fadeStrength).toBe('light');
  });

  it('keeps working in memory when storage throws', async () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = new WebSettingsStore(storage);
    expect((await store.get()).theme).toBe('system');
    await store.set({ theme: 'light' });
    expect((await store.get()).theme).toBe('light');
  });

  it('survives corrupt JSON', async () => {
    const store = new WebSettingsStore({ getItem: () => '{not json', setItem: () => undefined });
    expect(await store.get()).toEqual(DEFAULT_SETTINGS);
  });
});
