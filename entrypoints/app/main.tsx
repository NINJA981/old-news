/** App page: placeholder for Stage 3. Shows memory and the receipt, and offers Forget everything. */
import { useState } from 'react';
import { clearAllSummaries, request } from '../../src/adapters/messaging';
import { formatCount, privacyMeterText, receiptSentence } from '../../src/engine/present';
import { mount } from '../../src/ui/boot';
import { DangerButton, GhostButton } from '../../src/ui/components/Button';
import { useMemoryStats, useReceipt } from '../../src/ui/hooks';

function ForgetEverything({ onDone }: { onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <DangerButton onClick={() => setConfirming(true)}>Forget everything</DangerButton>;
  }
  return (
    <div className="flex items-center gap-2" role="alert">
      <span className="text-ui text-fg-muted">
        This deletes all remembered reading and cannot be undone.
      </span>
      <DangerButton
        onClick={() => {
          void request({ type: 'memory/wipe' })
            .then(() => clearAllSummaries())
            .then(onDone);
          setConfirming(false);
        }}
      >
        Delete it all
      </DangerButton>
      <GhostButton onClick={() => setConfirming(false)}>Keep it</GhostButton>
    </div>
  );
}

function App() {
  const [version, setVersion] = useState(0);
  const stats = useMemoryStats(version);
  const receipt = useReceipt();

  return (
    <main className="mx-auto max-w-[960px] px-8 py-8 text-fg">
      <h1 className="font-read text-h1">Old News</h1>
      <section className="mt-6 rounded-md bg-surface p-4 shadow-e1">
        <h2 className="text-label-h3">Memory</h2>
        <p className="mt-2 text-body text-fg-muted tnum">
          {stats ? privacyMeterText(stats, stats.asOf) : 'Starting the engine…'}
        </p>
        {stats ? (
          <p className="mt-1 text-caption text-fg-subtle tnum">
            {formatCount(stats.articles)} articles, {formatCount(stats.stories)} stories,{' '}
            {formatCount(stats.drift)} changed figures.
          </p>
        ) : null}
        <div className="mt-4">
          <ForgetEverything onDone={() => setVersion((v) => v + 1)} />
        </div>
      </section>
      <section className="mt-4 rounded-md bg-surface p-4 shadow-e1">
        <h2 className="text-label-h3">This week</h2>
        <p className="mt-2 font-read text-read-snippet text-fg-muted">
          {receipt ? receiptSentence(receipt) : 'Nothing to show yet. Read a few articles first.'}
        </p>
      </section>
    </main>
  );
}

mount(<App />);
