# HANDOFF: Old News

**Last stage:** Stage 3a, Product UI (2026-10-27)
**Next stage:** Stage 3b is the landing/web app in `site/` (another agent; untouched here), then QA, store assets and release

## State in one paragraph

Every user-facing surface exists and runs on the real engine: the in-page overlay (fade painting,
provenance tags, hover card, drift highlight and chip, status pill, "Previously on" tray, N fold,
J/K, "Not old news"), the toolbar popup (all states), the app page (Stories, Drift, Receipt, Memory,
Settings, Playground, command palette), onboarding with the open-tab ingest, and the playground
that reproduces the dissolve. `pnpm lint`, `pnpm typecheck`, `pnpm test` (575 tests), `pnpm build`,
`pnpm build:firefox`, `pnpm check-tokens` and `pnpm test:e2e` (17 tests, real model, includes an axe
pass with 0 WCAG A/AA violations) all pass. Screenshots are in `docs/screenshots/`.

## Stage 3a summary

- **Overlay** (`src/overlay/*`, vanilla TS, closed Shadow DOM, e2e build opens it): inline-opacity
  fades solved to the contrast floor (`src/paint/contrastFloor.ts`), tags with right/left/dot/hover
  placement, 320 px hover card (Open original, Not old news), `::highlight(on-drift)` plus the chip,
  capsule pill with analysing/result/all-old/error/degraded states, tray with Hide for this story and
  Undo, N fold with 24 px reveal buttons, J/K marker, Esc. The dissolve is one WAAPI `Timeline`
  (`src/overlay/timeline.ts`); input finishes it; reduced motion collapses it to one 150 ms fade and
  the overlay CSS drops transitions and shimmer. `window.__frame(i, fps)` drives deterministic capture
  (`app.html?capture#/playground`).
- **Live blogs and infinite scroll**: host `analyse` has an `append` mode; the content script observes
  mutations, appends posts to the same section, and treats a URL-swapped appended article as its own
  section. The pill and badge follow the section in view.
- **Popup, app, onboarding**: React 19, Tailwind v4 on the DESIGN.md tokens, Radix Switch/Tabs/Tooltip,
  cmdk, Sonner, motion (LazyMotion, `reducedMotion="user"`). Every state in DESIGN.md Surface 2 has a
  branch and a screenshot. The app refetches memory when it regains focus.
- **Playground story**: `tests/fixtures/corpus/stories/harrow-bridge.json` (new, CC0, invented) has a
  23-paragraph last tab: 19 seen, 1 changed figure (`12 -> 14`), 3 new, so the pill counts 23 -> 4 as
  in the demo script. It also grew the eval corpus to 4 stories / 118 labelled paragraphs.
- **Card shows changed figures at once**: `EngineHost.addPageDrift` lists the page's own changed
  figures on the Previously-on card and in the popup before anything is read (transient, not stored).

### Bugs found and fixed this stage (all by the e2e suite or the screenshots)

1. Dwell tracking stored nothing: `trackDwell` built the tracker before registering paragraphs.
2. Appended live-blog posts were not painted when prepended (new items taken as the tail of a sorted list).
3. `text-ui-strong` was used 16 times but never defined in the Tailwind theme, so values rendered tiny.
4. Hover card was covered by neighbouring tags and the tray by tags (z-order).
5. Stories rows put a `<dl>` inside a `<button>` (axe `dlitem`).
6. Memory screen could claim "Memory is empty." from a stale cache while memory had data.
7. The screenshot script remembered the day-2 page it then screenshotted, so it matched itself.

### Rubric (DESIGN_BIBLE section 9), self-scored by the builder, not an independent critic

