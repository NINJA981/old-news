/**
 * Toolbar popup (SPEC F11, F15; DESIGN.md Surface 2). 380 x 560, designed at its real size.
 * Paints from chrome.storage.session without waiting on the engine; the footer value is cached
 * locally so it paints instantly too. Every state in the DESIGN.md table has a branch here.
 */
import { AppWindow, CircleAlert, Info, Pause } from 'lucide-react';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { leftAloneMessage } from '../../src/core/page';
import { modelSizeLabel } from '../../src/core/model';
import { pauseOrigin, resumeOrigin } from '../../src/core/settings';
import { formatCount, privacyMeterText, relativeTime } from '../../src/engine/present';
import type { TierCounts } from '../../src/engine/types';
import type { PageStatus, StoryCard } from '../../src/messaging/protocol';
import { mount } from '../../src/ui/boot';
import { GhostButton, PrimaryButton } from '../../src/ui/components/Button';
import {
  useActiveTab,
  useDelayed,
  useDriftRows,
  useMemoryStats,
  useSettings,
} from '../../src/ui/hooks';
import {
  Glyph,
  IconButton,
  Notice,
  Skeleton,
  Stat,
  Switch,
  TabPanel,
  Tabs,
  TierBar,
  TierLegend,
} from '../../src/ui/kit';
import { toast, toastUndo } from '../../src/ui/toast';

type Result = Extract<PageStatus, { status: 'result' }>;

const REASONS: Record<string, string> = {
  'too-few-paragraphs': 'Fewer than three paragraphs were found',
  'low-mapping': 'Text is split across ad slots or scripts',
  'double-mapped': 'The same text appears in two places',
  'too-little-text': 'There is hardly any text to read (it may be drawn on a canvas)',
};

function hostOf(origin: string | null | undefined): string | null {
  try {
    return origin ? new URL(origin).hostname : null;
  } catch {
    return null;
  }
}

function openApp(hash = ''): void {
  void browser.tabs.create({ url: browser.runtime.getURL('/app.html') + hash });
  window.close();
}

function openOnboarding(hash: string): void {
  void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') + hash });
  window.close();
}

// ---- Status card ---------------------------------------------------------------------------------

function CountBlock({ r }: { r: Result }) {
  const lit = r.new + r.changed;
  const counts: TierCounts = { new: r.new, changed: r.changed, similar: r.similar, seen: r.seen };
  const allNew = r.seen + r.similar + r.changed === 0;
  return (
    <>
      {allNew ? (
        <p className="text-count text-fg tnum">
          {r.total}
          <span className="ml-2 text-ui font-normal text-fg-muted">
            All {r.total} paragraphs are new to you.
          </span>
        </p>
      ) : lit === 0 ? (
        <p className="flex flex-col gap-1">
          <span className="text-count text-fg">Nothing new here.</span>
          <span className="text-ui text-fg-muted">
            All <span className="tnum">{r.total}</span> paragraphs are old news.
          </span>
        </p>
      ) : (
        <p className="flex items-baseline gap-2">
          <span className="text-count text-fg tnum">
            {lit} of {r.total}
          </span>
          <span className="text-ui text-fg-muted">paragraphs are new to you</span>
        </p>
      )}
      <TierBar counts={counts} className="mt-3" />
      <div className="mt-3">
        <TierLegend counts={counts} />
      </div>
    </>
  );
}

function LoadingCard({ firstTime }: { firstTime: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-3 h-1.5 w-full" />
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      {firstTime ? (
        <p className="mt-3 text-caption text-fg-muted">
          Loading the on-device model ({modelSizeLabel()}). First time only.
        </p>
      ) : (
        <p className="mt-3 text-caption text-fg-muted">Checking this page…</p>
      )}
    </div>
  );
}

