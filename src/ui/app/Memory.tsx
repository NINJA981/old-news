/** Memory (SPEC F17): what is stored, paused sites, and the irreversible Forget everything. */
import { useRef, useState } from 'react';
import { clearAllSummaries, request } from '../../adapters/messaging';
import { resumeOrigin } from '../../core/settings';
import { formatCount, privacyMeterText } from '../../engine/present';
import { DangerButton, GhostButton, SecondaryButton } from '../components/Button';
import { Skeleton, Stat } from '../kit';
import { toast } from '../toast';
import { useApp } from './context';
import { PageHeader } from './parts';

function mb(bytes: number): string {
  return bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function ForgetEverything() {
  const { stats, bump } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);

  async function wipe(): Promise<void> {
    const n = stats?.paragraphs ?? 0;
    setBusy(true);
    try {
      await request({ type: 'memory/wipe' });
      await clearAllSummaries();
      try {
        localStorage.removeItem('old-news:stats');
      } catch {
        // Nothing cached: nothing to clear.
      }
      toast(`Forgot ${formatCount(n)} ${n === 1 ? 'paragraph' : 'paragraphs'}.`);
      bump();
      setConfirming(false);
    } catch (err) {
      toast(`Couldn’t forget: ${err instanceof Error ? err.message : 'unknown error'}.`);
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <DangerButton
        onClick={() => {
          setConfirming(true);
          requestAnimationFrame(() => cancel.current?.focus());
        }}
      >
        Forget everything
      </DangerButton>
    );
  }
  return (
    <div
      role="alertdialog"
      aria-label="Confirm forgetting everything"
      className="rounded-md bg-danger-soft p-4"
    >
      <p className="text-body text-danger">
        Forget {formatCount(stats?.paragraphs ?? 0)} paragraphs, {formatCount(stats?.articles ?? 0)}{' '}
        articles and {formatCount(stats?.drift ?? 0)} drift records? This can’t be undone.
      </p>
      <div className="mt-3 flex gap-2">
        <DangerButton busy={busy} className="!bg-danger !text-bg" onClick={() => void wipe()}>
          Forget everything
        </DangerButton>
        <button
          ref={cancel}
          type="button"
          onClick={() => setConfirming(false)}
          className="inline-flex h-8 items-center rounded-sm px-3 text-button text-fg hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Memory() {
  const { stats, settings, update } = useApp();
  return (
    <>
      <PageHeader title="Memory">
        What Old News remembers, kept in this browser profile only. Everything is deleted
        automatically after 30 days.
      </PageHeader>
      <section aria-labelledby="mem-h" className="rounded-md bg-surface p-4 shadow-e1">
        <h2 id="mem-h" className="text-label-h3 text-fg">
          Stored on this computer
        </h2>
        {stats ? (
          stats.paragraphs === 0 ? (
            <p className="mt-3 text-body text-fg-muted">Memory is empty.</p>
          ) : (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Stat label="Paragraphs remembered" value={formatCount(stats.paragraphs)} />
              <Stat label="Articles" value={formatCount(stats.articles)} />
              <Stat label="Stories" value={formatCount(stats.stories)} />
              <Stat label="Drift records" value={formatCount(stats.drift)} />
              <Stat label="Approximate size" value={mb(stats.approxBytes)} />
              <Stat
                label="Oldest record"
                value={
                  stats.oldestReadAt === null
                    ? 'None yet'
                    : `${Math.max(0, Math.round((stats.asOf - stats.oldestReadAt) / 86_400_000))} days`
                }
              />
            </dl>
          )
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-4" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
        <p className="mt-4 text-caption text-fg-muted">
          Deleted automatically after 30 days. Full paragraph text is never stored.
        </p>
        <p className="sr-only">{stats ? privacyMeterText(stats, stats.asOf) : ''}</p>
      </section>

      <section aria-labelledby="paused-h" className="mt-4 rounded-md bg-surface p-4 shadow-e1">
        <h2 id="paused-h" className="text-label-h3 text-fg">
          Paused sites
        </h2>
        {settings.pausedOrigins.length === 0 ? (
          <p className="mt-3 text-body text-fg-muted">
            No sites are paused. Pause one from the toolbar popup and it is listed here.
          </p>
        ) : (
          <ul className="mt-2">
            {settings.pausedOrigins.map((o) => (
              <li
                key={o}
                className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
              >
                <span className="min-w-0 truncate text-ui text-fg">{o}</span>
                <SecondaryButton
                  onClick={() => {
                    update(resumeOrigin(settings, o));
                    toast(`Resumed on ${o}`);
                  }}
                >
                  Resume
                </SecondaryButton>
              </li>
            ))}
          </ul>
        )}
        {settings.paused ? (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-body text-fg-muted">Old News is paused everywhere.</span>
            <GhostButton onClick={() => update({ paused: false })}>Resume everywhere</GhostButton>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="forget-h" className="mt-4 rounded-md bg-surface p-4 shadow-e1">
        <h2 id="forget-h" className="text-label-h3 text-fg">
          Forget everything
        </h2>
        <p className="mt-2 mb-4 max-w-[56ch] text-body text-fg-muted">
          Deletes every remembered paragraph, article, story and drift record, and resets the
          counters. There is no undo.
        </p>
        <ForgetEverything />
      </section>
    </>
  );
}
