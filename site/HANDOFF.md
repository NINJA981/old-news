# HANDOFF: Old News site (landing page + web app)

**Stage:** 3b (rerun, 2026-10-28). **Scope:** everything lives in `site/`. The only file edited outside
it is `SPEC.md` (section 14, "Web app"). The root `HANDOFF.md` was not touched, because another agent
was editing the repo root at the same time; fold this file into it when the stages merge.

## State in one paragraph

`site/` is a separate package (own `package.json`, lockfile and tests) that builds to a static
`dist/`. It holds the launch landing page at `/` and the phone-friendly web app at `/app/`. The web app
imports the real engine from `src/core/index.ts` through the `@engine` Vite alias, and the dissolve
schedule and chip maths from the extension's `src/overlay/geometry.ts` through `@overlay`. It keeps
history in IndexedDB (`old-news-web`), works offline after the first load, and installs as a PWA. At
the end of this rerun `pnpm typecheck`, `pnpm test` (30 unit tests), `pnpm check-tokens`, `pnpm lint`,
`pnpm build` and `pnpm test:e2e` (67 tests: the legacy suite plus the `phone` and `desktop` projects)
all pass.

## Stage 3b rerun: what changed (the QA round 1 items that were open on the site)

1. **Drift chips never cover text** (QA item 1). Chips now sit in normal flow directly above their
   paragraph, so the row reserves their height at every width. They are 20 px tall like a tag (padding
   2 x 8). `src/shared/chips.ts` slides them (the `translate` property, so there is no layout shift) to
   start at the changed token's x when they fit on one line, using `clampX` from the extension's
   geometry. The old absolute chips with a fixed 32/58 px reserve are gone. Layout is read only in
   ResizeObserver callbacks, so the trace shows no forced reflow. On a coarse pointer, a changed row's
   chips get 8 px more top padding, so their 44 px hit layer does not overlap the tag above. The new
   e2e `tests/e2e/marks.spec.ts` checks every visible chip box against every line box of text.
2. **Stale numbers** (QA item 2). `pnpm fixtures` was re-run: the corpus is 4 stories (it said 3), and the
   samples now include the Harrow Ford bridge story. The new unit test `tests/unit/freshness.test.ts`
   fails when `src/generated/measured.json` differs from the repo's `metrics.json` or
   `scripts/size-baseline.json`.
3. **Dark `drift-mark`** (QA item 3): alpha 0.24 -> 0.32, plus a 2 px underline at 85% `drift` on dark
   (light keeps 1 px at 60%), as `--drift-line-w` and `--drift-line-mix`. The off-token
   `--drift-mark-strong` is removed and the pulse uses `--drift-mark`. `check-tokens` now reads both
   `drift-mark` rows from the DESIGN.md Colors tables, checks the underline rule, and rejects any colour
   custom property that DESIGN.md does not define.
4. **Hero "Add to Chrome"** (QA item 4): the button reads "Install in Chrome from source" (it goes to
   `#install`) until `VITE_STORE_URL` is set, and only then "Add to Chrome".
5. **Deterministic pill** (QA item 5). `src/shared/dissolve.ts` takes its schedule from the extension's
   `planDissolve`, `countTicks`, `countAt`, `pulseFrames` and `DISSOLVE`. Frame 0 reads "23 of 23" in
   full ink. Paragraphs that are not drawn tick inside the settle window, as below-the-fold ones do in
   the extension. The pill is locked to its opening width. `?capture` seeks every dissolver on the page
   together (before, the last one created took over `window.__frame`).
6. **The hero is now the LANDING.md "third tab"**: the Harrow Ford story read as Fenwick Wire, then
   Calder Courier, then Morrow Daily. That is 23 paragraphs with 19 faded, the pill counting 23 -> 4,
   and the chip "12 → 14 · Calder Courier said 12, 16 min ago". The sheet draws the top 6 rows
   (`HERO_ROWS`) and its note says so. The other 14 faded rows are counted through `data-offscreen`. The
   desktop stack is shorter, so the pill is on screen at 1440 x 900. The drift beat now shows the
   two-chip paragraph ("closed → reopened", "Monday → Tuesday"), which is what its copy describes. In
   the web app, **Try a sample story** opens the same bridge story ("Only 4 of 23"). Port Alder moved to
   a **Day-2 update sample** button.
7. **No flash on load.** The hero sheet carries `hero-pre`. Under `@media (scripting: enabled) and
(prefers-reduced-motion: no-preference)` it paints the opening frame. Without JS or with reduced
   motion, the HTML's final frame shows. Before this change the final frame painted and then flipped to
   full ink about 25 ms later (measured: first paint 448 ms, reset 473 ms).
8. **Real screenshots** from `docs/screenshots/`, which exists now: the onboarding "Remember open tabs"
   step and the toolbar popup, in the install band. `pnpm shots` (`scripts/make-shots.ts`) crops them and
   re-encodes them to `public/shots/*.webp` (29 KB and 21 KB). They are lazy-loaded, with width, height
   and full alt text.