| # | Criterion | Score | Evidence and what holds it back |
|---|---|---|---|
| 1 | Identity | 9 | Dissolve, amber chip, Newsreader/Hanken lanes, verdigris only on action. |
| 2 | Typography | 9 | Tokens, `tnum`, balanced headings. Newsreader numerals in tags are not measured. |
| 3 | Colour and contrast | 9.5 | axe colour-contrast clean on all surfaces in both themes; faded text lands at 4.6 and 7.0. |
| 4 | Layout and spacing | 8.5 | The chip sits 6 px above the token and can touch the previous paragraph's last line. |
| 5 | Hierarchy and content | 9 | Real fixture data and counts. The popup's This story tab lists articles before "What changed". |
| 6 | Component craft | 9 | One radius grammar, one icon set, keycaps. |
| 7 | States and accessibility | 9 | Focus rings, keyboard path for every action, axe 0 violations. Not tested with a screen reader. |
| 8 | Motion | 9 | Timings from DESIGN.md, input finishes the dissolve, reduced motion handled. No video capture was reviewed. |
| 9 | System states | 9 | Skeleton with delay, empty/error/degraded states, Undo on pause. |
| 10 | Responsive | 9 | 375/768/1440 in both themes, no horizontal scroll in the shots. |

Average about 9.0, minimum 8.5, no hard fails observed. This is the builder's own judgement.

## How to run

```bash
pnpm install
pnpm fetch-model     # once: downloads the model (pinned revision + SHA-256) into public/models
pnpm dev             # Chrome with hot reload (runs `pnpm assets` first)
pnpm build           # .output/chrome-mv3      pnpm build:firefox -> .output/firefox-mv3
pnpm test            # Vitest: unit + fixture tests (jsdom for the DOM ones)
pnpm test:e2e        # builds .output-e2e, then drives Chromium with the real model (17 tests incl. axe)
pnpm screenshots     # OLD_NEWS_SHOTS=1: rewrites docs/screenshots (3 widths x 2 themes, states, dissolve strip)
pnpm lint && pnpm typecheck
pnpm eval            # corpus metrics with the real model -> metrics.json (gates: see below)
pnpm check-tokens    # DESIGN.md tokens vs src/ui/tokens.css, contrast pairs, no off-token colours
pnpm size            # zips and reports package size; `--record` / `--check` for the baseline
```

Load `.output/chrome-mv3` as an unpacked extension. The content script is registered at runtime, so
**the reader must click "Allow on websites" on the onboarding page** (it opens on install) before
any page is read. The e2e build skips that by adding one required host permission for 127.0.0.1.

## What is done

| Area | Where | Notes |
|---|---|---|
| Engine (pure) | `src/engine/*` | normalise, shingles, MinHash (128 perms), LSH, int8 quantise, facts (7 kinds), guard, tier table, story linking, receipt, `present.ts` (all product copy: tags, chip, pill, badge, privacy meter, receipt sentence) |
| Page pipeline | `src/extract/*` | article signals, English gate, Readability on a clone, strict DOM mapping (3 rules of SPEC 5.2), live-blog blocks and tracker, dwell state machine |
| Painting maths | `src/paint/contrastFloor.ts` | colour parsing, WCAG contrast, the opacity solver (4.6 / 7.0, light 7.0 / 10.0), theme pick. The DOM painting is in `src/overlay/`. |
| Storage | `src/store/*` | IndexedDB schema v1 via `idb`, repo, 30-day TTL sweep, wipe |
| Host | `src/host/*`, `src/core/engine.ts` | `EngineHost` (analyse, markRead, ingest, feedback, stats, wipe, sweep), message router, `createEngine()` |
| Protocol | `src/messaging/*` | valibot schemas, content-vs-extension sender allow-list, redacting logger |
| Settings | `src/core/settings.ts`, `src/adapters/chromeSettings.ts` | schema, repair, pause rules, chrome.storage and localStorage stores |
| Model | `src/embed/*` | lazy + idle-unload wrapper, backend chooser, transformers.js adapter (local files only, length-sorted batches) |
| Network guard | `src/net/localAsset.ts`, ESLint | the only `fetch`; refuses non-extension URLs |
| Extension shell | `entrypoints/*` | background router (badge, alarms, offscreen lifecycle, content-script registration, ingest, fonts), content script (gate, detect, map, analyse, dwell, report), offscreen engine host, Firefox background host, popup, app, onboarding |
| Overlay | `src/overlay/*` | fades, tags, hover card, chip + highlight, pill, tray, fold, J/K, dissolve timeline; `window.__frame` capture hook |
| Product UI | `src/ui/*`, `entrypoints/{popup,app,onboarding}` | kit (switch, tabs, segmented, keycap, tier bar), Stories, Drift, Receipt (PNG save), Memory, Settings, Playground, palette |
| Design tokens | `src/ui/tokens.css` | DESIGN.md light + dark, Tailwind v4 `@theme inline`, Fontsource latin subsets, `scripts/check-tokens.ts` gate |
| Tooling | `scripts/*`, `playwright.config.ts`, `LICENSE`, `THIRD_PARTY.md`, `README.md` | |
| ADR | `docs/adr/0002-drop-webgpu-proposal.md` | a proposal only, see below |

