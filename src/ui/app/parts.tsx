/** Small building blocks shared by app screens: page header, error panel, empty panel. */
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { GhostButton, PrimaryButton } from '../components/Button';
import { toast } from '../toast';

export function PageHeader({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-read text-h2 text-fg">{title}</h1>
        {children ? <p className="mt-1 max-w-[56ch] text-body text-fg-muted">{children}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Panel error boundary content: what failed, with Retry and Copy error details. */
export function ErrorPanel({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div role="alert" className="rounded-md bg-danger-soft p-4">
      <p className="flex items-start gap-2 text-ui text-danger">
        <CircleAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
        Couldn’t read your memory: {error}.
      </p>
      <div className="mt-3 flex gap-2">
        <PrimaryButton onClick={retry}>Retry</PrimaryButton>
        <GhostButton
          onClick={() => {
            void navigator.clipboard.writeText(`Old News memory error: ${error}`);
            toast('Copied the error details');
          }}
        >
          Copy error details
        </GhostButton>
      </div>
    </div>
  );
}

export function EmptyPanel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-md bg-surface p-6 shadow-e1">
      <h2 className="font-read text-read-title text-fg">{title}</h2>
      <p className="mt-2 max-w-[56ch] text-body text-fg-muted">{children}</p>
      {action ? <div className="mt-4 flex flex-wrap items-center gap-3">{action}</div> : null}
    </section>
  );
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Today", "Yesterday", else "27 October". */
export function dayLabel(ms: number, now: number): string {
  const d = new Date(ms);
  const n = new Date(now);
  const start = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(n) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function openOnboardingTabs(): void {
  window.location.href = '/onboarding.html#/tabs';
}
