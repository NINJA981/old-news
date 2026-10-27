import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Settings } from '@engine';
import { Composer } from './Composer.tsx';
import { ArticleReader } from './Reader.tsx';
import { SettingsView, StoriesView } from './Views.tsx';
import {
  addArticle,
  enableModel,
  loadSampleStories,
  readSampleStory,
  settingsStore,
  type SessionArticle,
} from './engine.ts';
import { useInstallPrompt } from './install.ts';
import {
  explainTooShort,
  parseFile,
  parsePasted,
  ParseError,
  type ParsedArticle,
} from './parse.ts';
import { Icon, Notice, ReaderSkeleton, type IconName } from './ui.tsx';
import { GLYPH } from '../shared/render.ts';

type Route = 'read' | 'stories' | 'settings';
const ROUTES: { id: Route; label: string; icon: IconName }[] = [
  { id: 'read', label: 'Read', icon: 'read' },
  { id: 'stories', label: 'Stories', icon: 'stories' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h === 'stories' || h === 'settings' ? h : 'read';
}

interface ReadState {
  session: SessionArticle[];
  activeId: string | null;
  busy: { label: string; slow: boolean } | null;
  error: { message: string; details: string; retry?: () => void } | null;
  /** Bumps when memory changes, so the other views reload. */
  version: number;
}

type Action =
  | { t: 'busy'; label: string }
  | { t: 'slow' }
  | { t: 'added'; article: SessionArticle }
  | { t: 'select'; id: string }
  | { t: 'shown'; id: string }
  | { t: 'error'; message: string; details: string; retry?: () => void }
  | { t: 'dismiss-error' }
  | { t: 'reset' }
  | { t: 'done' };

function reduce(s: ReadState, a: Action): ReadState {
  switch (a.t) {
    case 'busy':
      return { ...s, busy: { label: a.label, slow: false }, error: null };
    case 'slow':
      return s.busy ? { ...s, busy: { ...s.busy, slow: true } } : s;
    case 'added':
      return {
        ...s,
        session: [...s.session, a.article],
        activeId: a.article.id,
        version: s.version + 1,
        error: null,
      };
    case 'select':
      return { ...s, activeId: a.id };
    case 'shown':
      return {
        ...s,
        session: s.session.map((x) => (x.id === a.id && x.fresh ? { ...x, fresh: false } : x)),
      };
    case 'error':
      return {
        ...s,
        busy: null,
        error: { message: a.message, details: a.details, retry: a.retry },
      };
    case 'dismiss-error':
      return { ...s, error: null };
    case 'reset':
      return { ...s, session: [], activeId: null, version: s.version + 1 };
    case 'done':
      return { ...s, busy: null };
  }
}

function applyTheme(theme: Settings['theme']): void {
  const el = document.documentElement;
  if (theme === 'system') {
    el.removeAttribute('data-theme');
    el.setAttribute('data-follow-system', '');
  } else {
    el.removeAttribute('data-follow-system');
    el.setAttribute('data-theme', theme);
  }
}

function useSettings(): [Settings | null, (p: Partial<Settings>) => void] {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    let live = true;
    void settingsStore.get().then((v) => live && setS(v));
    const off = settingsStore.subscribe((v) => live && setS(v));
    return () => {
      live = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (s) applyTheme(s.theme);
  }, [s?.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  return [s, (p) => void settingsStore.set(p)];
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function App() {
  const [settings, patchSettings] = useSettings();
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [state, dispatch] = useReducer(reduce, {
    session: [],
    activeId: null,
    busy: null,
    error: null,
    version: 0,
  } as ReadState);
  const [online, setOnline] = useState(navigator.onLine);
  const [dragging, setDragging] = useState(false);
  const [composerOpen, setComposerOpen] = useState(true);
  const install = useInstallPrompt();
  const mainRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onHash = (): void => setRoute(routeFromHash());
    const up = (): void => setOnline(true);
    const down = (): void => setOnline(false);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const go = (r: Route): void => {
    window.location.hash = `#/${r}`;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  };

  // --- reading ---------------------------------------------------------------

  const withBusy = useCallback(
    async (label: string, work: () => Promise<void>, retry: () => void) => {
      dispatch({ t: 'busy', label });
      const slow = window.setTimeout(() => dispatch({ t: 'slow' }), 150);
      try {
        await work();
      } catch (e) {
        dispatch({
          t: 'error',
          message: errMsg(e),
          details: e instanceof Error ? (e.stack ?? e.message) : String(e),
          retry,
        });
        return;
      } finally {
        window.clearTimeout(slow);
      }
      dispatch({ t: 'done' });
    },
    [],
  );

  const readParsed = useCallback(
    async (parsed: ParsedArticle, fallbackSource: string): Promise<boolean> => {
      const why = explainTooShort(parsed);
      if (why) {
        dispatch({ t: 'error', message: why, details: why });
        return false;
      }
      const n = state.session.filter((s) => !s.sample).length + 1;
      const article = await addArticle({
        title: parsed.title,
        siteName: parsed.siteName || fallbackSource || `Pasted article ${n}`,
        paragraphs: parsed.paragraphs,
      });
      dispatch({ t: 'added', article });
      return true;
    },
    [state.session],
  );

  const onSubmitText = (text: string, source: string): void => {
    if (text.trim().length === 0) {
      dispatch({
        t: 'error',
        message: 'There is nothing to read yet. Paste an article, or try a sample story.',
        details: 'empty input',
      });
      return;
    }
    const run = (): void =>
      void withBusy(
        'Checking paragraphs',
        async () => {
          const ok = await readParsed(parsePasted(text, source), source);
          if (ok) {
            setComposerOpen(false);
            go('read');
          }
        },
        run,
      );
    run();
  };

  const onFiles = useCallback(
    (files: File[]) => {
      const run = (): void =>
        void withBusy(
          files.length > 1 ? `Reading ${files.length} files` : 'Reading file',
          async () => {
            for (const f of files) {
              let parsed: ParsedArticle;
              try {
                parsed = await parseFile(f);
              } catch (e) {
                throw e instanceof ParseError
                  ? e
                  : new Error(`Couldn’t read ${f.name}: ${errMsg(e)}`);
              }
              await readParsed(parsed, f.name.replace(/\.[^.]+$/, ''));
            }
            setComposerOpen(false);
            go('read');
          },
          run,
        );
      run();
    },
    [withBusy, readParsed],
  );

  const onSample = useCallback(
    (storyId = 'harrow-bridge') => {
      const run = (): void =>
        void withBusy(
          'Reading the sample story',
          async () => {
            const stories = await loadSampleStories();
            const story = stories.find((s) => s.id === storyId) ?? stories[0];
            if (!story) throw new Error('The sample stories are missing from this build.');
            dispatch({ t: 'reset' });
            await readSampleStory(story, (article) => dispatch({ t: 'added', article }));
            setComposerOpen(false);
            go('read');
          },
          run,
        );
      run();
    },
    [withBusy],
  );

  // Dropping anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent): boolean =>
      [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (): void => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent): void => {
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length > 0) {
        e.preventDefault();
        onFiles(files);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [onFiles]);

  const share = async (): Promise<void> => {
    const url = `${location.origin}/app/`;
    try {
      if (navigator.share) await navigator.share({ title: 'Old News', url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* the reader dismissed the sheet */
    }
  };

  useEffect(() => {
    tabsRef.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [state.activeId]);

  if (!settings) {
    return (
      <div className="app-boot" aria-busy="true">
        <span className="sr-only">Loading Old News</span>
      </div>
    );
  }

  const active = state.session.find((s) => s.id === state.activeId) ?? null;
  const empty = state.session.length === 0;

  return (
    <div className="app">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="app-bar">
        <a className="brand" href="/app/">
          <span dangerouslySetInnerHTML={{ __html: GLYPH }} />
          <span className="brand-text">
            <span className="brand-name">Old News</span>
            <span className="brand-sub">Runs entirely in your browser. Nothing is uploaded.</span>
          </span>
        </a>
        <div className="bar-actions">
          <button
            type="button"
            className="icon-btn standalone-only"
            aria-label="Reload"
            title="Reload"
            onClick={() => location.reload()}
          >
            <Icon name="reload" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Share this app"
            title="Share"
            onClick={() => void share()}
          >
            <Icon name="share" />
          </button>
        </div>
      </header>

      <nav className="app-nav" aria-label="Sections">
        {ROUTES.map((r) => (
          <a
            key={r.id}
            href={`#/${r.id}`}
            className="nav-item"
            aria-current={route === r.id ? 'page' : undefined}
            title={r.label}
            onClick={(e) => {
              e.preventDefault();
              go(r.id);
            }}
          >
            <Icon name={r.icon} size={20} />
            <span>{r.label}</span>
          </a>
        ))}
      </nav>

      <main id="content" className="app-main" ref={mainRef} tabIndex={-1}>
        {!online ? (
          <div className="offline-banner" role="status">
            <Icon name="offline" /> You’re offline. Everything here still works.
          </div>
        ) : null}

        {route === 'read' ? (
          <div className="view">
            {state.error ? (
              <Notice
                tone="danger"
                actions={
                  <>
                    {state.error.retry ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={state.error.retry}
                      >
                        Retry
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => dispatch({ t: 'dismiss-error' })}
                      >
                        Dismiss
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        void navigator.clipboard?.writeText(state.error?.details ?? '')
                      }
                    >
                      Copy error details
                    </button>
                  </>
                }
              >
                Couldn’t read this: {state.error.message}
              </Notice>
            ) : null}

            {state.busy ? (
              <div aria-live="polite" aria-busy="true">
                <p className="busy-line" role="status">
                  {state.busy.label}…
                </p>
                {state.busy.slow ? <ReaderSkeleton /> : null}
              </div>
            ) : empty ? (
              <EmptyRead
                onSample={onSample}
                composer={<Composer busy={false} onSubmitText={onSubmitText} onFiles={onFiles} />}
              />
            ) : (
              <>
                <nav className="art-tabs" aria-label="Articles in this session" ref={tabsRef}>
                  {state.session.map((a, i) => (
                    <button
                      key={a.id}
                      type="button"
                      className="art-tab"
                      aria-current={a.id === state.activeId ? 'true' : undefined}
                      title={a.view.title}
                      onClick={() => dispatch({ t: 'select', id: a.id })}
                    >
                      <span className="tab-n tnum">{i + 1}</span>
                      <span className="tab-name">{a.view.siteName}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="art-tab art-add"
                    aria-expanded={composerOpen}
                    onClick={() => setComposerOpen((o) => !o)}
                  >
                    <Icon name="plus" /> Add article
                  </button>
                </nav>
                {composerOpen ? (
                  <Composer busy={false} onSubmitText={onSubmitText} onFiles={onFiles} />
                ) : null}
                {active ? (
                  <ArticleReader
                    key={active.id}
                    article={active}
                    settings={settings}
                    onShown={(id) => dispatch({ t: 'shown', id })}
                    onEnableModel={() => {
                      go('settings');
                      void enableModel().catch(() => undefined);
                    }}
                  />
                ) : null}
              </>
            )}
          </div>
        ) : route === 'stories' ? (
          <StoriesView
            version={state.version}
            onSample={() => {
              go('read');
              onSample();
            }}
          />
        ) : (
          <SettingsView
            settings={settings}
            onChange={patchSettings}
            version={state.version}
            onForgot={() => dispatch({ t: 'reset' })}
            install={install}
          />
        )}
      </main>

      {dragging ? (
        <div className="drop-veil" aria-hidden="true">
          <p>Drop to read</p>
        </div>
      ) : null}
    </div>
  );
}

function EmptyRead({
  onSample,
  composer,
}: {
  onSample: (id?: string) => void;
  composer: React.ReactNode;
}) {
  return (
    <>
      <div className="empty-hero">
        <h1 className="empty-h1">Paste two articles about the same story.</h1>
        <p className="lead">
          Old News fades the paragraphs you’ve already read, tells you where you read them, and
          lights up the one number that changed. It all happens in this tab.
        </p>
        <div className="empty-actions">
          <button type="button" className="btn btn-primary" onClick={() => onSample()}>
            Try a sample story
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onSample('port-alder-fire')}
          >
            Day-2 update sample
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onSample('kessel-valley-rail')}
          >
            Rail closure sample
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onSample('sleep-blogs')}>
            Sleep blogs sample
          </button>
        </div>
        <p className="hint">
          Samples are invented stories (outlets, people and places do not exist), read a few minutes
          apart so the tags have times to show.
        </p>
      </div>
      {composer}
    </>
  );
}
