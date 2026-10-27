/**
 * Settings (SPEC §7, `chrome.storage.local` key `settings`). Pure: schema, defaults, repair and
 * the pause rules. Persistence sits behind the small `SettingsStore` interface; the extension
 * implements it with chrome.storage.local, the web app with localStorage (src/adapters).
 */
import * as v from 'valibot';

export const SETTINGS_KEY = 'settings';

export const SettingsSchema = v.object({
  paused: v.boolean(),
  pausedOrigins: v.pipe(v.array(v.pipe(v.string(), v.maxLength(300))), v.maxLength(500)),
  fadeStrength: v.picklist(['standard', 'light']),
  dissolve: v.boolean(),
  keys: v.boolean(),
  theme: v.picklist(['system', 'light', 'dark']),
  onboardingDone: v.boolean(),
  ingestOffered: v.boolean(),
});
export type Settings = v.InferOutput<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  paused: false,
  pausedOrigins: [],
  fadeStrength: 'standard',
  dissolve: true,
  keys: true,
  theme: 'system',
  onboardingDone: false,
  ingestOffered: false,
});

/**
 * Repairs whatever was stored: each known key is kept when valid and replaced by its default
 * otherwise; unknown keys are dropped. Never throws.
 */
export function normalizeSettings(raw: unknown): Settings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS, pausedOrigins: [] };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out as Settings;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(SettingsSchema.entries) as (keyof Settings)[]) {
    if (!(key in obj)) continue;
    const field = SettingsSchema.entries[key];
    const r = v.safeParse(field, obj[key]);
    if (r.success) out[key] = r.output;
  }
  out['pausedOrigins'] = [...new Set(out['pausedOrigins'] as string[])];
  return out as Settings;
}

export interface SettingsStore {
  get(): Promise<Settings>;
  set(patch: Partial<Settings>): Promise<Settings>;
  /** Calls back after any change from any context; returns an unsubscribe function. */
  subscribe(listener: (s: Settings) => void): () => void;
}

export type PauseScope = 'global' | 'site' | null;

/** Why Old News must not act on this origin, or null when it may. */
export function pauseScope(
  settings: Pick<Settings, 'paused' | 'pausedOrigins'>,
  origin: string,
): PauseScope {
  if (settings.paused) return 'global';
  return settings.pausedOrigins.includes(origin) ? 'site' : null;
}

export function pauseOrigin(settings: Settings, origin: string): Settings {
  if (settings.pausedOrigins.includes(origin)) return settings;
  return { ...settings, pausedOrigins: [...settings.pausedOrigins, origin] };
}

export function resumeOrigin(settings: Settings, origin: string): Settings {
  return { ...settings, pausedOrigins: settings.pausedOrigins.filter((o) => o !== origin) };
}

/** Resolves the `theme` setting against the system preference. */
export function resolveTheme(theme: Settings['theme'], systemDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

/** In-memory store: used by tests and as the fallback when no persistence exists. */
export class MemorySettingsStore implements SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<(s: Settings) => void>();

  constructor(initial: unknown = undefined) {
    this.value = normalizeSettings(initial);
  }

  async get(): Promise<Settings> {
    return this.value;
  }

  async set(patch: Partial<Settings>): Promise<Settings> {
    this.value = normalizeSettings({ ...this.value, ...patch });
    for (const l of this.listeners) l(this.value);
    return this.value;
  }

  subscribe(listener: (s: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
