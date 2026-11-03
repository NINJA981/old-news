/** Stories (SPEC F14, DESIGN.md Surface 3): grouped by day, each row expands to its articles. */
import { ChevronRight, Diff, Search } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { relativeTime } from '../../engine/present';
import type { StoryOverview } from '../../host/engineHost';
import { SecondaryButton } from '../components/Button';
import { useDelayed, useStories } from '../hooks';
import { cn, Skeleton, SPRING, InlineStat, TierBar, TierLegend } from '../kit';
import { useApp } from './context';
import { dayLabel, EmptyPanel, ErrorPanel, openOnboardingTabs, PageHeader } from './parts';

function StoryRow({
  story,
  open,
  onToggle,
  now,
}: {
  story: StoryOverview;
  open: boolean;
  onToggle: () => void;
  now: number;
}) {
  const outlets = new Set(story.articles.map((a) => a.siteName)).size;
  return (
    <li className="rounded-md bg-surface shadow-e1">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-h-16 w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-4 py-3 text-left sm:flex-nowrap transition-colors duration-100 hover:bg-surface-2"
        >
          <ChevronRight
            size={16}
            strokeWidth={1.5}
            aria-hidden
            className={cn(
              // Level with the title's first line (24 px line box), not the row's centre.
              'shrink-0 self-start mt-1 text-fg-muted transition-transform duration-150',
              open && 'rotate-90',
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="on-clamp-2 font-read text-read-title text-fg">{story.label}</span>
            <span className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
              <InlineStat label="Articles" value={story.articles.length} />
              <InlineStat label="Outlets" value={outlets} />
              <InlineStat label="Last read" value={relativeTime(story.updatedAt, now)} />
            </span>
          </span>
          {story.driftCount > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-ui-strong text-drift tnum max-sm:basis-full max-sm:pl-7">
              <Diff size={14} strokeWidth={1.5} aria-hidden />
              {story.driftCount} changed {story.driftCount === 1 ? 'figure' : 'figures'}
            </span>
          ) : null}
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING.ui}
            className="overflow-hidden"
          >
            <ul className="border-t border-border px-4 pb-2">
              {story.articles.map((a) => (
                <li key={a.id} className="border-b border-border py-3 last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 truncate font-read text-read-snippet text-fg underline-offset-2 hover:underline"
                    >
                      {a.title}
                    </a>
                    <span className="shrink-0 text-caption text-fg-muted tnum">
                      {a.siteName}, {relativeTime(a.lastReadAt, now)}
                    </span>
                  </div>
                  {a.tiers ? (
                    <div className="mt-2 grid items-center gap-x-6 gap-y-2 sm:grid-cols-[1fr_minmax(220px,300px)]">
                      <TierBar counts={a.tiers} />
                      <TierLegend counts={a.tiers} />
                    </div>
                  ) : (
                    <p className="mt-1 text-caption text-fg-muted">
                      No tier breakdown was recorded for this article.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </m.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

export function Stories() {
  const { version, now, route, go } = useApp();
  const res = useStories(version);
  const slow = useDelayed(res.state === 'loading');
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const openId = route.query.get('story');

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && /^(input|textarea|select)$/i.test(t.tagName))) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groups = useMemo(() => {
    if (res.state !== 'ready') return [];
    const needle = q.trim().toLowerCase();
    const list = res.data.filter(
      (s) =>
        !needle ||
        s.label.toLowerCase().includes(needle) ||
        s.articles.some(
          (a) =>
            a.siteName.toLowerCase().includes(needle) || a.title.toLowerCase().includes(needle),
        ),
    );
    const out: { label: string; items: StoryOverview[] }[] = [];
    for (const s of list) {
      const label = dayLabel(s.updatedAt, now);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  }, [res, q, now]);

  return (
    <>
      <PageHeader
        title="Stories"
        actions={
          <div className="relative">
            <Search
              size={14}
              strokeWidth={1.5}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
            />
            <input
              ref={search}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search stories…"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search stories"
              className="w-[220px] !pl-8 text-ui"
            />
          </div>
        }
      >
        Articles you read about the same thing, newest first.
      </PageHeader>

      {res.state === 'error' ? (
        <ErrorPanel error={res.error} retry={res.reload} />
      ) : res.state === 'loading' ? (
        slow ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full !rounded-md" />
            ))}
          </div>
        ) : null
      ) : res.data.length === 0 ? (
        <EmptyPanel
          title="No stories yet."
          action={
            <>
              <SecondaryButton onClick={openOnboardingTabs}>Remember open tabs</SecondaryButton>
              <span className="text-body text-fg-muted">
                or try the{' '}
                <a href="#/playground" className="text-accent-text underline underline-offset-2">
                  Playground
                </a>
              </span>
            </>
          }
        >
          Stories appear when two articles you read share paragraphs.
        </EmptyPanel>
      ) : groups.length === 0 ? (
        <p className="text-body text-fg-muted">No story matches “{q}”.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="mb-2 text-ui-strong text-fg-muted">{g.label}</h2>
              <ul className="space-y-2">
                {g.items.map((s) => (
                  <StoryRow
                    key={s.id}
                    story={s}
                    now={now}
                    open={openId === s.id}
                    onToggle={() =>
                      go(
                        openId === s.id
                          ? '#/stories'
                          : `#/stories?story=${encodeURIComponent(s.id)}`,
                      )
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
