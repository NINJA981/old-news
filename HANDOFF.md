# HANDOFF: Old News

**Last stage:** Stage 2, Scaffold + core (2026-10-27)
**Next stage:** Stage 3, UI (overlay, popup, app, onboarding, playground) and the landing/web app in `site/`

## State in one paragraph

The domain engine, storage, page pipeline, messaging, extension shell and tooling are built and
tested. `pnpm lint`, `pnpm typecheck`, `pnpm test` (524 tests) and `pnpm build` all pass, and the
5-test Playwright suite passes against the real model (run three times in a row, 5/5 each). **The
in-page UI does not exist yet**: nothing is faded, tagged or highlighted on a page. A page that Old
News understands gets a toolbar badge and a popup sentence, and its read paragraphs are remembered.

## How to run

```bash
pnpm install
pnpm fetch-model     # once: downloads the model (pinned revision + SHA-256) into public/models
pnpm dev             # Chrome with hot reload (runs `pnpm assets` first)
pnpm build           # .output/chrome-mv3      pnpm build:firefox -> .output/firefox-mv3
pnpm test            # Vitest: unit + fixture tests (jsdom for the DOM ones)
pnpm test:e2e        # builds .output-e2e, then drives Chromium with the real model
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
| Painting maths | `src/paint/contrastFloor.ts` | colour parsing, WCAG contrast, the opacity solver (4.6 / 7.0, light 7.0 / 10.0), theme pick. **The DOM painting itself is not written.** |
| Storage | `src/store/*` | IndexedDB schema v1 via `idb`, repo, 30-day TTL sweep, wipe |
| Host | `src/host/*`, `src/core/engine.ts` | `EngineHost` (analyse, markRead, ingest, feedback, stats, wipe, sweep), message router, `createEngine()` |
| Protocol | `src/messaging/*` | valibot schemas, content-vs-extension sender allow-list, redacting logger |
| Settings | `src/core/settings.ts`, `src/adapters/chromeSettings.ts` | schema, repair, pause rules, chrome.storage and localStorage stores |
| Model | `src/embed/*` | lazy + idle-unload wrapper, backend chooser, transformers.js adapter (local files only, length-sorted batches) |
| Network guard | `src/net/localAsset.ts`, ESLint | the only `fetch`; refuses non-extension URLs |
| Extension shell | `entrypoints/*` | background router (badge, alarms, offscreen lifecycle, content-script registration, ingest, fonts), content script (gate, detect, map, analyse, dwell, report), offscreen engine host, Firefox background host, placeholder popup/app/onboarding |
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
| Content script | 21.2 KB gz | ADR: 15 KB bootstrap, 45 KB with overlay | see known issue 3 |
| Popup JS | 72.4 KB gz | 120 KB | met |
| Corpus: seen precision | 1.00 | >= 0.98 | met (3 stories only) |
| Corpus: changed-meaning pairs fully faded | 0 of 141 | 0 | met |
| Corpus: changed-meaning recall | 0.82 (115 of 141) | target >= 0.85 | below target, shipped as measured |
| Corpus: wire recall / paraphrase recall | 0.95 (18/19) / 0.50 (1/2) | | paraphrase N is 2, not meaningful |

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

1. **No in-page UI.** Fade painting (`src/paint` DOM side, using `solveFade`), provenance tags, hover
   card, drift chip and highlight, pill, fold, J/K, the "Previously on" card, and "Not old news" are
   Stage 3. The data they need is already returned by `page/analyse` (`ParagraphResult`) and the
   copy is in `src/engine/present.ts`. The popup, app and onboarding pages are functional placeholders.
2. **The content script analyses once.** A live-blog append or an infinite-scroll swap is not handled:
   `LiveBlogTracker` exists and is tested, but nothing observes mutations, and `EngineHost.analyse`
   replaces the article's session, so calling it again for appended posts would lose the earlier
   paragraphs' `markRead` data. Stage 3 needs an "append" mode in the host first (AC3.1, AC3.2).
3. **Content script budget.** Readability alone is about 14 KB gz minified, so the ADR's 15 KB
   bootstrap sub-budget cannot hold; `scripts/size-report.ts` gates the ADR's 45 KB total for the
   whole bundle instead. The overlay must fit in the remaining 24 KB.
4. **Corpus is small and thresholds are untuned.** 3 stories / 55 labelled paragraphs / 166 pairs /
   0 negatives, against a plan of 12 / ~150 / 30 Wikinews negatives. `thresholds.ts` still holds the
   architect's starting values (`J_seen 0.60`, `J_near 0.35`, `C_dup 0.93`, `C_sim 0.82`). Tuning on
   55 paragraphs would overfit, so it was not done. Changed-meaning recall (0.82) is below the 0.85
   target; the misses stay lit but get no chip. Authoring more stories and the negatives is the way
   to tune.
5. **Package is 56.2 MB unpacked, over the 40-50 MB estimate** (ORT 31.1 MB + model 23.0 MB). The
   README states it. Accepting ADR-0002 would bring it to about 39 MB.
6. **Firefox is built, not run.** `pnpm build:firefox` succeeds (MV3, 56.2 MB, `data_collection_permissions: none`),
   but the engine there runs in the background page and was never executed. The build warns
   `import.meta may not be valid with the iife output format`; it needs a manual smoke test.
   `WebAssembly` threads are off there.
7. **Install-time ingest is untested end to end.** `ingest/candidates` and `ingest/tabs` in the
   background, and the `ingest/probe` / `ingest/run` handlers in the content script, are written
   but the onboarding screen has no tab list yet and no e2e covers them (AC13.1).
8. **`font/get` is implemented but untested** (the overlay stage uses it). Encoded size is about
   125 KB for both faces; confirm that is acceptable over messaging (earlier open question).
9. **Ad copy inside a paragraph element.** When an ad slot's class is not on Readability's
   unlikely-candidate list, the ad text becomes part of the paragraph and can trigger drift chips
   about ad numbers. See `tests/fixtures/PROVENANCE.md`.
10. **The `activeTab` permission is unused** until a click-to-run path exists. The onboarding copy no
    longer promises one.
11. **No CI config yet.** The gates exist as commands: `pnpm test`, `pnpm lint`, `pnpm typecheck`,
    `pnpm build`, `pnpm eval` (fails on seen precision < 0.98 or any changed-meaning full fade),
    `pnpm size --check` (5% over baseline), `pnpm check-tokens`.
12. **Not measured:** AC5.1 as an e2e (the 5-minute unload is covered by fake-timer unit tests only),
    AC17.2/17.3 e2e, axe checks, screenshots at 375/768/1440, the real-site smoke list
    (`docs/smoke-sites.md` does not exist).
13. **Middle-dot strings** still appear only in the provenance tag and drift chip copy (as in
    DESIGN.md); `present.ts` is where they are produced.
14. **A shell trap for the next agent:** inside a double-quoted `node -e "..."` in this environment,
    backslashes are eaten. Write scripts to files with the Write tool.