function StatusBody({
  status,
  tab,
  host,
  paused,
  hasMemory,
  firstModelLoad,
}: {
  status: PageStatus | null;
  tab: { id: number } | null;
  host: string | null;
  paused: boolean;
  hasMemory: boolean | null;
  firstModelLoad: boolean;
}) {
  const showSkeleton = useDelayed(status?.status === 'analysing');
  const [why, setWhy] = useState(false);

  if (paused) {
    return (
      <div>
        <p className="text-ui text-fg-muted">
          Old News is paused everywhere. Nothing is read or remembered.
        </p>
      </div>
    );
  }
  if (status?.status === 'result') {
    return (
      <>
        <CountBlock r={status} />
        {status.degraded ? (
          <Notice
            tone="info"
            icon={<Info size={14} strokeWidth={1.5} />}
            className="mt-3 !bg-surface-2"
          >
            <span className="text-caption">
              Similar-wording matching is off: the model didn’t load. Exact matches still work.
            </span>
          </Notice>
        ) : null}
      </>
    );
  }
  if (status?.status === 'analysing') {
    return showSkeleton ? (
      <LoadingCard firstTime={firstModelLoad} />
    ) : (
      <p className="text-ui text-fg-muted">Checking this page…</p>
    );
  }
  if (status?.status === 'error') {
    return (
      <div role="alert">
        <p className="flex items-start gap-2 text-ui text-danger">
          <CircleAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          The matching engine stopped: {lowerFirst(status.reason)}.
        </p>
        <div className="mt-3 flex gap-2">
          <PrimaryButton
            onClick={() => tab && void browser.tabs.reload(tab.id).then(() => window.close())}
          >
            Retry
          </PrimaryButton>
          <GhostButton
            onClick={() => {
              void navigator.clipboard.writeText(`Old News engine error: ${status.reason}`);
              toast('Copied the error details');
            }}
          >
            Copy error details
          </GhostButton>
        </div>
      </div>
    );
  }
  if (status?.status === 'unmapped') {
    return (
      <div>
        <p className="text-ui text-fg-muted">{leftAloneMessage(status)}</p>
        <p className="mt-2 text-caption text-fg-muted">
          {REASONS[status.reason] ?? 'The text could not be matched to the page'}
        </p>
        <button
          type="button"
          onClick={() => setWhy((v) => !v)}
          aria-expanded={why}
          className="mt-2 text-ui text-accent-text underline underline-offset-2"
        >
          Why this happens
        </button>
        {why ? (
          <p className="mt-2 text-caption text-fg-muted">
            Old News only acts when every paragraph it read maps to one place on the page. Text
            split across ad slots, drawn on a canvas, or cut off by a paywall can’t be matched, so
            the page stays untouched.
          </p>
        ) : null}
      </div>
    );
  }
  if (status?.status === 'paused') {
    return (
      <p className="text-ui text-fg-muted">
        {status.scope === 'global'
          ? 'Old News is paused everywhere.'
          : `Paused on ${host ?? 'this site'}. Nothing here is read or remembered.`}
      </p>
    );
  }
  if (status?.status === 'non-english') {
    return <p className="text-ui text-fg-muted">{leftAloneMessage(status)}</p>;
  }
  if (status?.status === 'not-article' || !status) {
    return (
      <p className="text-ui text-fg-muted">
        {hasMemory === false && !status
          ? 'Open an article and read it for a few seconds. Old News takes it from there.'
          : 'This page isn’t an article, so Old News is staying out of it.'}
      </p>
    );
  }
  return null;
}

/** "The model file is missing" reads as one sentence after a colon: "…stopped: the model file…". */
function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
}

function SiteRow({
  host,
  origin,
  pausedHere,
  globalPaused,
  onToggle,
}: {
  host: string;
  origin: string;
  pausedHere: boolean;
  globalPaused: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mb-2 truncate text-caption text-fg-muted" title={origin}>
        {host}
      </p>
      <Switch
        label="On for this site"
        shortcut="P"
        checked={!pausedHere && !globalPaused}
        disabled={globalPaused}
        onCheckedChange={onToggle}
        description={undefined}
      />
    </div>
  );
}

// ---- Story and drift panels ----------------------------------------------------------------------

