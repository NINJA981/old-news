/**
 * Onboarding (SPEC F13; DESIGN.md Surface 4). Single column, max 560, three real steps:
 * 1 grant site access, 2 remember the article tabs already open, 3 done. Reads only the
 * already-loaded DOM of the tabs the reader checks, and never fetches anything.
 */
import { Check, CircleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { request } from '../../src/adapters/messaging';
import { modelSizeLabel } from '../../src/core/model';
import { mount } from '../../src/ui/boot';
import { GhostButton, PrimaryButton, SecondaryButton } from '../../src/ui/components/Button';
import { useDelayed, useSettings } from '../../src/ui/hooks';
import { Glyph, Keycap, Notice, Skeleton, Stat, cn } from '../../src/ui/kit';
import { SampleSheet } from '../../src/ui/SampleSheet';

const HOSTS = ['https://*/*', 'http://*/*'];

type Step = 1 | 2 | 3;
const FROM_HASH: Record<string, Step> = { '#/allow': 1, '#/tabs': 2, '#/done': 3 };
const TO_HASH: Record<Step, string> = { 1: '#/allow', 2: '#/tabs', 3: '#/done' };

interface Candidate {
  tabId: number;
  title: string;
  siteName: string;
  url: string;
  paragraphs: number;
}

type RowState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'done'; remembered: number }
  | { kind: 'skipped' }
  | { kind: 'error'; reason: string };

