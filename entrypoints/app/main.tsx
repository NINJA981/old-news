/**
 * App page (DESIGN.md Surface 3): Stories, Drift, Receipt, Memory, Settings, Playground.
 * Desktop: a 240 px sidebar. At 768: a 56 px icon rail with tooltips. At 375: a top bar and a
 * sheet menu. The route, selected story and filters live in the URL hash (#/drift?story=...).
 */
import {
  Database,
  FlaskConical,
  GitCompareArrows,
  Menu,
  Newspaper,
  ReceiptText,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Drift } from '../../src/ui/app/Drift';
import { Memory } from '../../src/ui/app/Memory';
import { Palette } from '../../src/ui/app/Palette';
import { Playground } from '../../src/ui/app/Playground';
import { Receipt } from '../../src/ui/app/Receipt';
import { Settings } from '../../src/ui/app/Settings';
import { Stories } from '../../src/ui/app/Stories';
import { AppContext, NAV, parseRoute, useApp } from '../../src/ui/app/context';
import { formatCount } from '../../src/engine/present';
import { mount } from '../../src/ui/boot';
import { useHash, useMemoryStats, useSettings } from '../../src/ui/hooks';
import { Glyph, IconButton, Keycap, Stat, Tip, cn, SPRING } from '../../src/ui/kit';

const ICONS: Record<
  string,
  ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>
> = {
  stories: Newspaper,
  drift: GitCompareArrows,
  receipt: ReceiptText,
  memory: Database,
  settings: SettingsIcon,
  playground: FlaskConical,
};

const SCREENS: Record<string, ComponentType> = {
  stories: Stories,
  drift: Drift,
  receipt: Receipt,
  memory: Memory,
  settings: Settings,
  playground: Playground,
};

function PrivacyMeter({ compact }: { compact?: boolean }) {
  const { stats } = useApp();
  if (compact) return null;
  const oldest =
    stats && stats.oldestReadAt !== null
      ? Math.max(0, Math.round((stats.asOf - stats.oldestReadAt) / 86_400_000))
      : null;
  return (
    <dl className="space-y-2 border-t border-border px-4 py-4">
      <Stat label="Requests sent" value="0" />
      <Stat label="Remembered" value={stats ? formatCount(stats.paragraphs) : '…'} />
      <Stat
        label="Oldest"
        value={
          stats
            ? oldest === null
              ? 'None yet'
              : oldest === 0
                ? 'Today'
                : `${oldest} ${oldest === 1 ? 'day' : 'days'}`
            : '…'
        }
      />
    </dl>
  );
}

