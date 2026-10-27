import { useEffect, useState } from 'react';
import type { Settings } from '@engine';
import { formatCount, privacyMeterText, relativeTime } from '@engine';
import { plain } from '../shared/text.ts';
import {
  enableModel,
  forgetEverything,
  getModelState,
  loadStats,
  loadStories,
  onModelState,
  type ModelState,
  type StoryRow,
} from './engine.ts';
import { Icon, Notice, Seg, Switch } from './ui.tsx';
import type { InstallPrompt } from './install.ts';

// ---------------------------------------------------------------- Stories

type Loaded =
  | { s: 'loading' }
  | { s: 'error'; message: string }
  | { s: 'ok'; rows: StoryRow[]; loose: Awaited<ReturnType<typeof loadStories>>['loose'] };

export function StoriesView({ version, onSample }: { version: number; onSample: () => void }) {
  const [state, setState] = useState<Loaded>({ s: 'loading' });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ s: 'loading' });
    loadStories().then(
      (r) => live && setState({ s: 'ok', rows: r.rows, loose: r.loose }),
      (e: unknown) =>
        live && setState({ s: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [version, tries]);

  const now = Date.now();
  return (
    <div className="view">
      <h2 className="page-h">Stories</h2>
      {state.s === 'loading' ? (
        <div className="skeleton-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card sk-card">
              <i style={{ width: '70%' }} />
              <i style={{ width: '40%' }} />
            </div>
          ))}
        </div>
      ) : state.s === 'error' ? (
        <Notice
          tone="danger"
          actions={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTries((n) => n + 1)}
              >
                Retry
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void navigator.clipboard?.writeText(state.message)}
              >
                Copy error details
              </button>
            </>
          }
        >
          Couldn’t read your memory: {state.message}.
        </Notice>
      ) : state.rows.length === 0 && state.loose.length === 0 ? (
        <div className="empty">
          <p className="empty-h">No stories yet.</p>
          <p className="body">
            Stories appear when two articles you read share paragraphs. Add two articles about the
            same story, or start with a sample.
          </p>
          <button type="button" className="btn btn-primary" onClick={onSample}>
            Try a sample story
          </button>
        </div>
      ) : (
        <>
          <ul className="story-list">
            {state.rows.map(({ story, articles, drift }) => (
              <li key={story.id}>
                <details className="card story">
                  <summary>
                    <span className="story-title">{story.label}</span>
                    <span className="story-meta">
                      <span>
                        <b className="tnum">{articles.length}</b> articles
                      </span>
                      <span>
                        <b className="tnum">{new Set(articles.map((a) => a.siteName)).size}</b>{' '}
                        outlets
                      </span>
                      <span>Last read {relativeTime(story.updatedAt, now)}</span>
                      {drift.length > 0 ? (
                        <span className="drift-badge">
                          {drift.length} {drift.length === 1 ? 'figure' : 'figures'} changed
                        </span>
                      ) : null}
                    </span>
                    <Icon name="chevron" />
                  </summary>
                  <ul className="story-articles">
                    {articles.map((a) => (
                      <li key={a.id}>
                        <span className="outlet">{a.siteName}</span>
                        <span className="read-title-sm">{a.title}</span>
                        <span className="when">{plain(relativeTime(a.lastReadAt, now))}</span>
                      </li>
                    ))}
                  </ul>
                  {drift.length > 0 ? (
                    <dl className="changes">
                      {drift.map((d) => (
                        <div key={d.id}>
                          <dt>{d.context}</dt>
                          <dd>
                            {plain(d.before || 'not mentioned')} →{' '}
                            {plain(d.after || 'not mentioned')}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
          {state.loose.length > 0 ? (
            <>
              <h3 className="sec-h">Read once, not linked to a story</h3>
              <ul className="story-articles card">
                {state.loose.map((a) => (
                  <li key={a.id}>
                    <span className="outlet">{a.siteName}</span>
                    <span className="read-title-sm">{a.title}</span>
                    <span className="when">{plain(relativeTime(a.lastReadAt, now))}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Settings

export function SettingsView({
  settings,
  onChange,
  version,
  onForgot,
  install,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  version: number;
  onForgot: () => void;
  install: InstallPrompt;
}) {
  const [model, setModel] = useState<ModelState>(getModelState());
  useEffect(() => onModelState(setModel), []);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof loadStats>> | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [forgot, setForgot] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadStats().then(
      (s) => live && setStats(s),
      (e: unknown) => live && setStatsError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [version, forgot]);

  const patch = (p: Partial<Settings>): void => {
    onChange(p);
    setSaved(
      `Saved at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    );
  };

  const doForget = async (): Promise<void> => {
    const before = stats?.paragraphs ?? 0;
    await forgetEverything();
    setConfirm(false);
    setForgot(`Forgot ${formatCount(before)} ${before === 1 ? 'paragraph' : 'paragraphs'}.`);
    onForgot();
  };

  return (
    <div className="view">
      <h2 className="page-h">Settings</h2>

      <section className="card sect" aria-labelledby="s-look">
        <h3 id="s-look" className="card-h">
          Appearance
        </h3>
        <div className="row-between">
          <span className="row-label" id="theme-l">
            Theme
          </span>
          <Seg
            label="Theme"
            value={settings.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(theme) => patch({ theme })}
          />
        </div>
      </section>

      <section className="card sect" aria-labelledby="s-read">
        <h3 id="s-read" className="card-h">
          Reading
        </h3>
        <div className="row-between">
          <span className="row-label">Fade strength</span>
          <Seg
            label="Fade strength"
            value={settings.fadeStrength}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'light', label: 'Light' },
            ]}
            onChange={(fadeStrength) => patch({ fadeStrength })}
          />
        </div>
        <p className="hint">Standard fades to a 4.6:1 floor. Light fades less, to 7:1.</p>
        <Switch
          label="Dissolve animation"
          hint="Old paragraphs settle to pencil grey the first time an article is shown."
          checked={settings.dissolve}
          onChange={(dissolve) => patch({ dissolve })}
        />
        <Switch
          label="Keyboard shortcuts N, J, K"
          hint="Fold old paragraphs, jump to the next or previous new one."
          checked={settings.keys}
          onChange={(keys) => patch({ keys })}
        />
        {saved ? (
          <p className="hint" role="status">
            {saved}
          </p>
        ) : null}
      </section>

      <section className="card sect" aria-labelledby="s-model">
        <h3 id="s-model" className="card-h">
          Meaning match
        </h3>
        <p className="body">
          The sample stories carry precomputed vectors from the same MiniLM model the extension
          runs, so “similar wording” works on them with no download. For text you paste, turning
          this on downloads the 23 MB model once from this site and keeps it for offline use.
        </p>
        <dl className="kv">
          <dt>Status</dt>
          <dd>
            {model.status === 'ready'
              ? 'On'
              : model.status === 'loading'
                ? 'Loading'
                : model.status === 'error'
                  ? 'Failed'
                  : 'Off'}
          </dd>
        </dl>
        {model.status === 'loading' ? (
          <div className="progress-line" role="progressbar" aria-label="Loading the model" />
        ) : null}
        {model.status === 'error' ? (
          <Notice tone="danger">
            The model didn’t load: {model.reason}. Exact matches and changed facts still run.
          </Notice>
        ) : null}
        {model.status !== 'ready' ? (
          <button
            type="button"
            className="btn btn-secondary"
            aria-busy={model.status === 'loading' || undefined}
            onClick={() => void enableModel().catch(() => undefined)}
          >
            Turn on meaning match (23 MB)
          </button>
        ) : (
          <Notice tone="success">Meaning match is on for pasted text.</Notice>
        )}
      </section>

      <section className="card sect" aria-labelledby="s-mem">
        <h3 id="s-mem" className="card-h">
          Memory
        </h3>
        <p className="body">
          What the web app remembers lives in this browser’s IndexedDB, on this device only. Nothing
          is uploaded.
        </p>
        {statsError ? (
          <Notice tone="danger">Couldn’t read your memory: {statsError}.</Notice>
        ) : stats ? (
          <>
            <dl className="kv kv-wide">
              <dt>Paragraphs remembered</dt>
              <dd>{formatCount(stats.paragraphs)}</dd>
              <dt>Articles</dt>
              <dd>{formatCount(stats.articles)}</dd>
              <dt>Stories</dt>
              <dd>{formatCount(stats.stories)}</dd>
              <dt>Changed figures</dt>
              <dd>{formatCount(stats.drift)}</dd>
              <dt>Approximate size</dt>
              <dd>{(stats.approxBytes / 1024).toFixed(0)} KB</dd>
              <dt>Kept for</dt>
              <dd>30 days, then deleted</dd>
            </dl>
            <p className="hint">{privacyMeterText(stats, Date.now())}</p>
          </>
        ) : (
          <p className="hint">Reading memory…</p>
        )}
        {forgot ? <Notice tone="success">{forgot}</Notice> : null}
        {!confirm ? (
          <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>
            <Icon name="trash" /> Forget everything
          </button>
        ) : (
          <div className="confirm" role="group" aria-label="Confirm forgetting">
            <p className="body">
              Forget {formatCount(stats?.paragraphs ?? 0)} paragraphs,{' '}
              {formatCount(stats?.articles ?? 0)} articles and {formatCount(stats?.drift ?? 0)}{' '}
              changed figures? This can’t be undone.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn-secondary"
                autoFocus
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void doForget()}>
                Forget everything
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card sect" aria-labelledby="s-app">
        <h3 id="s-app" className="card-h">
          This app
        </h3>
        <p className="body">
          Runs entirely in your browser. Nothing is uploaded. After the first load it works offline,
          and it makes no network requests beyond its own static files.
        </p>
        {install.available ? (
          <button type="button" className="btn btn-secondary" onClick={() => void install.prompt()}>
            Install this app
          </button>
        ) : (
          <p className="hint">
            To install it, use your browser’s Install or Add to Home Screen option.
          </p>
        )}
        <p className="hint">
          Same engine as the extension, imported from the repository’s core module. The extension
          adds the in-page overlay and works across sites; this app works on text you paste.
        </p>
      </section>
    </div>
  );
}
