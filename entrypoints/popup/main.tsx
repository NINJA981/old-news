/** Popup: placeholder for Stage 3. Shows the active page's status, a pause switch and the privacy meter. */
import { browser } from 'wxt/browser';
import { leftAloneMessage } from '../../src/core/page';
import { pillText, privacyMeterText } from '../../src/engine/present';
import type { PageStatus } from '../../src/messaging/protocol';
import { mount } from '../../src/ui/boot';
import { GhostButton, SecondaryButton } from '../../src/ui/components/Button';
import { useActiveTabSummary, useMemoryStats, useSettings } from '../../src/ui/hooks';

function StatusLine({ status }: { status: PageStatus | null }) {
  if (status?.status === 'result') {
    const sentence = pillText(status);
    return (
      <p className="text-body text-fg" data-testid="status">
        {sentence ?? 'Nothing here matched what you have read yet.'}
        {status.degraded ? (
          <span className="mt-1 block text-caption text-fg-muted">
            The language model is off, so only exact and changed matches are marked.
          </span>
        ) : null}
      </p>
    );
  }
  const message = status ? leftAloneMessage(status) : null;
  return (
    <p className="text-body text-fg-muted" data-testid="status">
      {message ??
        (status ? 'Reading this page.' : 'Open an article and Old News will take it from there.')}
    </p>
  );
}

function Popup() {
  const summary = useActiveTabSummary();
  const stats = useMemoryStats();
  const { settings, update } = useSettings();
  const status = summary?.status ?? null;

  return (
    <main className="flex h-[560px] w-[380px] flex-col bg-bg p-4 text-fg">
      <h1 className="font-read text-h2 text-fg">Old News</h1>
      <section className="mt-3 rounded-md bg-surface p-4 shadow-e1" aria-live="polite">
        <StatusLine status={status} />
      </section>
      <div className="mt-3 flex gap-2">
        <SecondaryButton onClick={() => update({ paused: !settings.paused })}>
          {settings.paused ? 'Resume' : 'Pause everywhere'}
        </SecondaryButton>
        <GhostButton
          onClick={() => void browser.tabs.create({ url: browser.runtime.getURL('/app.html') })}
        >
          Open Old News
        </GhostButton>
      </div>
      <footer className="mt-auto text-caption text-fg-subtle tnum" data-testid="meter">
        {stats ? privacyMeterText(stats, stats.asOf) : '0 requests sent'}
      </footer>
    </main>
  );
}

mount(<Popup />);
