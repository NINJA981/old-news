/** Settings: fade strength, dissolve, in-page keys, theme, and a read-only engine line. */
import { useEffect, useRef, useState } from 'react';
import { modelSizeLabel } from '../../core/model';
import { Segmented, Stat, Switch } from '../kit';
import { useApp } from './context';
import { PageHeader } from './parts';

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-[240px]">
        <p className="text-ui-strong text-fg">{title}</p>
        <p className="mt-0.5 max-w-[56ch] text-caption text-fg-muted">{hint}</p>
      </div>
      {children}
    </div>
  );
}

export function Settings() {
  const { settings, update, stats } = useApp();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const first = useRef(true);

  // "Saved" status after any change (inline, no toast).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSavedAt(Date.now());
  }, [settings.fadeStrength, settings.dissolve, settings.keys, settings.theme]);

  const backend = stats?.modelInfo?.backend;
  const clock = savedAt
    ? new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <>
      <PageHeader
        title="Settings"
        actions={
          <p className="text-caption text-fg-muted" role="status" aria-live="polite">
            {clock ? `Saved at ${clock}` : ''}
          </p>
        }
      >
        Changes apply to pages as you open them.
      </PageHeader>
      <section aria-label="Reading" className="rounded-md bg-surface p-4 shadow-e1">
        <Row
          title="Fade strength"
          hint="Standard fades old paragraphs to a 4.6:1 contrast floor. Light keeps them easier to read at 7:1."
        >
          <Segmented
            label="Fade strength"
            value={settings.fadeStrength}
            onChange={(v) => update({ fadeStrength: v })}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </Row>
        <div className="border-b border-border py-4">
          <Switch
            label="Dissolve animation"
            description="Old paragraphs settle top to bottom the first time you open a matched article."
            checked={settings.dissolve}
            onCheckedChange={(v) => update({ dissolve: v })}
          />
        </div>
        <div className="border-b border-border py-4">
          <Switch
            label="In-page keys N, J, K"
            description="N folds old paragraphs, J and K jump between new ones. Off while you type."
            checked={settings.keys}
            onCheckedChange={(v) => update({ keys: v })}
          />
        </div>
        <Row
          title="Theme"
          hint="Old News pages only. Fades on article pages follow the article’s own colours."
        >
          <Segmented
            label="Theme"
            value={settings.theme}
            onChange={(v) => update({ theme: v })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>
      </section>

      <section aria-label="Engine" className="mt-4 rounded-md bg-surface p-4 shadow-e1">
        <h2 className="text-label-h3 text-fg">Engine</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Runs on" value={backend ? backend.toUpperCase() : 'Not started yet'} />
          <Stat label="Model" value={`${modelSizeLabel()}, loaded on demand`} />
          <Stat label="Network" value="No requests" />
        </dl>
        <p className="mt-3 text-caption text-fg-muted">
          The model unloads after 5 minutes without use.
        </p>
      </section>
    </>
  );
}