9. A chip's accessible name is now its visible text plus a hidden "Changed:". Lighthouse had flagged
   `label-content-name-mismatch` on the old `aria-label`.
10. `scripts/size-report.ts` no longer lists the shared CSS chunk as lazy.

## How to run

```bash
cd site
pnpm install
pnpm dev            # runs `pnpm assets` first, then Vite on :5173 (no service worker in dev)
pnpm build          # assets, typecheck, vite build, service worker, size report -> dist/
pnpm preview        # serves dist/ on :4391 (the service worker only exists in a build)
pnpm test           # Vitest (landing, freshness, dissolve schedule, parsing, renderer, sample data)
pnpm test:e2e       # Playwright against `vite preview`; run `pnpm build` first
pnpm check-tokens   # DESIGN.md tokens vs src/styles/tokens.css, and no colour literal elsewhere
pnpm fixtures       # regenerates src/data + src/generated from the repo's metrics.json and the fixture stories
pnpm shots          # re-encodes the two product screenshots from ../docs/screenshots into public/shots
```

`pnpm assets` copies the Fontsource latin subsets, the MiniLM int8 model and the ONNX runtime wasm into
`public/` (all gitignored). The model comes from the repo root, so run `pnpm fetch-model` there once.
`public/shots/` is committed. Optional env for the build: `VITE_REPO_URL` (adds the Source, Licence and
clone links) and `VITE_STORE_URL` (turns the hero button into **Add to Chrome**, a store link). Without
them the page says the source link is added when the repository is published, and the button scrolls to
the install steps.

## What is where