function StoryPanel({ story, now }: { story: StoryCard | null | undefined; now: number }) {
  if (!story) {
    return (
      <p className="px-1 py-4 text-ui text-fg-muted">
        No earlier articles on this story yet. When you read a second one, it is listed here.
      </p>
    );
  }
  return (
    <div className="py-2">
      <h2 className="px-1 font-read text-read-title text-fg on-clamp-2">{story.label}</h2>
      {story.changed.length > 0 ? (
        <>
          <h3 className="mt-3 px-1 text-caption font-semibold text-fg-muted">What changed</h3>
          <ul className="mt-1">
            {story.changed.map((c, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 px-1 py-1.5">
                <span className="min-w-0 truncate text-ui text-fg-muted">{c.context}</span>
                <span className="shrink-0 text-ui-strong text-drift tnum">
                  {c.before || 'not mentioned'} → {c.after || 'not mentioned'}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h3 className="mt-3 px-1 text-caption font-semibold text-fg-muted">Read earlier</h3>
      <ul className="mt-1">
        {story.articles.map((a, i) => (
          <li key={`${a.url}-${i}`} className="rounded-sm px-1 py-2 hover:bg-surface-2">
            <a
              href={a.url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="block min-w-0"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-caption font-semibold text-fg">{a.siteName}</span>
                <span className="shrink-0 text-caption text-fg-muted tnum">
                  {relativeTime(a.readAt, now)}
                </span>
              </span>
              <span className="mt-0.5 block truncate font-read text-read-snippet text-fg-muted">
                {a.title}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DriftPanel({
  storyId,
  now,
  pageChanges,
}: {
  storyId: string | null;
  now: number;
  /** Figures that differ on the page in view; listed before they are read and stored. */
  pageChanges: StoryCard['changed'];
}) {
  const rows = useDriftRows(storyId);
  const slow = useDelayed(rows.state === 'loading');
  const noneStored = storyId === null || (rows.state === 'ready' && rows.data.length === 0);
  if (noneStored && pageChanges.length > 0) {
    return (
      <ul className="py-1">
        {pageChanges.map((c, i) => (
          <li key={i} className="border-b border-border px-1 py-3 last:border-0">
            <p className="truncate text-caption text-fg-muted">{c.context || 'Changed detail'}</p>
            <p className="mt-0.5 text-ui-strong text-drift tnum">
              {c.before || 'not mentioned'} → {c.after || 'not mentioned'}
            </p>
            <p className="mt-1 truncate text-caption text-fg-muted">
              {c.siteName} said {c.before || 'nothing'}
            </p>
          </li>
        ))}
      </ul>
    );
  }
  if (noneStored) {
    return (
      <p className="px-1 py-4 text-ui text-fg-muted">
        No changed figures for this story. When a number, date, name or outcome differs from
        something you read, it’s listed here.
      </p>
    );
  }
  if (rows.state === 'error') {
    return (
      <Notice tone="danger" icon={<CircleAlert size={14} strokeWidth={1.5} />} className="mt-3">
        Couldn’t read your memory: {rows.error}.{' '}
        <button type="button" onClick={rows.reload} className="underline underline-offset-2">
          Retry
        </button>
      </Notice>
    );
  }
  if (rows.state === 'loading') {
    return slow ? (
      <div className="space-y-3 py-3" aria-busy="true">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    ) : null;
  }
  return (
    <ul className="py-1">
      {rows.data.map((d) => (
        <li key={d.id} className="border-b border-border px-1 py-3 last:border-0">
          <p className="truncate text-caption text-fg-muted">{d.context || 'Changed detail'}</p>
          <p className="mt-0.5 text-ui-strong text-drift tnum">
            {d.before || 'not mentioned'} → {d.after || 'not mentioned'}
          </p>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 text-caption">
            <div className="min-w-0">
              <dt className="text-fg-muted">Earlier</dt>
              <dd className="truncate text-fg tnum">
                {d.oldSite}, {relativeTime(d.oldAt, now)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-fg-muted">Now</dt>
              <dd className="truncate text-fg tnum">
                {d.newSite}, {relativeTime(d.newAt, now)}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

// ---- Popup ---------------------------------------------------------------------------------------

function Popup() {
  const { tab, summary, ready } = useActiveTab();
  const { settings, loaded, update } = useSettings();
  const stats = useMemoryStats();
  const [view, setView] = useState<'story' | 'drift'>('story');
  const [now] = useState(() => Date.now());
  const status = summary?.status ?? null;
  const host = hostOf(tab?.origin);
  const pausedHere = !!tab?.origin && settings.pausedOrigins.includes(tab.origin);
  const storyId = status?.status === 'result' ? status.storyId : null;
  const story = status?.status === 'result' ? status.story : null;
  // The welcome screen yields to a page status that explains what happened on *this* page: a
  // fresh install on a page that cannot be lined up must still say so (SPEC AC2.2).
  const pageExplained =
    status?.status === 'result' || status?.status === 'unmapped' || status?.status === 'error';
  const firstRun = stats !== null && stats.paragraphs === 0 && !pageExplained;

  function toggleSite(on: boolean): void {
    if (!tab?.origin || !host) return;
    const origin = tab.origin;
    if (on) {
      update(resumeOrigin(settings, origin));
      toast(`Resumed on ${host}`);
    } else {
      update(pauseOrigin(settings, origin));
      toastUndo(`Paused on ${host}`, () => update(resumeOrigin(settings, origin)));
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'p' && tab?.origin && !settings.paused) toggleSite(pausedHere);
      else if (k === 's') setView('story');
      else if (k === 'd') setView('drift');
      else if (k === 'o') openApp();
      else if (k === 'escape') window.close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const statusKey = status?.status ?? 'none';
  const hasMemory = stats ? stats.paragraphs > 0 : null;

  return (
    <main className="flex h-[560px] w-[380px] flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <Glyph size={16} />
        <h1 className="font-read text-read-title text-fg">Old News</h1>
        {settings.paused ? (
          <span className="ml-1 inline-flex items-center gap-1 rounded-xs border border-border px-1.5 text-caption text-fg-muted">
            <Pause size={12} strokeWidth={1.5} /> Paused
          </span>
        ) : null}
        <IconButton
          label="Open Old News"
          shortcut="O"
          className="ml-auto"
          onClick={() => openApp()}
        >
          <AppWindow size={16} strokeWidth={1.5} />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden px-4">
        {firstRun && loaded ? (
          <section className="flex h-full flex-col items-center justify-center gap-3 pb-8 text-center">
            <Glyph size={64} className="text-fg-subtle" />
            <h2 className="font-read text-h2 text-fg">Nothing remembered yet.</h2>
            <p className="max-w-[280px] text-body text-fg-muted">
              Read an article for a few seconds and Old News will recognise it next time.
            </p>
            <PrimaryButton onClick={() => openOnboarding('#/tabs')}>
              Remember open tabs
            </PrimaryButton>
          </section>
        ) : (
          <div className="flex h-full flex-col">
            <section
              aria-live="polite"
              data-testid="status"
              data-state={statusKey}
              className="shrink-0 rounded-md bg-surface p-4 shadow-e1"
            >
              {ready && loaded ? (
                <StatusBody
                  status={status}
                  tab={tab}
                  host={host}
                  paused={settings.paused}
                  hasMemory={hasMemory}
                  firstModelLoad={!stats?.modelInfo}
                />
              ) : (
                <div className="h-[88px]" />
              )}
              {settings.paused ? (
                <div className="mt-3">
                  <PrimaryButton onClick={() => update({ paused: false })}>Resume</PrimaryButton>
                </div>
              ) : tab?.origin && host ? (
                <SiteRow
                  host={host}
                  origin={tab.origin}
                  pausedHere={pausedHere}
                  globalPaused={settings.paused}
                  onToggle={toggleSite}
                />
              ) : null}
            </section>

            <Tabs
              value={view}
              onValueChange={(v) => setView(v as 'story' | 'drift')}
              tabs={[
                { value: 'story', label: 'This story' },
                { value: 'drift', label: 'Drift' },
              ]}
              className="mt-3 flex min-h-0 flex-1 flex-col"
            >
              <TabPanel value="story" className="min-h-0 flex-1 overflow-y-auto">
                <StoryPanel story={story} now={now} />
              </TabPanel>
              <TabPanel value="drift" className="min-h-0 flex-1 overflow-y-auto">
                <DriftPanel storyId={storyId} now={now} pageChanges={story?.changed ?? []} />
              </TabPanel>
            </Tabs>
          </div>
        )}
      </div>

      <footer
        data-testid="meter"
        className="flex h-11 shrink-0 items-center justify-between gap-4 border-t border-border bg-surface px-4"
      >
        <dl className="contents">
          <Stat label="Requests sent" value="0" />
          <Stat label="Remembered" value={stats ? formatCount(stats.paragraphs) : '…'} />
          <Stat
            label="Oldest"
            value={
              stats
                ? stats.oldestReadAt === null
                  ? 'None yet'
                  : (() => {
                      const d = Math.max(
                        0,
                        Math.round((stats.asOf - stats.oldestReadAt) / 86_400_000),
                      );
                      return d === 0 ? 'Today' : `${d} ${d === 1 ? 'day' : 'days'}`;
                    })()
                : '…'
            }
          />
        </dl>
        <span className="sr-only">
          {stats ? privacyMeterText(stats, stats.asOf) : '0 requests sent'}
        </span>
      </footer>
    </main>
  );
}

mount(<Popup />);
