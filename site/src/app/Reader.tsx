import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Settings } from '@engine';
import { createDissolver, type Dissolver } from '../shared/dissolve.ts';
import { attachReader, type Reader as ReaderApi } from '../shared/reader.ts';
import { pillHtml, rowsHtml, tierBarHtml } from '../shared/render.ts';
import { plain } from '../shared/text.ts';
import { addFeedback, type SessionArticle } from './engine.ts';
import { applyFloors } from './floors.ts';
import { Icon, Notice } from './ui.tsx';

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ArticleReader({
  article,
  settings,
  onShown,
  onEnableModel,
}: {
  article: SessionArticle;
  settings: Settings;
  onShown: (id: string) => void;
  onEnableModel: () => void;
}) {
  const { view } = article;
  const rootRef = useRef<HTMLDivElement>(null);
  const dissolver = useRef<Dissolver | null>(null);
  const readerApi = useRef<ReaderApi | null>(null);
  const [folded, setFolded] = useState(false);
  const matched = view.summary.seen + view.summary.similar + view.summary.changed > 0;

  const html = useMemo(
    () =>
      `<div class="reader-rows">${rowsHtml(view, { gutter: true })}</div>` +
      (view.pill ? `<div class="reader-pill">${pillHtml(view)}</div>` : ''),
    [view],
  );

  // Solve the contrast floors before paint, and again when the strength setting changes.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    applyFloors(root, settings.fadeStrength);
  }, [html, settings.fadeStrength]);

  // The dissolve, once, the first time a matched article is shown (bible P7: rationed).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = reducedMotion();
    const d = createDissolver(root, { reduced });
    dissolver.current = d;
    if (article.fresh && matched && settings.dissolve) {
      d.reset();
      const t = window.setTimeout(() => d.play(), 120);
      onShown(article.id);
      return () => {
        window.clearTimeout(t);
        d.finish();
      };
    }
    if (article.fresh) onShown(article.id);
    return undefined;
    // The sequence is tied to this article; setting changes must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id]);

  // Hover card, N fold, J/K.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reader = attachReader({
      root,
      keyScope: 'document',
      keys: settings.keys,
      onNotOld: (row) => {
        const fp = row.dataset['fp'];
        const old = row.dataset['old'];
        if (fp && old) void addFeedback(fp, old);
      },
      onFoldChange: setFolded,
    });
    readerApi.current = reader;
    return () => {
      reader.destroy();
      readerApi.current = null;
    };
  }, [html, settings.keys]);

  const s = view.summary;
  const replay = (): void => {
    const root = rootRef.current;
    if (!root) return;
    applyFloors(root, settings.fadeStrength);
    dissolver.current?.play();
  };

  return (
    <section aria-labelledby={`h-${article.id}`}>
      <header className="art-head">
        <p className="caption">{article.sample ? 'Fixture story' : 'Pasted article'}</p>
        <h1 id={`h-${article.id}`}>{view.title}</h1>
        <dl className="kv">
          <dt>Source</dt>
          <dd>{view.siteName}</dd>
          <dt>Paragraphs</dt>
          <dd>{s.total}</dd>
        </dl>
      </header>

      <div className="card status-card">
        {matched ? (
          <>
            <div className="status-count">
              <span className="count tnum">
                {view.lit} of {s.total}
              </span>
              <span className="status-sub">paragraphs are new to you</span>
            </div>
            <div className="tier" dangerouslySetInnerHTML={{ __html: tierBarHtml(s) }} />
          </>
        ) : (
          <>
            <p className="status-sub">Nothing to compare yet.</p>
            <p className="hint">
              Add another article about the same story and the paragraphs you have already read will
              fade.
            </p>
          </>
        )}
      </div>

      {view.degraded ? (
        <Notice
          tone="info"
          actions={
            <button type="button" className="btn btn-secondary" onClick={onEnableModel}>
              Turn on meaning match
            </button>
          }
        >
          Similar-wording matching is off for this article. Exact matches and changed facts still
          work. Turning it on downloads a 23 MB model once, then works offline.
        </Notice>
      ) : null}

      <div className="reader-tools" role="toolbar" aria-label="Reading tools">
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={folded}
          onClick={() => readerApi.current?.toggleFold()}
        >
          {folded ? 'Unfold old' : 'Fold old'}
          <span className="keycap hover-only">N</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => readerApi.current?.jump(-1)}
        >
          Previous new <span className="keycap hover-only">K</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => readerApi.current?.jump(1)}
        >
          Next new <span className="keycap hover-only">J</span>
        </button>
        {matched && settings.dissolve ? (
          <button type="button" className="btn btn-ghost" onClick={replay}>
            Replay
          </button>
        ) : null}
      </div>

      <div
        ref={rootRef}
        className="on-sheet on-read is-body on-gutter reader"
        tabIndex={-1}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {view.card ? (
        <div className="card prev-card">
          <p className="card-h">{plain(view.card.summary)}</p>
          <ul className="prev-list">
            {view.card.articles.map((a) => (
              <li key={a.url}>
                <span className="outlet">{a.siteName}</span>
                <span className="read-title-sm">{a.title}</span>
                <span className="when">{plain(a.when)}</span>
              </li>
            ))}
          </ul>
          {view.card.figures.length > 0 ? (
            <dl className="changes">
              {view.card.figures.map((f, i) => (
                <div key={i}>
                  <dt>{f.context}</dt>
                  <dd>
                    {plain(f.before)} → {plain(f.after)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
      <p className="hint sheet-foot">
        <Icon name="info" /> Faded text stays at a contrast floor of{' '}
        {settings.fadeStrength === 'light' ? '7:1 and 10:1' : '4.6:1 and 7:1'} against the sheet.
        Nothing is hidden unless you fold it.
      </p>
    </section>
  );
}