### Web app reuse

Import everything from **`src/core/index.ts`**. It has no `chrome.*` or `browser.*` (a test scans
`src/engine,extract,paint,host,store,embed,core,messaging,net` for them). The environment-specific
parts are injected: an `Embedder` (use `createTransformersEmbedder` with your own model URL and
`assertLocalUrl(..., { sameOrigin })`, or `FakeEmbedder` for precomputed demos), a `SettingsStore`
(`WebSettingsStore`), and IndexedDB (`createEngine({ embedder })`). `analyseDocument(doc, url)` takes
any DOM `Document` (jsdom and linkedom work). Browser-API code lives only in `src/adapters/*`
and `entrypoints/*`.

## Measured results (this laptop: Ryzen 9 8940HX, 32 threads; headless Chromium; not a CI runner)

| Item | Result | Budget | Verdict |
|---|---|---|---|
| Unpacked package (Chrome) | 56.2 MB | ~40-50 MB estimated | over the estimate |
| Packed zip | 24.6 MB | | recorded in `scripts/size-baseline.json` |
| Model (int8) | 22,972,370 bytes, SHA-256 `afdb6f1a...bdb1` | | pinned in `scripts/model-manifest.json` |
| Warm `page/analyse`, 30 paragraphs, p50 | 127 ms and 185 ms in the two multi-threaded runs recorded (592 ms single-threaded) | <= 300 ms | met here |
| Cold first request | 2.1 s and 3.9 s in the two multi-threaded runs recorded (4.3 to 4.9 s single-threaded) | <= 2.5 s | **missed in one of two runs**; it includes creating the offscreen document and the one-time WebGPU-vs-WASM benchmark. A later cold load (after idle unload) reuses the remembered backend and was **not measured**. |
| WebGPU vs WASM (32 texts) | WebGPU 2.1 to 4.7x **slower** (3 runs) | WebGPU must gain >= 20% | **ADR-0002 proposal written** (headless only, no real-GPU run) |
| Content script (with overlay) | 36.8 KB gz | ADR: 45 KB with overlay | met; the 15 KB bootstrap sub-budget cannot hold with Readability inline |
| Popup JS (entry chunk) | 4.4 KB gz, shared React chunk separate | 120 KB | met |
| Corpus: seen precision | 1.00 | >= 0.98 | met (4 stories) |
| Corpus: changed-meaning pairs fully faded | 0 of 141 | 0 | met |
| Corpus: changed-meaning recall | 0.82 (115 of 141) | target >= 0.85 | below target, shipped as measured |
| Corpus: wire recall / paraphrase recall | 0.98 (50/51) / 0.50 (1/2) | | paraphrase N is 2, not meaningful |

Raw numbers: `metrics.json` (`pnpm eval`) and `test-results/engine-perf.json` (e2e, gitignored).

## Decisions that differ from ADR-0001 (all deliberate, all reversible)

1. **One WebGPU-capable ORT build, not three.** Only `jspi` (16.8 MB) ships next to the base WASM
   build (14.3 MB). WebGPU is attempted only where `WebAssembly.Suspending` exists (Chrome 137+),
   otherwise WASM. Shipping `asyncify` too would add 26.9 MB.
2. **transformers.js runs in the offscreen document, not a nested Worker.** ORT's own threads do the
   heavy work, and a nested Worker added bundling risk with no measured gain.
3. **Multi-threaded WASM** via `cross_origin_embedder_policy` / `cross_origin_opener_policy` in the
   Chrome manifest (up to 4 threads). This took the 30-paragraph warm time from about 590 ms to
   about 130-190 ms. Firefox stays single-threaded.
