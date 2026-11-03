/** Ctrl+K command palette (cmdk): navigation, actions, settings and the danger zone. */
import { Command } from 'cmdk';
import { useState } from 'react';
import { pauseOrigin, resumeOrigin } from '../../core/settings';
import { toast } from '../toast';
import { useApp, NAV } from './context';
import { useStories } from '../hooks';
import { Keycap } from '../kit';
import { openOnboardingTabs } from './parts';

type Page = 'root' | 'pause' | 'resume';

export function Palette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { go, settings, update, version } = useApp();
  const stories = useStories(version);
  const [page, setPage] = useState<Page>('root');
  const [search, setSearch] = useState('');

  const change = (o: boolean): void => {
    if (!o) {
      setPage('root');
      setSearch('');
    }
    onOpenChange(o);
  };

  const sites =
    stories.state === 'ready'
      ? [
          ...new Set(
            stories.data.flatMap((s) =>
              s.articles.map((a) => {
                try {
                  return new URL(a.url).origin;
                } catch {
                  return '';
                }
              }),
            ),
          ),
        ].filter(Boolean)
      : [];

  const done = (fn: () => void) => () => {
    change(false);
    fn();
  };

  const itemClass =
    'flex h-9 cursor-pointer items-center justify-between gap-3 rounded-sm px-3 text-ui text-fg data-[selected=true]:bg-surface-3';
  const groupClass =
    '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-fg-muted';

  return (
    <Command.Dialog
      open={open}
      onOpenChange={change}
      label="Command palette"
      overlayClassName="fixed inset-0 z-40 bg-bg/70"
      contentClassName="fixed left-1/2 top-[20vh] z-50 w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface-2 font-ui shadow-[0_0_0_1px_oklch(1_0_0/0.06),0_24px_48px_-12px_rgb(0_0_0/0.6)]"
      onKeyDown={(e) => {
        if (e.key === 'Backspace' && !search && page !== 'root') {
          e.preventDefault();
          setPage('root');
        }
      }}
    >
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder={
          page === 'root'
            ? 'Search commands…'
            : page === 'pause'
              ? 'Pick a site to pause…'
              : 'Pick a site to resume…'
        }
        className="h-12 w-full border-0 border-b border-border bg-transparent px-4 text-lead text-fg outline-none placeholder:text-fg-subtle"
        style={{ borderRadius: 0, height: 48, boxShadow: 'none' }}
      />
      <Command.List className="max-h-[360px] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-ui text-fg-muted">
          No command matches “{search}”.
        </Command.Empty>

        {page === 'root' ? (
          <>
            <Command.Group heading="Go to" className={groupClass}>
              {NAV.map((n) => (
                <Command.Item
                  key={n.path}
                  value={`Go to ${n.label}`}
                  onSelect={done(() => go(`#/${n.path}`))}
                  className={itemClass}
                >
                  Go to {n.label}
                  {n.key ? (
                    <span className="flex gap-1">
                      <Keycap>G</Keycap>
                      <Keycap>{n.key}</Keycap>
                    </span>
                  ) : null}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="Actions" className={groupClass}>
              <Command.Item
                value="Pause on a site"
                onSelect={() => {
                  setSearch('');
                  setPage('pause');
                }}
                className={itemClass}
              >
                Pause on a site…
              </Command.Item>
              {settings.pausedOrigins.length > 0 ? (
                <Command.Item
                  value="Resume a paused site"
                  onSelect={() => {
                    setSearch('');
                    setPage('resume');
                  }}
                  className={itemClass}
                >
                  Resume a paused site…
                </Command.Item>
              ) : null}
              <Command.Item
                value={settings.paused ? 'Resume everywhere' : 'Pause everywhere'}
                onSelect={done(() => {
                  update({ paused: !settings.paused });
                  toast(settings.paused ? 'Resumed everywhere' : 'Paused everywhere');
                })}
                className={itemClass}
              >
                {settings.paused ? 'Resume everywhere' : 'Pause everywhere'}
              </Command.Item>
              <Command.Item
                value="Remember open tabs"
                onSelect={done(openOnboardingTabs)}
                className={itemClass}
              >
                Remember open tabs
              </Command.Item>
              <Command.Item
                value="Save this week's receipt"
                onSelect={done(() => go('#/receipt'))}
                className={itemClass}
              >
                Save this week’s receipt
              </Command.Item>
              <Command.Item
                value="Run the playground"
                onSelect={done(() => go('#/playground'))}
                className={itemClass}
              >
                Run the playground
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Settings" className={groupClass}>
              <Command.Item
                value="Fade strength: Standard"
                onSelect={done(() => update({ fadeStrength: 'standard' }))}
                className={itemClass}
              >
                Fade strength: Standard
              </Command.Item>
              <Command.Item
                value="Fade strength: Light"
                onSelect={done(() => update({ fadeStrength: 'light' }))}
                className={itemClass}
              >
                Fade strength: Light
              </Command.Item>
              <Command.Item
                value="Dissolve animation"
                onSelect={done(() => update({ dissolve: !settings.dissolve }))}
                className={itemClass}
              >
                Dissolve animation: {settings.dissolve ? 'turn off' : 'turn on'}
              </Command.Item>
              <Command.Item
                value="In-page keys"
                onSelect={done(() => update({ keys: !settings.keys }))}
                className={itemClass}
              >
                In-page keys: {settings.keys ? 'turn off' : 'turn on'}
              </Command.Item>
              {(['system', 'light', 'dark'] as const).map((t) => (
                <Command.Item
                  key={t}
                  value={`Theme: ${t}`}
                  onSelect={done(() => update({ theme: t }))}
                  className={itemClass}
                >
                  Theme: {t[0]?.toUpperCase()}
                  {t.slice(1)}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="Danger" className={groupClass}>
              <Command.Item
                value="Forget everything"
                onSelect={done(() => go('#/memory'))}
                className={itemClass}
              >
                Forget everything…
              </Command.Item>
            </Command.Group>
          </>
        ) : page === 'pause' ? (
          <Command.Group heading="Sites you have read" className={groupClass}>
            {sites
              .filter((o) => !settings.pausedOrigins.includes(o))
              .map((o) => (
                <Command.Item
                  key={o}
                  value={o}
                  onSelect={done(() => {
                    update(pauseOrigin(settings, o));
                    toast(`Paused on ${o}`);
                  })}
                  className={itemClass}
                >
                  {o}
                </Command.Item>
              ))}
          </Command.Group>
        ) : (
          <Command.Group heading="Paused sites" className={groupClass}>
            {settings.pausedOrigins.map((o) => (
              <Command.Item
                key={o}
                value={o}
                onSelect={done(() => {
                  update(resumeOrigin(settings, o));
                  toast(`Resumed on ${o}`);
                })}
                className={itemClass}
              >
                {o}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
