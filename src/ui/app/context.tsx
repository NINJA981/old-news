/** State shared by every app screen: route, settings, memory stats and a refresh counter. */
import { createContext, useContext } from 'react';
import type { Settings } from '../../core/settings';
import type { StatsView } from '../hooks';

export interface Route {
  path: string;
  query: URLSearchParams;
}

export interface AppCtx {
  route: Route;
  go: (hash: string) => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  stats: StatsView | null;
  /** Bumped after anything that changes memory, so screens refetch. */
  version: number;
  bump: () => void;
  now: number;
  openPalette: () => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppContext');
  return ctx;
}

export function parseRoute(hash: string): Route {
  const [path = 'stories', q = ''] = hash.replace(/^#\/?/, '').split('?');
  return { path: path || 'stories', query: new URLSearchParams(q) };
}

export const NAV = [
  { path: 'stories', label: 'Stories', key: 'S' },
  { path: 'drift', label: 'Drift', key: 'D' },
  { path: 'receipt', label: 'Receipt', key: 'R' },
  { path: 'memory', label: 'Memory', key: 'M' },
  { path: 'settings', label: 'Settings', key: '' },
  { path: 'playground', label: 'Playground', key: '' },
] as const;