4. **A Vite plugin (`wxt.config.ts`) blanks onnxruntime-web's default wasm URL.** Without it the
   bundler embeds a 26.9 MB asyncify build that is never loaded (and, in the Firefox background
   bundle, a 72 MB script).
5. **The manifest has no required host permissions** (WXT adds them from the runtime-registered
   content script; a build hook removes them). Access comes from the onboarding prompt.
6. **`pnpm size` replaces `size-limit`**; the e2e suite uses a built-in Node server instead of
   `sirv-cli`; `@axe-core/playwright` is not installed yet (UI stage).
7. **Pull quotes are matched punctuation-insensitively** (found by the `medium-like.html` fixture: a
   quote ending in "." failed to match its paragraph continuing with ",").
8. **Bug found by e2e and fixed:** two concurrent first requests both called
   `chrome.offscreen.createDocument`; creation is now shared.

## Known issues and open items (most important first)

1. **The chip can touch the previous paragraph.** It is anchored 6 px above the changed token as the
   spec says; with 20 px paragraph gaps its 24 px height overlaps the last line above (screenshots
   `overlay-*-1440.png`). Not fixed to keep to DESIGN.md; a spec decision is needed.
2. **Self-scored rubric.** The 9.0 average in this file is the builder's own. No independent critic ran,
   no screen reader was used, and the dissolve was reviewed as 15 still frames, not as video.
3. **shadcn registry search was not possible**: the `mcp__shadcn__*` tools were not available in this
   session, so no primitive came from @motion-primitives, @animate-ui or @magicui. The UI uses Radix
   (Switch, Tabs, Tooltip), cmdk and Sonner, restyled to the tokens in `src/ui/kit.tsx`, plus `motion`.
4. **Corpus is still small.** 4 stories / 118 labelled paragraphs / 166 pairs / 0 Wikinews negatives,
   against a plan of 12 / ~150 / 30. `thresholds.ts` holds untuned starting values. Changed-meaning
   recall is 0.82, below the 0.85 target; misses stay lit but get no chip. The paraphrase tier has 2
   labelled paragraphs.
5. **Package is 56.7 MB unpacked (24.7 MB zipped)**, over the 40-50 MB estimate (ORT 31.1 MB + model
   23.0 MB). `docs/adr/0002-drop-webgpu-proposal.md` is a proposal only.
6. **Cold first request** took 2.1 s and 3.9 s in two earlier runs against a 2.5 s budget; not
   re-measured this stage. WebGPU was slower than WASM in headless Chromium only; no real-GPU run.
7. **Firefox is built, not run.** `pnpm build:firefox` succeeds (57.3 MB); the engine in the background
   page and the overlay were never executed there. The build warns about `import.meta` in IIFE output.
8. **Not covered by an e2e:** AC5.1 (the 5-minute unload is fake-timer unit tested), AC1.2 (a French
   page; `french-article.html` exists and is covered by the page-gate unit tests), keyboard-only
   operation of the onboarding permission prompt (`permissions.request` needs a real user gesture).
9. **Drift only becomes stored once a changed paragraph is dwelled on.** Until then it is listed on the
   card and the popup (transient), but not in the app's Drift screen.
10. **Ad copy inside a paragraph element** can trigger drift chips about ad numbers when the ad slot's
    class is not on Readability's unlikely list (`tests/fixtures/PROVENANCE.md`).
11. **No CI config yet.** The gates exist as commands: `pnpm test`, `lint`, `typecheck`, `build`,
    `eval` (fails on seen precision < 0.98 or any changed-meaning full fade), `size --check`,
    `check-tokens`, `test:e2e`.
12. **`activeTab` is unused** until a click-to-run path exists. `docs/smoke-sites.md` (real-site smoke
    list) still does not exist.
13. **A shell trap for the next agent:** inside a double-quoted `node -e "..."` in this environment,
    backslashes are eaten. Write scripts to files. Prettier and editors can turn a literal NBSP into
    an "irregular whitespace" lint error; use ` ` in regexes.