| Path                                                                      | What                                                                                                                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`, `src/landing/page.ts`, `src/landing/main.ts`                | Landing. The body is rendered to real HTML at build time by `vite.config.ts` (a plugin), so the hero paints without JS. `main.ts` plus the shared chunk is 6.5 KB gz. |
| `src/styles/landing.css`, `product.css`, `base.css`, `tokens.css`         | Tokens (from DESIGN.md), the HTML/CSS reproduction of the overlay (`.on-*` classes), the landing layout.                                                              |
| `src/shared/dissolve.ts`, `chips.ts`, `reader.ts`, `render.ts`, `view.ts` | The signature moment (schedule from `@overlay/geometry`), chip anchoring, the hover card and N/J/K, the markup. Shared by the landing demos and the app.              |
| `app/index.html`, `src/app/*`                                             | Web app (React 19). `engine.ts` is the thin adapter (below). `shell.ts` is the static first paint.                                                                    |
| `sw-src/sw.js` + plugin in `vite.config.ts`                               | Service worker for `/app/` only: a precache list from the build manifest, same-origin GET only.                                                                       |
| `public/app/manifest.webmanifest`, `public/app-icons/`, `public/shots/`   | PWA manifest and icons; the two product screenshots.                                                                                                                  |
| `scripts/`                                                                | `copy-assets`, `build-fixtures`, `make-icons`, `make-shots`, `check-tokens`, `size-report`, `node-embedder`.                                                          |
| `tests/`                                                                  | Unit and Playwright e2e (acceptance criteria W1 to W18 in SPEC.md section 14).                                                                                        |

## Engine reuse (and the one adapter)

The engine has no `chrome.*` calls, so **no engine change was needed**. Aliases: `@engine` is
`src/core/index.ts`, `@adapters` is `src/adapters`, `@extract` is `src/extract`, and `@overlay` is
`src/overlay` (only the DOM-free `geometry.ts` is imported). The site re-implements no matching, fading,
drift, dissolve-timing or chip-placement logic. The thin adapter `src/app/engine.ts` chooses only the
things the engine leaves to the host:

- the IndexedDB name (`old-news-web`);
- the `Embedder`: precomputed MiniLM vectors for the bundled sample stories (same model as the
  extension, built by `pnpm fixtures`), the real model if the reader opts in (23 MB, downloaded once
  from this site's own `/models/`), or none (the engine then runs degraded: exact wording and changed
  facts still work, and the UI says so);
- a clock, so the bundled samples read "a few minutes apart" and the tags have times to show.

The settings store is the existing `WebSettingsStore` from `src/adapters/chromeSettings.ts`
(localStorage, with an in-memory fallback if storage is blocked).

## Measured (this laptop, headless Chromium via chrome-devtools MCP; not a CI runner)

Profile: 375 x 812, DPR 2, 4x CPU slowdown, Fast 4G, cold cache (for the app, the service worker was
unregistered and the caches cleared first), production build over `vite preview`. Rerun of 2026-10-28.

| Item                                                                                                            | Result                                                                                               | Budget                     | Verdict    |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------- | ---------- |
| Landing LCP                                                                                                     | 0.57 to 0.60 s over three traces; the element is the hero lead paragraph (`p.lead`)                  | <= 2.0 s (bible 11.3)      | met        |
| Landing CLS                                                                                                     | 0.00                                                                                                 | 0                          | met        |
| Landing forced reflow                                                                                           | 77 ms on the first trace (chip alignment); none after moving the reads into ResizeObserver callbacks |                            | fixed      |
| Web app LCP (cold)                                                                                              | 0.88 s                                                                                               | <= 2.0 s                   | met        |
| Web app CLS                                                                                                     | 0.00                                                                                                 | 0                          | met        |
| Landing initial JS                                                                                              | 6.5 KB gz                                                                                            | <= 120 KB gz               | met        |
| Web app first-route JS                                                                                          | 113.1 KB gz                                                                                          | <= 170 KB gz (site budget) | met        |
| 3D / WebGL chunk                                                                                                | none (0 KB); CSS 3D only, as DESIGN.md's CSS-only plan says                                          | <= 260 KB gz (R3F)         | not used   |
| Lighthouse: landing mobile and desktop, app mobile (empty and result state): Accessibility, Best Practices, SEO | 100 each                                                                                             |                            | met        |
| Lighthouse Agentic Browsing                                                                                     | 75 (67 in snapshot mode): only `ard-schema` (no `ai-catalog.json`)                                   | not a requirement          | left as is |

The bible asks for "the H1 or the poster" as the LCP element. Here it is the lead paragraph directly
under the H1, because it has more text area at 375 px. It is static HTML painted in the same first frame
as the H1 and the sheet stack's poster frame, so it waits on no script or image.

## Decisions worth knowing

- **No WebGL.** The bible allows 3D only within the 11.3 budget and requires GPU tiers and fallbacks. The
  hero uses CSS `perspective` and `translateZ` instead, so there is nothing to tier or fall back from.
  Motion tier 0 (reduced motion, Save-Data, 2 GB or less of device memory) skips autoplay and shows the
  final frame with a Play button.
- **Product visuals:** the overlay is a live HTML/CSS reproduction built from the engine's own output on
  the fixture stories ("Fenwick Wire", "Calder Courier", "Morrow Daily", towns "Port Alder" and "Harrow
  Ford", all invented and labelled "Fixture story"), because the signature moment has to play. The popup
  and the onboarding step are real screenshots from `docs/screenshots/`. The popup capture shows
  `127.0.0.1` (the test server), and its caption says so.
- **No testimonials, stars or invented stats.** Every number on the page comes from
  `src/generated/measured.json` (a copy of the repo's `metrics.json` and the size baseline) or from the engine.
- **Honest limits are on the page**: the changed-meaning recall (0.82) is below the 0.85 target and the
  test set is four invented stories, and the page says so.
- **Touch:** the provenance tags and drift chips are small beside the text. On a coarse pointer an
  invisible 44 px hit layer is added (`@media (pointer: coarse)` in `product.css`), so the layout does not move.
- **CSP** is set by `<meta>` at build: landing `default-src 'self'`; the app adds `'wasm-unsafe-eval'` for
  the optional model, and `connect-src 'self'`.

## Known issues and not done

1. **PWA install was not exercised in a real browser.** The manifest, icons and service worker exist,
   and the e2e offline and installability-criteria tests pass, but the chrome-devtools Lighthouse tool
   has no PWA category. Check the install prompt by hand in Chrome and on a phone.
2. **The package size on the page is the recorded baseline** (`scripts/size-baseline.json`: 24.6 MB
   zipped, 56.2 MB unpacked, 2026-10-27). Stage 4 reported a 56.67 MB build, but the baseline was not
   re-recorded at the root, which is outside this stage's folder. After `pnpm size --record` at the
   root, run `pnpm fixtures` here; the freshness test fails until then.
3. **`pnpm fixtures` changed `src/data/embeddings.json` and `samples.json`** (the bridge story was added).
   The root `tests/e2e/parity.spec.ts` compares the web app with the extension. It was not run in this
   stage because another agent owns the root. Run it there.
4. **Lighthouse "Agentic Browsing" is 75** (`ard-schema`, an experimental audit). Left alone on purpose.
5. **Performance numbers are from one laptop under emulation.** Re-measure on the deployed host.
6. **The web app's optional real-model path** (23 MB, `enableModel()` in `src/app/engine.ts`) has no
   test and was not run in a browser in this stage.
7. **No store URL or repository URL yet.** Set `VITE_STORE_URL` and `VITE_REPO_URL` at build time.
8. **The landing video loops from LANDING.md are not built.** The same moments are live DOM demos.
9. **The popup screenshot is 1x** (380 x 560, as `pnpm screenshots` writes it), so it looks soft on 2x
   and 3x screens. A 2x capture at the root would fix it; rerun `pnpm shots` afterwards.
10. The chips sit above their paragraph at the token's x. They are not lifted into the line gap, as
    the extension's "above" mode does it. The reproduction reserves the space instead, which is what
    guarantees there is no overlap.
11. `vite build` warns that `src/extract/readability.ts` is imported both statically and dynamically
    (no chunk split; harmless). The inlined landing stylesheet is still emitted as an unused file.
12. The root `HANDOFF.md` has no section for this rerun (see the top of this file).
