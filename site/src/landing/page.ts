/**
 * The landing page body, as a string, rendered at build time (vite.config.ts) so the hero is real
 * server HTML at its final frame: the H1 is the LCP element and JS only replays the animation.
 * Every number comes from generated/views.json (the real engine's output on the fixture stories)
 * or generated/measured.json (the repo's own metrics.json and package-size report).
 */
import { GLYPH, esc, hostOf, pillHtml, rowsHtml } from '../shared/render.ts';
import { plain } from '../shared/text.ts';
import type { ArticleView } from '../shared/view.ts';

type StoryViews = Record<string, ArticleView & { readAt: number }>;

export interface LandingContext {
  views: Record<string, StoryViews>;
  measured: {
    metrics: {
      corpus: { stories: number; changedMeaningPairs: number; labelledParagraphs: number };
      metrics: {
        seenPrecision: number;
        changedMeaningRecall: number;
        changedMeaningFullFades: number;
      };
      counts: { firesTotal: number; firesCaught: number };
      thresholds: { status: string };
    };
    size: { packedBytes: number; unpackedBytes: number; parts: Record<string, number> };
  };
  alpha: { seen: number; similar: number };
  /** Real product screenshots (scripts/make-shots.ts, from docs/screenshots). */
  shots?: Record<string, { src: string; width: number; height: number; alt: string }>;
  repoUrl: string;
  storeUrl: string;
}

const mb = (bytes: number): string => `${(bytes / 1_000_000).toFixed(1)} MB`;

const icon = (path: string): string =>
  `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${path}</svg>`;
const ICON_COPY = icon(
  '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/>',
);
const ICON_CHECK = icon('<path d="m3 8.5 3.2 3.2L13 4.8"/>');
const ICON_EXT = icon(
  '<path d="M9.5 2.5h4v4"/><path d="m13.5 2.5-6 6"/><path d="M12 9v3.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1H7"/>',
);

function copyBlock(id: string, label: string, text: string): string {
  return (
    `<div class="code" role="group" aria-label="${esc(label)}">` +
    `<code id="${id}">${esc(text)}</code>` +
    `<button type="button" class="btn btn-ghost code-copy" data-copy="${id}" aria-label="Copy ${esc(label)}">` +
    `<span class="copy-idle">${ICON_COPY}<span>Copy</span></span>` +
    `<span class="copy-done" aria-hidden="true">${ICON_CHECK}<span>Copied</span></span></button></div>`
  );
}

function sheetHead(view: ArticleView, caption = 'Fixture story'): string {
  return (
    `<div class="sheet-head"><span class="sheet-cap">${esc(caption)}</span>` +
    `<p class="sheet-title">${esc(view.title)}</p></div>`
  );
}

/** How many paragraphs of the hero article are drawn: the top of the tab, as a reader first sees it. */
export const HERO_ROWS = 6;

function shot(ctx: LandingContext, name: string, caption: string): string {
  const s = ctx.shots?.[name];
  if (!s) return '';
  return (
    `<figure class="shot"><img src="${esc(s.src)}" width="${s.width}" height="${s.height}" alt="${esc(s.alt)}" loading="lazy" decoding="async" />` +
    `<figcaption>${esc(caption)}</figcaption></figure>`
  );
}

