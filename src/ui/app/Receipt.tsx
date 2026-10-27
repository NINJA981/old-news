/** Weekly receipt (SPEC F16): built only from the reader's own local daily counters. */
import { CircleAlert, Copy, Download } from 'lucide-react';
import { useState } from 'react';
import { receiptSentence } from '../../engine/present';
import type { WeeklyReceipt } from '../../engine/receipt';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { useDelayed, useReceipt } from '../hooks';
import { Glyph, Notice, Skeleton } from '../kit';
import { toast } from '../toast';
import { useApp } from './context';
import { EmptyPanel, ErrorPanel, PageHeader } from './parts';
import { downloadBlob, receiptStats, renderReceiptPng } from './receiptImage';

function Card({ r }: { r: WeeklyReceipt }) {
  return (
    <figure
      className="paper m-0 w-full overflow-hidden rounded-lg shadow-e1 sm:aspect-[1200/630]"
      style={{ containerType: 'inline-size' }}
      aria-label={`Reading receipt, week ${r.week}`}
    >
      <div
        className="flex h-full flex-col justify-between gap-6"
        style={{ padding: 'max(20px, 6cqw)' }}
      >
        <p
          className="font-read text-fg"
          style={{
            fontSize: 'max(20px, calc(100cqw * 44 / 1200))',
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            fontWeight: 500,
            textWrap: 'balance',
          }}
        >
          {receiptSentence(r)}
        </p>
        <div>
          <dl
            className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-4"
            style={{ fontSize: 'max(12px, calc(100cqw * 16 / 1200))' }}
          >
            {receiptStats(r).map((s) => (
              <div key={s.label}>
                <dt className="text-fg-muted">{s.label}</dt>
                <dd
                  className={`mt-1 font-semibold tnum ${s.label === 'Changed figures' ? 'text-drift' : 'text-fg'}`}
                  style={{ fontSize: '2.2em', lineHeight: 1 }}
                >
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-center gap-2 text-caption text-fg-muted">
            <Glyph size={14} />
            Old News, week {r.week}. Counted on this computer.
          </p>
        </div>
      </div>
    </figure>
  );
}

function Ready({ r }: { r: WeeklyReceipt }) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    try {
      const name = `old-news-receipt-${r.week}.png`;
      downloadBlob(await renderReceiptPng(r), name);
      toast(`Saved ${name}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[960px]">
      <Card r={r} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PrimaryButton busy={saving} onClick={() => void save()}>
          <Download size={14} strokeWidth={1.5} aria-hidden />
          Save image
        </PrimaryButton>
        <SecondaryButton
          onClick={() => {
            void navigator.clipboard.writeText(receiptSentence(r)).then(
              () => toast('Copied the sentence'),
              () => toast('Couldn’t copy. Select the sentence and copy it by hand.'),
            );
          }}
        >
          <Copy size={14} strokeWidth={1.5} aria-hidden />
          Copy text
        </SecondaryButton>
      </div>
      {saveError ? (
        <Notice tone="danger" icon={<CircleAlert size={14} strokeWidth={1.5} />} className="mt-3">
          Couldn’t create the image: {saveError}.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void save()}
          >
            Retry
          </button>
        </Notice>
      ) : null}
    </div>
  );
}

export function Receipt() {
  const { version, stats } = useApp();
  const res = useReceipt(version);
  const slow = useDelayed(res.state === 'loading');

  return (
    <>
      <PageHeader title="Receipt">
        How much of this week’s reading you had already read. Counted from your own reading on this
        computer.
      </PageHeader>
      {res.state === 'error' ? (
        <ErrorPanel error={res.error} retry={res.reload} />
      ) : res.state === 'loading' ? (
        slow ? (
          <Skeleton className="h-72 w-full !rounded-lg sm:aspect-[1200/630] sm:h-auto" />
        ) : null
      ) : res.data === null ? (
        <EmptyPanel title="No receipt yet.">
          Your first receipt arrives after a week of reading. So far: {stats?.articles ?? 0}{' '}
          {stats?.articles === 1 ? 'article' : 'articles'}.
        </EmptyPanel>
      ) : (
        <Ready r={res.data} />
      )}
    </>
  );
}