function Steps({ step, go }: { step: Step; go: (s: Step) => void }) {
  const labels = ['Allow access', 'Remember open tabs', 'Done'];
  return (
    <nav aria-label="Setup steps" className="mb-8">
      <ol className="flex items-center gap-4">
        {([1, 2, 3] as const).map((n) => (
          <li key={n}>
            <button
              type="button"
              onClick={() => n < step && go(n)}
              aria-current={n === step ? 'step' : undefined}
              aria-label={`Step ${n} of 3: ${labels[n - 1]}`}
              disabled={n > step}
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-ui-strong tnum transition-colors duration-100',
                n === step ? 'bg-surface-3 text-fg' : n < step ? 'text-fg-muted' : 'text-fg-subtle',
              )}
            >
              {n}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ---- Step 1 --------------------------------------------------------------------------------------

function AllowStep({ next }: { next: () => void }) {
  const [access, setAccess] = useState<'unknown' | 'idle' | 'granted' | 'denied'>('unknown');
  useEffect(() => {
    void browser.permissions
      .contains({ origins: HOSTS })
      .then((has) => setAccess(has ? 'granted' : 'idle'));
  }, []);

  async function allow(): Promise<void> {
    const ok = await browser.permissions.request({ origins: HOSTS });
    setAccess(ok ? 'granted' : 'denied');
  }

  return (
    <section aria-labelledby="h-allow">
      <h1 id="h-allow" className="font-read text-h1 text-fg">
        Let Old News read article pages.
      </h1>
      <p className="mt-4 max-w-[56ch] text-lead text-fg-muted">
        Old News needs to see article text to recognise it later. It stores short fingerprints and
        140-character snippets on this computer, never full pages, and sends nothing anywhere.
      </p>
      <div className="mt-6">
        <SampleSheet />
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {access === 'granted' ? (
          <>
            <Notice tone="success" icon={<Check size={14} strokeWidth={1.5} />}>
              Allowed. Old News will work on article pages.
            </Notice>
            <PrimaryButton onClick={next}>Continue</PrimaryButton>
          </>
        ) : access === 'denied' ? null : (
          <PrimaryButton onClick={() => void allow()} disabled={access === 'unknown'}>
            Allow on article pages
          </PrimaryButton>
        )}
      </div>
      {access === 'denied' ? (
        <div className="mt-4">
          <Notice tone="info" icon={<CircleAlert size={14} strokeWidth={1.5} />}>
            Without access, Old News can’t read pages as you open them.
          </Notice>
          <div className="mt-3 flex gap-2">
            <PrimaryButton onClick={() => void allow()}>Try again</PrimaryButton>
            <GhostButton onClick={next}>Continue without</GhostButton>
          </div>
        </div>
      ) : null}
      <p className="mt-4 text-caption text-fg-muted">
        The matching model is bundled ({modelSizeLabel()}), so it never downloads anything. Old News
        acts on English article pages only, and never in private windows.
      </p>
    </section>
  );
}

// ---- Step 2 --------------------------------------------------------------------------------------

function TabsStep({ next }: { next: () => void }) {
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const slow = useDelayed(found === null && error === null);

  useEffect(() => {
    let live = true;
    request<Candidate[]>({ type: 'ingest/candidates' }).then(
      (list) => {
        if (!live) return;
        setFound(list);
        setChecked(new Set(list.map((c) => c.tabId)));
      },
      (err: unknown) => live && setError(err instanceof Error ? err.message : 'Failed'),
    );
    return () => {
      live = false;
    };
  }, []);

  async function remember(): Promise<void> {
    if (!found) return;
    setRunning(true);
    for (const c of found.filter((x) => checked.has(x.tabId))) {
      setRows((r) => ({ ...r, [c.tabId]: { kind: 'reading' } }));
      try {
        const res = await request<{ remembered: number }[]>({
          type: 'ingest/tabs',
          tabIds: [c.tabId],
        });
        const n = res[0]?.remembered ?? 0;
        setRows((r) => ({
          ...r,
          [c.tabId]: n > 0 ? { kind: 'done', remembered: n } : { kind: 'skipped' },
        }));
      } catch (err) {
        setRows((r) => ({
          ...r,
          [c.tabId]: { kind: 'error', reason: err instanceof Error ? err.message : 'Failed' },
        }));
      }
    }
    setRunning(false);
    setFinished(true);
  }

  const count = checked.size;
  return (
    <section aria-labelledby="h-tabs">
      <h1 id="h-tabs" className="font-read text-h1 text-fg">
        Remember the articles you have open?
      </h1>
      <p className="mt-4 max-w-[56ch] text-lead text-fg-muted">
        Old News will treat these as read, so the next article on the same story is already faded
        the first time you open it. It reads only the pages as they are loaded in these tabs.
      </p>

      <div className="mt-6" aria-live="polite">
        {error ? (
          <Notice tone="danger" icon={<CircleAlert size={14} strokeWidth={1.5} />}>
            Couldn’t look at your tabs: {error}.
          </Notice>
        ) : found === null ? (
          slow ? (
            <div aria-busy="true" className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : null
        ) : found.length === 0 ? (
          <p className="rounded-md bg-surface p-4 text-body text-fg-muted shadow-e1">
            No article tabs are open right now. That’s fine. Old News starts learning from the next
            one you read.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-md bg-surface shadow-e1">
            {found.map((c) => {
              const st = rows[c.tabId] ?? { kind: 'idle' };
              return (
                <li key={c.tabId} className="border-b border-border last:border-0">
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked.has(c.tabId)}
                      disabled={running || finished}
                      onChange={(e) =>
                        setChecked((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(c.tabId);
                          else n.delete(c.tabId);
                          return n;
                        })
                      }
                      className="mt-1 size-4 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-caption font-semibold text-fg-muted">
                        {c.siteName}
                      </span>
                      <span className="block truncate font-read text-read-title text-fg">
                        {c.title}
                      </span>
                      {st.kind !== 'idle' ? (
                        <span
                          className={cn(
                            'mt-1 block text-caption',
                            st.kind === 'error' ? 'text-danger' : 'text-fg-muted',
                          )}
                        >
                          {st.kind === 'reading' && 'Reading…'}
                          {st.kind === 'done' && `Remembered ${st.remembered} paragraphs`}
                          {st.kind === 'skipped' && 'Couldn’t line up this page, skipped'}
                          {st.kind === 'error' && st.reason}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {finished ? (
          <PrimaryButton onClick={next}>Continue</PrimaryButton>
        ) : (
          <>
            {found && found.length > 0 ? (
              <PrimaryButton busy={running} disabled={count === 0} onClick={() => void remember()}>
                Remember {count === 1 ? 'this tab' : `these ${count} tabs`}
              </PrimaryButton>
            ) : null}
            <SecondaryButton onClick={next} disabled={running}>
              {found && found.length === 0 ? 'Continue' : 'Skip'}
            </SecondaryButton>
          </>
        )}
      </div>
    </section>
  );
}

// ---- Step 3 --------------------------------------------------------------------------------------

function DoneStep() {
  return (
    <section aria-labelledby="h-done">
      <h1 id="h-done" className="font-read text-h1 text-fg">
        You’re set. Read as usual.
      </h1>
      <p className="mt-4 max-w-[56ch] text-lead text-fg-muted">
        Open a second article on a story you have read. Old paragraphs fade, each names where you
        read it, and a changed figure stays lit.
      </p>
      <ul className="mt-6 space-y-3 rounded-md bg-surface p-4 shadow-e1">
        {[
          ['N', 'Fold the old paragraphs to hairlines, and unfold them.'],
          ['J', 'Jump to the next new or changed paragraph.'],
          ['K', 'Jump to the previous one.'],
        ].map(([key, text]) => (
          <li key={key} className="flex items-center gap-3 text-body text-fg">
            <Keycap>{key}</Keycap>
            {text}
          </li>
        ))}
      </ul>
      <dl className="mt-6 grid grid-cols-3 gap-4 rounded-md bg-surface p-4 shadow-e1">
        <Stat label="Requests sent" value="0" />
        <Stat label="Kept for" value="30 days" />
        <Stat label="Stored" value="On this computer" />
      </dl>
      <div className="mt-6 flex items-center gap-3">
        <SecondaryButton
          onClick={() =>
            void browser.tabs.create({ url: browser.runtime.getURL('/app.html') + '#/playground' })
          }
        >
          Open the playground
        </SecondaryButton>
        <span className="text-caption text-fg-muted">You can close this tab.</span>
      </div>
    </section>
  );
}

function Onboarding() {
  const { update } = useSettings();
  const [step, setStep] = useState<Step>(() => FROM_HASH[window.location.hash] ?? 1);
  const go = (s: Step): void => {
    window.location.hash = TO_HASH[s];
    setStep(s);
  };
  useEffect(() => {
    if (step === 3) update({ onboardingDone: true, ingestOffered: true });
  }, [step, update]);
  useEffect(() => {
    const on = (): void => setStep(FROM_HASH[window.location.hash] ?? 1);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-[560px] flex-col px-4 py-10 text-fg sm:py-14">
      <header className="mb-8 flex items-center gap-2">
        <Glyph size={20} />
        <span className="font-read text-read-title">Old News</span>
      </header>
      <Steps step={step} go={go} />
      {step === 1 ? <AllowStep next={() => go(2)} /> : null}
      {step === 2 ? <TabsStep next={() => go(3)} /> : null}
      {step === 3 ? <DoneStep /> : null}
    </main>
  );
}

mount(<Onboarding />);