export function landingBody(ctx: LandingContext): string {
  // Hero: the LANDING.md "third tab". The Harrow Ford story, read in order: Fenwick Wire, then
  // Calder Courier, then Morrow Daily (23 paragraphs, 19 already read, one figure changed).
  const hb = ctx.views['harrow-bridge'] as StoryViews;
  const heroWire = hb['wire'] as ArticleView;
  const heroCalder = hb['calder'] as ArticleView;
  const third = hb['morrow'] as ArticleView;
  const heroRows = third.paragraphs.slice(0, HERO_ROWS);
  const isFaded = (p: ArticleView['paragraphs'][number]): boolean =>
    !p.skipped && (p.tier === 'seen' || p.tier === 'similar');
  const offscreen = third.paragraphs.filter(isFaded).length - heroRows.filter(isFaded).length;

  // The other beats use the Port Alder story: its day-2 update has the "similar" tier, two changed
  // facts in one paragraph, and a three-article "Previously on" card.
  const pa = ctx.views['port-alder-fire'] as StoryViews;
  const wire = pa['wire'] as ArticleView;
  const calder = pa['calder'] as ArticleView;
  const day2 = pa['day2'] as ArticleView;
  const m = ctx.measured;
  const opts = { alpha: ctx.alpha, gutter: true };

  const link = (path: string, label: string): string =>
    ctx.repoUrl
      ? `<a href="${esc(`${ctx.repoUrl}${path}`)}" rel="noopener">${esc(label)}</a>`
      : `<span>${esc(label)}</span>`;

  const recall = m.metrics.metrics.changedMeaningRecall.toFixed(2);
  const fires = m.metrics.counts.firesTotal;
  const caught = m.metrics.counts.firesCaught;

  // Beat 3a: the day-2 paragraph with the most changed facts, beside the paragraph it was read as.
  const driftRow =
    [...day2.paragraphs].sort((a, b) => b.drift.length - a.drift.length)[0] ?? day2.paragraphs[0]!;
  const snippet = (driftRow.provenance?.snippet ?? '').replace(/…$/, '');
  const driftSource =
    wire.paragraphs.find((p) => snippet && p.text.startsWith(snippet)) ?? wire.paragraphs[0]!;
  const card = day2.card;

  return `
<a class="skip-link" href="#main">Skip to content</a>

<header class="topbar" data-theme="dark">
  <div class="wrap topbar-in">
    <a class="brand" href="/" aria-label="Old News, home">${GLYPH}<span>Old News</span></a>
    <nav class="topnav" aria-label="Sections">
      <a href="#how">How it works</a>
      <a href="#privacy">Privacy</a>
      <a href="#install">Install</a>
      ${ctx.repoUrl ? `<a href="${esc(ctx.repoUrl)}" rel="noopener">Source</a>` : ''}
    </nav>
    <a class="btn btn-secondary topbar-cta" href="/app/">Web app</a>
  </div>
</header>

<main id="main">
<section class="hero band" data-theme="dark" aria-labelledby="h1">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <h1 id="h1">You’ve read this before.</h1>
      <p class="lead">Old News remembers every paragraph you read, on your own computer. On the next article about the same story, it fades what you already know, tells you where you read it, and lights up the one number that changed.</p>
      <div class="cta-row">
        ${
          ctx.storeUrl
            ? `<a class="btn btn-primary hero-chrome" href="${esc(ctx.storeUrl)}">Add to Chrome</a>`
            : `<a class="btn btn-primary hero-chrome" href="#install">Install in Chrome from source</a>`
        }
        <a class="try-link" href="/app/">Try it in your browser, no install</a>
      </div>
      <dl class="kv hero-kv">
        <dt>Network requests</dt><dd>0</dd>
        <dt>Runs on</dt><dd>your computer</dd>
        <dt>Package</dt><dd>${mb(m.size.packedBytes)} zipped, ${mb(m.size.unpackedBytes)} unpacked</dd>
      </dl>
    </div>

    <div class="hero-stage">
      <div class="stack" id="stack">
        <div class="stack-3d">
          <article class="sheet sheet-back sheet-back-2 on-sheet" data-theme="light" aria-hidden="true" style="--i:2">
            <span class="sheet-tab">${esc(heroWire.siteName)}</span>
            ${sheetHead(heroWire)}
          </article>
          <article class="sheet sheet-back sheet-back-1 on-sheet" data-theme="light" aria-hidden="true" style="--i:1">
            <span class="sheet-tab">${esc(heroCalder.siteName)}</span>
            ${sheetHead(heroCalder)}
          </article>
          <article class="sheet sheet-front on-sheet hero-pre" data-theme="light" id="hero-sheet" style="--i:0" data-offscreen="${offscreen}" aria-label="The third article, as Old News shows it">
            <span class="sheet-tab">${esc(third.siteName)}</span>
            ${sheetHead(third)}
            <div class="on-read on-gutter sheet-body" id="hero-rows">${rowsHtml({ ...third, paragraphs: heroRows }, opts)}</div>
            <p class="sr-only">The first ${HERO_ROWS} of the article’s ${third.summary.total} paragraphs are shown.</p>
            <div class="sheet-pill">${pillHtml(third)}</div>
          </article>
        </div>
      </div>
      <div class="stage-actions">
        <button type="button" class="btn btn-ghost" id="replay" data-label-play="Play" data-label-replay="Replay">Replay</button>
        <p class="stage-note">Fixture story with invented outlets, read in tab order. The sheet shows the top ${HERO_ROWS} of its ${third.summary.total} paragraphs; the tags, the fade levels and the count are what the engine returned for it.</p>
      </div>
    </div>
  </div>
</section>

<section class="band" data-theme="light" id="fades" aria-labelledby="fades-h">
  <div class="wrap split">
    <div class="copy">
      <h2 id="fades-h">It fades. It never hides.</h2>
      <p class="body">Paragraphs you’ve read drop to a pencil grey that is still readable. That’s a contrast floor of 4.6:1, measured against the page’s own background. Hover any of them to see where you read it. Press N to fold them away, J and K to jump between what’s new.</p>
      <ul class="keys" aria-label="Keyboard shortcuts">
        <li><span class="keycap">N</span><span>Fold or unfold the old paragraphs</span></li>
        <li><span class="keycap">J</span><span class="keycap">K</span><span>Next and previous new paragraph</span></li>
      </ul>
      <div class="demo-actions">
        <button type="button" class="btn btn-secondary" id="demo-fold" aria-pressed="false">Fold old paragraphs</button>
        <button type="button" class="btn btn-secondary" id="demo-prev">Previous new</button>
        <button type="button" class="btn btn-secondary" id="demo-next">Next new</button>
      </div>
    </div>
    <div class="demo">
      <div class="on-sheet demo-sheet" id="demo" tabindex="0" role="group" aria-label="Interactive example. Press N to fold old paragraphs, J and K to move between new ones.">
        ${sheetHead(calder)}
        <div class="on-read on-gutter sheet-body" data-theme="light">${rowsHtml(calder, opts)}</div>
        <div class="sheet-pill">${pillHtml(calder)}</div>
      </div>
    </div>
  </div>
</section>

<section class="band" data-theme="dark" id="drift" aria-labelledby="drift-h">
  <div class="wrap split split-flip">
    <div class="copy">
      <h2 id="drift-h">The one number that changed.</h2>
      <p class="body">When a paragraph matches one you’ve read but a number, date, name or outcome is different (“Monday” became “Tuesday”, “closed” became “reopened”), Old News refuses to fade it and marks what changed. Everything it compares stays on your machine.</p>
      <dl class="kv proof" aria-label="Measured on the published test set">
        <dt>Changed-meaning pairs fully faded</dt><dd>${m.metrics.metrics.changedMeaningFullFades} of ${fires}</dd>
        <dt>Changed tokens flagged</dt><dd>${caught} of ${fires} (recall ${recall})</dd>
        <dt>Test set</dt><dd>${m.metrics.corpus.stories} invented stories, ${m.metrics.corpus.changedMeaningPairs} pairs</dd>
      </dl>
      <p class="fine">The recall is below the 0.85 target and the test set is small, so read it as a floor on a toy corpus, not as a claim about every site. ${ctx.repoUrl ? `The raw numbers are in ${link('/blob/main/metrics.json', 'metrics.json')}.` : 'The raw numbers are in metrics.json in the repository.'}</p>
    </div>
    <div class="drift-pair">
      <div class="on-sheet drift-sheet" data-theme="light" id="drift-demo">
        <div class="drift-before">
          <span class="sheet-cap">What you read yesterday, ${esc(wire.siteName)}</span>
          <p class="on-read is-body drift-old">${esc(plain(driftSource.text))}</p>
        </div>
        <div class="drift-after on-read is-body on-gutter" data-theme="light">
          <span class="sheet-cap">Today, ${esc(day2.siteName)}</span>
          ${rowsHtml({ ...day2, paragraphs: [driftRow] }, opts)}
        </div>
      </div>
      <button type="button" class="btn btn-ghost" id="drift-replay">Replay</button>
    </div>
  </div>
</section>

<section class="band" data-theme="light" id="previously" aria-labelledby="prev-h">
  <div class="wrap split">
    <div class="copy">
      <h2 id="prev-h">Come back tomorrow. Start where you left off.</h2>
      <p class="body">Return to a story and Old News lists what you’ve already read and which figures moved since.</p>
    </div>
    ${
      card
        ? `<div class="tray-wrap">
      <button type="button" class="tray-chip" id="tray-toggle" aria-expanded="true" aria-controls="tray">${esc(plain(card.summary))}</button>
      <div class="tray" id="tray">
        <div class="tray-in">
          <h3 class="tray-h">Articles you read</h3>
          <ul class="tray-list">
            ${card.articles
              .map(
                (a) =>
                  `<li><span class="t-outlet">${esc(a.siteName)}</span><span class="t-title">${esc(a.title)}</span><span class="t-when">${esc(plain(a.when))}</span></li>`,
              )
              .join('')}
          </ul>
          <h3 class="tray-h">What changed</h3>
          <dl class="tray-changes">
            ${card.figures
              .map(
                (f) =>
                  `<div><dt>${esc(f.context)}</dt><dd>${esc(plain(f.before))} → ${esc(plain(f.after))}</dd></div>`,
              )
              .join('')}
          </dl>
        </div>
      </div>
      <p class="fine">From the fixture stories, as the engine reports them after the third article.</p>
    </div>`
        : ''
    }
  </div>
</section>

<section class="band" data-theme="dark" id="how" aria-labelledby="how-h">
  <div class="wrap">
    <h2 id="how-h" class="wide-h">Remember paragraphs, not pages, and never send them anywhere.</h2>
    <figure class="diagram" aria-labelledby="diagram-cap">
      <div class="dg-box dg-in"><span class="dg-t">Article page</span><span class="dg-s">The text you read</span></div>
      <div class="dg-arrow" aria-hidden="true"></div>
      <div class="dg-box dg-in"><span class="dg-t">Paragraphs</span><span class="dg-s">Readability, mapped to the live DOM or nothing</span></div>
      <div class="dg-arrow" aria-hidden="true"></div>
      <div class="dg-engine">
        <div class="dg-box"><span class="dg-t">Fingerprints</span><span class="dg-s">MinHash on word shingles</span></div>
        <div class="dg-box"><span class="dg-t">Meaning</span><span class="dg-s">MiniLM, on-device</span></div>
        <div class="dg-box"><span class="dg-t">Fact guard</span><span class="dg-s">Numbers, dates, names, negations, outcomes</span></div>
      </div>
      <div class="dg-arrow" aria-hidden="true"></div>
      <div class="dg-box dg-store"><span class="dg-t">IndexedDB</span><span class="dg-s">On your computer, 30 days</span></div>
      <div class="dg-out">
        <svg viewBox="0 0 48 32" class="dg-cloud" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1"><path d="M13 25h22a7 7 0 0 0 .6-14A10 10 0 0 0 16.2 9.4 8 8 0 0 0 13 25Z"/><path d="M6 29 42 3" stroke-width="1.5"/></svg>
        <span>Nothing leaves this box</span>
      </div>
      <figcaption id="diagram-cap" class="sr-only">Article text is split into paragraphs, checked three ways on this computer, and stored in IndexedDB. Nothing is sent to a server.</figcaption>
    </figure>

    <div class="how-cols">
      <div>
        <h3>The naive version fails</h3>
        <p class="body">One similarity score fades “police said the suspect fled” when the new article says “was arrested”. To an embedding model those two sentences are near-identical.</p>
      </div>
      <div>
        <h3>The trick is three tiers and a guard</h3>
        <p class="body">Exact wire copy fades fully. Similar meaning fades less. A deterministic fact guard keeps anything with a changed number, name, negation or outcome in full ink. Thresholds are tuned on a published test set, and ambiguity resolves to lit.</p>
      </div>
      <div>
        <h3>It degrades in the open</h3>
        <p class="body">If the page’s paragraphs can’t be lined up exactly, Old News does nothing. If the model can’t load, exact matching still works and the popup says so. Reduced motion skips the animation.</p>
      </div>
    </div>

    <table class="tiers">
      <caption class="sr-only">The four tiers</caption>
      <thead><tr><th scope="col">Tier</th><th scope="col">What matched</th><th scope="col">Ink</th><th scope="col">Why</th></tr></thead>
      <tbody>
        <tr><th scope="row">New</th><td>Nothing you have read</td><td>Untouched</td><td>This is what you came for.</td></tr>
        <tr><th scope="row">Changed</th><td>Same paragraph, a load-bearing fact differs</td><td>Untouched, amber highlight on the token</td><td>Never faded when something differs.</td></tr>
        <tr><th scope="row">Similar</th><td>Same meaning, different wording</td><td>7:1 contrast floor</td><td>Lighter fade, labelled “Similar to”.</td></tr>
        <tr><th scope="row">Seen</th><td>Same wording as a paragraph you read</td><td>4.6:1 contrast floor</td><td>Wire copy and re-pasted background.</td></tr>
      </tbody>
    </table>
    <p class="fine">Stack: WXT, transformers.js with all-MiniLM-L6-v2 (int8, ${mb(m.size.parts['model (int8 MiniLM)'] ?? 0)}), IndexedDB. MIT licence. The model is bundled, which is why the package is ${mb(m.size.packedBytes)} zipped; it loads only when you open an article.</p>
  </div>
</section>

<section class="band" data-theme="light" id="privacy" aria-labelledby="priv-h">
  <div class="wrap split">
    <div class="copy">
      <h2 id="priv-h">Zero requests, and you can check.</h2>
      <p class="body">There is no server, no account, no analytics and no remote font or model. Extension pages carry a content security policy that only allows their own files, so even a bug couldn’t reach the network. The test suite records every request while Old News works and asserts that none leaves the machine.</p>
      <div class="ledger" aria-live="polite">
        <span class="ledger-k">Requests this page made to other origins</span>
        <span class="ledger-v tnum" id="ledger" data-fallback="Open DevTools, Network, to count them.">0</span>
        <span class="ledger-note" id="ledger-note">Counted live from this page’s resource timing.</span>
      </div>
    </div>
    <div>
      <table class="store">
        <caption class="sr-only">What is stored, where, and for how long</caption>
        <thead><tr><th scope="col">What</th><th scope="col">Where</th><th scope="col">How long</th></tr></thead>
        <tbody>
          <tr><th scope="row">Paragraph fingerprints, 140-character snippets, article titles and links</th><td>This browser (IndexedDB)</td><td>30 days, then deleted</td></tr>
          <tr><th scope="row">Full article text</th><td>Never stored</td><td>—</td></tr>
          <tr><th scope="row">Incognito windows</th><td>Never processed</td><td>—</td></tr>
          <tr><th scope="row">Network requests</th><td>0, enforced by the extension’s content security policy and tested</td><td>—</td></tr>
        </tbody>
      </table>
      <p class="fine">Forget everything is one click and deletes the whole database. The web app on this site follows the same rule: <a href="/app/">it runs entirely in your browser and nothing is uploaded</a>.</p>
    </div>
  </div>
</section>

<section class="band" data-theme="dark" id="install" aria-labelledby="install-h">
  <div class="wrap split">
    <div class="copy">
      <h2 id="install-h">Read the news once.</h2>
      ${
        ctx.storeUrl
          ? `<p><a class="btn btn-primary" href="${esc(ctx.storeUrl)}">Add to Chrome</a></p>`
          : `<p class="body">Old News is not on the Chrome Web Store yet. Build it from source; it takes a few minutes and the only download is the model, once.</p>`
      }
      <ol class="steps">
        <li><span class="step-h">Build it.</span>${copyBlock('cmd-build', 'build commands', `git clone ${ctx.repoUrl || '<repo-url>'} && cd old-news && pnpm install && pnpm fetch-model && pnpm build`)}</li>
        <li><span class="step-h">Load it.</span><span class="body">Open <code class="inline">chrome://extensions</code>, turn on Developer mode, choose Load unpacked and pick <code class="inline">.output/chrome-mv3</code>.</span></li>
        <li><span class="step-h">Allow it.</span><span class="body">On the page that opens, choose Allow on websites. Old News reads nothing until you do.</span></li>
      </ol>
      <p class="body"><a class="btn btn-secondary" href="/app/">Try it in your browser, no install</a></p>
    </div>
    <div>
      <table class="store platforms">
        <caption class="sr-only">Supported platforms</caption>
        <thead><tr><th scope="col">Platform</th><th scope="col">Status</th></tr></thead>
        <tbody>
          <tr><th scope="row">Chrome</th><td>Supported</td></tr>
          <tr><th scope="row">Firefox</th><td>Second build, not yet run end to end</td></tr>
          <tr><th scope="row">Edge and Brave</th><td>Should work, untested</td></tr>
          <tr><th scope="row">Mobile browsers</th><td>Not supported. Mobile Chrome has no extensions, so the web app is the way to try it on a phone.</td></tr>
          <tr><th scope="row">Languages</th><td>English pages only, for now</td></tr>
        </tbody>
      </table>
      <p class="fine">Works on articles and long-form blog posts. Some sites lay out text in ways Old News can’t line up, and there it stays out of the way.</p>
    </div>
  </div>
  ${
    ctx.shots
      ? `<div class="wrap shots" aria-label="Screenshots of the extension">
    ${shot(ctx, 'onboarding-tabs-dark', 'Useful from the first minute: on install it offers to remember the article tabs you already have open. It reads only the tabs you tick and fetches nothing.')}
    ${shot(ctx, 'popup-dark', 'The toolbar popup on the third article of the bridge story. Captured from the built extension on the fixture stories, served from a local test server (hence 127.0.0.1).')}
  </div>`
      : ''
  }
</section>

<section class="band band-end" data-theme="dark" id="source" aria-labelledby="src-h">
  <div class="wrap oss">
    <div>
      <h2 id="src-h">Built in the open.</h2>
      <p class="body">Read the engine, run the tests, check the numbers. The matching logic, the fact guard and the fixtures are plain TypeScript under the MIT licence, and this site imports the same engine the extension runs.</p>
    </div>
    <div class="oss-actions">
      ${ctx.repoUrl ? `<a class="btn btn-secondary" href="${esc(ctx.repoUrl)}" rel="noopener">View the source ${ICON_EXT}</a>` : `<span class="fine">The source link is added when the repository is published.</span>`}
      <a class="btn btn-secondary" href="/app/">Open the web app</a>
    </div>
  </div>
</section>
</main>

<footer class="footer" data-theme="dark">
  <div class="wrap footer-in">
    <p>Old News. MIT licence. Built in the open.</p>
    <p class="fine">Credits: all-MiniLM-L6-v2 (Apache-2.0), Newsreader and Hanken Grotesk (OFL-1.1), Readability (Apache-2.0). Fixture stories are original and CC0; every outlet and town in them is invented.</p>
    <p class="fine"><a href="#privacy">Privacy</a>${ctx.repoUrl ? ` <span aria-hidden="true"> </span><a href="${esc(`${ctx.repoUrl}/blob/main/LICENSE`)}" rel="noopener">Licence</a>` : ''}</p>
  </div>
</footer>
`;
}

export { hostOf };
