# HANDOFF: Old News site (landing page + web app)

**Stage:** 3b. **Scope:** everything lives in `site/`. The only file edited outside it is `SPEC.md`
(new section 14, "Web app"). The root `HANDOFF.md` was not touched, because another agent was
editing the repo root at the same time; fold this file into it when the stages merge.

## State in one paragraph

`site/` is a separate package (own `package.json`, lockfile and tests) that builds to a static
`dist/`. It holds the launch landing page at `/` and the phone-friendly web app at `/app/`. The web app
imports the real engine from `src/core/index.ts` through the `@engine` Vite alias, keeps history in
IndexedDB (`old-news-web`), works offline after the first load, and installs as a PWA.
`pnpm typecheck`, `pnpm test` (18 unit tests), `pnpm check-tokens`, `pnpm lint`, `pnpm build` and
`pnpm test:e2e` (11 tests) all pass.

## How to run

```bash
cd site
pnpm install
pnpm dev            # runs `pnpm assets` first, then Vite on :5173 (no service worker in dev)
pnpm build          # assets, typecheck, vite build, service worker, size report -> dist/
pnpm preview        # serves dist/ on :4391 (the service worker only exists in a build)
pnpm test           # Vitest (landing context, text parsing, renderer)
pnpm test:e2e       # Playwright against `vite preview`; run `pnpm build` first
pnpm check-tokens   # DESIGN.md tokens vs src/styles/tokens.css, and no colour literal elsewhere
pnpm fixtures       # regenerates src/data + src/generated from the repo's metrics.json and the fixture stories
```

`pnpm assets` copies the Fontsource latin subsets, the MiniLM int8 model and the ONNX runtime wasm into
`public/` (all gitignored). The model comes from the repo root, so run `pnpm fetch-model` there once.
Optional env for the build: `VITE_REPO_URL` (adds the Source, Licence and clone links) and
`VITE_STORE_URL` (turns the **Add to Chrome** button into a store link). Without them the page says the
link is added when the repository is published, and the button scrolls to the install steps.

## What is where