function NavLink({
  item,
  current,
  rail,
}: {
  item: (typeof NAV)[number];
  current: boolean;
  rail?: boolean;
}) {
  const Icon = ICONS[item.path] as ComponentType<{
    size?: number;
    strokeWidth?: number;
    'aria-hidden'?: boolean;
  }>;
  const link = (
    <a
      href={`#/${item.path}`}
      aria-current={current ? 'page' : undefined}
      aria-label={rail ? item.label : undefined}
      className={cn(
        'relative flex h-8 items-center gap-3 rounded-sm text-ui-strong transition-colors duration-100',
        rail ? 'justify-center' : 'px-3',
        current ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      {current ? (
        <m.span
          layoutId="nav-indicator"
          transition={SPRING.snappy}
          className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-accent"
        />
      ) : null}
      <Icon size={16} strokeWidth={1.5} aria-hidden />
      {rail ? null : <span className="flex-1">{item.label}</span>}
      {rail || !item.key ? null : <Keycap>{item.key}</Keycap>}
    </a>
  );
  return rail ? (
    <Tip label={item.label} side="right">
      {link}
    </Tip>
  ) : (
    link
  );
}

function Nav({ path, rail }: { path: string; rail?: boolean }) {
  return (
    <nav aria-label="Old News" className={cn('flex flex-col gap-1', rail ? 'px-2' : 'px-3')}>
      {NAV.map((n) => (
        <NavLink key={n.path} item={n} current={path === n.path} rail={rail} />
      ))}
    </nav>
  );
}

function App() {
  const { settings, update } = useSettings();
  const [hash, go] = useHash();
  const [version, setVersion] = useState(0);
  const stats = useMemoryStats(version);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const [now] = useState(() => Date.now());
  const route = useMemo(() => parseRoute(hash), [hash]);
  const goKey = useRef(0);

  // Keyboard: Ctrl/Cmd+K palette, G then S / D / R / M.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'g') {
        goKey.current = performance.now();
        return;
      }
      if (performance.now() - goKey.current < 1200) {
        const dest = { s: 'stories', d: 'drift', r: 'receipt', m: 'memory' }[k];
        if (dest) {
          goKey.current = 0;
          go(`#/${dest}`);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Memory changes while the app is open (reading in other tabs): refetch when it regains focus.
  useEffect(() => {
    const refresh = (): void => {
      if (document.visibilityState === 'visible') setVersion((v) => v + 1);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    const close = (): void => setMenu(false);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);

  const Screen = SCREENS[route.path] ?? Stories;
  const known = NAV.some((n) => n.path === route.path);
  const title = NAV.find((n) => n.path === route.path)?.label ?? 'Stories';

  return (
    <AppContext.Provider
      value={{
        route,
        go,
        settings,
        update,
        stats,
        version,
        bump: () => setVersion((v) => v + 1),
        now,
        openPalette: () => setPalette(true),
      }}
    >
      <div className="min-h-screen md:flex">
        {/* Desktop sidebar (>= 1024) and icon rail (768 to 1023). */}
        <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface md:flex md:w-14 lg:w-60">
          <div className="flex h-14 items-center gap-2 px-4 md:justify-center lg:justify-start">
            <Glyph size={18} />
            <span className="font-read text-read-title text-fg md:hidden lg:inline">Old News</span>
          </div>
          <div className="lg:hidden">
            <Nav path={route.path} rail />
          </div>
          <div className="hidden lg:block">
            <Nav path={route.path} />
          </div>
          <div className="mt-auto hidden lg:block">
            <button
              type="button"
              onClick={() => setPalette(true)}
              className="mx-3 mb-3 flex h-8 w-[calc(100%-24px)] items-center justify-between rounded-sm border border-border px-3 text-ui text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg"
            >
              Commands
              <span className="flex gap-1">
                <Keycap>Ctrl</Keycap>
                <Keycap>K</Keycap>
              </span>
            </button>
            <PrivacyMeter />
          </div>
        </aside>

        {/* Phone top bar and sheet menu (< 768). */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface px-4 md:hidden">
          <Glyph size={18} />
          <span className="font-read text-read-title text-fg">Old News</span>
          <span className="ml-2 text-ui text-fg-muted">{title}</span>
          <IconButton
            label={menu ? 'Close menu' : 'Open menu'}
            className="ml-auto"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            {menu ? <X size={16} strokeWidth={1.5} /> : <Menu size={16} strokeWidth={1.5} />}
          </IconButton>
        </header>
        <AnimatePresence>
          {menu ? (
            <m.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-x-0 top-14 z-20 border-b border-border bg-surface-2 py-3 shadow-e3 md:hidden"
            >
              <Nav path={route.path} />
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  setPalette(true);
                }}
                className="mx-3 mt-2 h-11 w-[calc(100%-24px)] rounded-sm border border-border px-3 text-left text-ui text-fg-muted"
              >
                Commands
              </button>
              <PrivacyMeter />
            </m.div>
          ) : null}
        </AnimatePresence>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[960px]" key={route.path}>
            {known ? <Screen /> : <Stories />}
          </div>
        </main>
      </div>
      <Palette open={palette} onOpenChange={setPalette} />
    </AppContext.Provider>
  );
}

mount(<App />);