| Path                                                              | What                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`, `src/landing/page.ts`, `src/landing/main.ts`        | Landing. The body is rendered to real HTML at build time by `vite.config.ts` (a plugin), so the hero text is real HTML and paints without JS. The measured LCP element is the sub-line paragraph (`p.lead`), a text block directly under the H1, not the poster or a canvas. `main.ts` is 5.5 KB gz. |
| `src/styles/landing.css`, `product.css`, `base.css`, `tokens.css` | Tokens (from DESIGN.md), the faithful HTML/CSS reproduction of the overlay (`.on-*` classes), landing layout.                                                                                                                                                                                        |
| `src/shared/dissolve.ts`, `reader.ts`, `render.ts`, `view.ts`     | The signature moment (paragraphs drop to pencil, tags fade in, pill counts down, amber chip pulses) and the N, J, K keys. Shared by the landing demo and the app.                                                                                                                                    |
| `app/index.html`, `src/app/*`                                     | Web app (React 19). `engine.ts` is the thin adapter (below). `shell.ts` is the static first paint.                                                                                                                                                                                                   |
| `sw-src/sw.js` + plugin in `vite.config.ts`                       | Service worker for `/app/` only: precache list from the build manifest, same-origin GET only.                                                                                                                                                                                                        |
| `public/app/manifest.webmanifest`, `public/app-icons/`            | PWA manifest and icons (192, 512, maskable, monochrome).                                                                                                                                                                                                                                             |
| `scripts/`                                                        | `copy-assets`, `build-fixtures`, `make-icons`, `check-tokens`, `size-report`, `node-embedder`.                                                                                                                                                                                                       |
| `tests/`                                                          | Unit and Playwright e2e (acceptance criteria W1 to W15 in SPEC.md section 14).                                                                                                                                                                                                                       |

## Engine reuse (and the one adapter)

The engine has no `chrome.*` calls, so **no engine change was needed**. Aliases: `@engine` is
`src/core/index.ts`, `@adapters` is `src/adapters`, `@extract` is `src/extract`. The site re-implements
no matching, fading or drift logic. The thin adapter `src/app/engine.ts` chooses only environment
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

Profile: 375 x 812, DPR 2, 4x CPU slowdown, Fast 4G, cold cache, production build over `vite preview`.

| Item                                                                    | Result                                                                         | Budget                                | Verdict                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- | ---------------------------- |
| Landing LCP (element: the hero sub-line text)                           | 0.94 s on the last run, 1.56 s on an earlier, busier run                       | <= 2.0 s (bible 11.3)                 | met                          |
| Landing CLS                                                             | 0.00                                                                           | 0                                     | met                          |
| Web app LCP (cold, service worker cleared)                              | 1.72 s                                                                         | <= 2.0 s (used as the app target too) | met                          |
| Web app CLS                                                             | 0.00                                                                           | 0                                     | met                          |
| Landing initial JS                                                      | 5.5 KB gz                                                                      | <= 120 KB gz                          | met                          |
| Web app first-route JS                                                  | 111.9 KB gz                                                                    | <= 170 KB gz (site budget)            | met                          |
| 3D / WebGL chunk                                                        | none (0 KB). The sheet stack is CSS 3D only, as DESIGN.md's CSS-only plan says | <= 260 KB gz (R3F)                    | not used                     |
| Lighthouse, landing and app, mobile: Accessibility, Best Practices, SEO | 100 each                                                                       |                                       | met                          |
| Lighthouse, Agentic Browsing                                            | 75: one failing audit, `ard-schema` (no `ai-catalog.json`)                     | not a requirement                     | left as is, see known issues |

Before and after: the first landing trace was LCP 3.5 s. Two fixes took it under budget: `content-visibility: auto`
on every band below the hero (style and layout were about 1 s of main-thread time under 4x throttling), and
inlining the two stylesheets into `index.html` at build time (removes a render-blocking round trip). The web
app was 2.78 s until a static HTML shell was added inside `#root` (`src/app/shell.ts`), which React replaces on
mount.

## Decisions worth knowing

- **No WebGL.** The bible allows 3D only within the 11.3 budget and requires GPU tiers and fallbacks. The hero uses
  CSS `perspective` and `translateZ` instead, so there is nothing to tier or to fall back from. Motion tier 0
  (reduced motion, Save-Data, 2 GB or less of device memory) skips autoplay and shows the final frame with a
  Play button.
- **Product visuals are live HTML/CSS reproductions** of the overlay, built from the engine's own output for the
  fixture stories ("Fenwick Wire", "Calder Courier", "Morrow Daily", town "Port Alder", all invented and labelled
  "Fixture story"). They are not screenshots. No testimonials, stars or invented stats: every number on the page
  comes from `src/generated/measured.json` (a copy of the repo's `metrics.json` and package sizes) or from the engine.
- **Honest limits are on the page**: the changed-meaning recall (0.82) is below the 0.85 target and the corpus is
  three stories, and the page says so.
- **Touch:** the provenance tags and drift chips are small beside the text. On a coarse pointer a 44 px invisible
  hit layer is added (`@media (pointer: coarse)` in `product.css`), so layout does not move. Tested by e2e `375 touch`.
- **CSP** is set by `<meta>` at build: landing `default-src 'self'`; app adds `'wasm-unsafe-eval'` for the optional model
  and `connect-src 'self'`.

## Known issues and not done

1. **PWA install was not exercised in a real browser.** The manifest, icons and service worker exist and the e2e
   offline test passes, but the chrome-devtools Lighthouse tool here has no PWA category, so no "installable" score
   was produced. Check the install prompt by hand in Chrome and on a phone.
2. **Lighthouse "Agentic Browsing" is 75** (`ard-schema`: no valid `ai-catalog.json`). That audit is experimental and
   unrelated to the product; `llms.txt` and `robots.txt` are present. Left alone on purpose.
3. **Performance numbers are from one laptop under emulation**, and varied by run (landing 0.94 s to 1.56 s). Re-measure
   on the deployed host. The landing first-run times depend on the machine being quiet.
4. **The optional real-model path in the web app** (23 MB, WASM, single-threaded; `enableModel()` in `src/app/engine.ts`) has no
   test and was not run in a browser during this stage. The e2e suite covers only the precomputed-vector and degraded paths.
   Try the Settings toggle by hand before relying on it.
5. **No store URL or repository URL yet.** Set `VITE_STORE_URL` and `VITE_REPO_URL` at build time when they exist.
6. **Landing video loops from LANDING.md** (beats 2 and 3, MP4 and WebM) are not built; the same moments are live
   DOM demos instead (the hero dissolve, the N/J/K demo, the drift pulse, the tray). Stage 6 can record the capture.
7. The landing stylesheet that was inlined into `index.html` is still emitted as `dist/assets/main-*.css`; unused, harmless.
8. `vite build` warns that `src/extract/readability.ts` is imported both statically and dynamically; it only means
   the dynamic import does not split a chunk.
9. Root `HANDOFF.md` has no site section (see the top of this file).
