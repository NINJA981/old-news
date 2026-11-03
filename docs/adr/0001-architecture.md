# ADR-0001: Architecture of Old News v0.1

**Status:** Accepted (Stage 1, architect)
**Date:** 2026-10-20
**Deciders:** the maintainer, at architecture time. Two later decisions are reserved for the maintainer: dropping WebGPU (§4.3), and raising the size budget.

## Context

Old News is a WXT browser extension (Chrome MV3 first, Firefox second). It has to:

1. detect article-like pages and map Readability's extracted paragraphs back to live DOM nodes, doing nothing if that fails;
2. remember paragraphs the reader dwelled on, across sites, for 30 days;
3. match each paragraph of a new article against that memory in three tiers (seen, similar, changed), with a deterministic fact-drift guard;
4. paint fades, provenance tags, drift chips and a status pill inside arbitrary third-party pages without breaking them;
5. do all of this with **0 network requests**, an on-device embedding model, and a package size it can state honestly.

The forces pull against each other:

- **Accuracy vs. trust.** A false fade on a changed outcome destroys trust (the main review risk).
- **Coverage vs. feasibility.** There are thousands of news layouts.
- **Model quality vs. package size.** The int8 model is ≈ 23 MB, and the ONNX runtime is 13.6–27 MB.
- **Per-page cost.** The content script runs on every page.
- **Chrome vs. Firefox.** Firefox has no offscreen documents.

No LLM is used anywhere, so the claude-api guidance does not apply. The only model is a sentence-embedding encoder.

## Decision (summary)

1. **WXT + TypeScript.** React 19 + Tailwind v4 + Radix + Motion for **extension pages** (popup, app, onboarding, playground). **Vanilla TypeScript in a closed Shadow DOM** for the **in-page overlay**, keeping per-page cost ≤ 45 KB gz.
2. **A pure, framework-free engine package** (`src/engine`). The same code runs in the offscreen document, the Firefox background page, Node (corpus eval) and the landing-site playground.
3. **Engine host.** On Chrome, an MV3 offscreen document (reason `WORKERS`) that owns a dedicated Worker running transformers.js. On Firefox, the background event page. It is created lazily on the first article and closed after 5 min idle.
4. **Matching.** MinHash (5-word shingles, 128 permutations, 32×4 LSH bands) and MiniLM cosine both produce candidates. A deterministic guard diffs fact tokens. A pure decision table picks the tier. Thresholds live in one file and are tuned on the corpus.
5. **Storage.** IndexedDB via `idb`, owned by the engine host as single writer. Vectors are int8-quantized. TTL is enforced by a daily `alarms` sweep. Settings live in `chrome.storage.local`.
6. **Zero-network enforcement** by CSP, transformers.js env, a lint rule, and an e2e request recorder.
7. **Fades by contrast floor.** The content script reads each paragraph's computed ink and background colours and solves for the opacity that lands at 4.6:1 (seen) or 7:1 (similar). Fades are inline `opacity` on the page element; nothing is inserted into page flow.

## 1. Stack (pinned exactly; versions from `npm view <pkg> version`, 2026-10-20)

| Package | Version | Role |
|---|---|---|
| `wxt` | 0.21.4 | Extension framework (peer: vite ^6.3.4 ‖ ^7 ‖ ^8, typescript ≥ 5.4, node ≥ 22) |
| `@wxt-dev/module-react` | 1.2.2 | React entrypoints |
| `vite` | 8.3.4 | Bundler (for `site/` too) |
| `typescript` | **6.0.3** | Not 7.0.2: `typescript-eslint` 8.72.0 requires typescript < 6.1.0 |
| `react` / `react-dom` | 19.3.1 | Extension pages |
| `@types/react` / `@types/react-dom` | 19.3.0 | |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.3 | Tokens via `@theme inline` |
| `radix-ui` | 1.8.1 | Dialog, Popover, Tooltip, Switch, Tabs, ToggleGroup (unified package) |
| `motion` | 14.4.0 | `MotionConfig reducedMotion="user"` on pages; the overlay uses WAAPI |
| `cmdk` | 1.1.1 | ⌘K / Ctrl+K palette on the app page |
| `sonner` | 2.0.8 | Toasts on extension pages (Undo, Saved) |
| `lucide-react` | 1.60.0 | Icons: 16 px, 1.5 stroke. The overlay inlines the few SVGs it needs. |
| `@fontsource-variable/newsreader` | 5.3.0 | Display and reading face (opsz + wght + italic) |
| `@fontsource-variable/hanken-grotesk` | 5.3.0 | UI face |
| `@mozilla/readability` | 0.6.0 | `Readability` + `isProbablyReaderable` |
| `@huggingface/transformers` | 4.3.1 | Feature extraction. Pulls `onnxruntime-web` 1.31.0-dev.20260914-8d85527a0 (pinned through the lockfile). |
| `idb` | 8.0.4 | IndexedDB wrapper |
| `valibot` | 1.5.0 | Message protocol schemas |
| `@types/chrome` | 0.3.5 | |
| **Dev and test** | | |
| `vitest` | 5.0.5 | Unit and fixture tests |
| `@playwright/test` | 1.64.1 | E2E with the built extension |
| `@axe-core/playwright` | 4.14.0 | A11y checks on extension pages |
| `linkedom` | 0.18.13 | Fast DOM for corpus extraction in Node |
| `jsdom` | 30.1.3 | Vitest environment for mapping tests (needs layout-free `textContent` only) |
| `fake-indexeddb` | 6.2.6 | Storage tests |
| `culori` | 4.0.2 | Token contrast and ΔE checks in CI; contrast-floor solver tests |
| `eslint` / `@eslint/js` | 10.13.0 / 10.0.1 | |
| `typescript-eslint` | 8.72.0 | |
| `eslint-plugin-react-hooks` | 7.1.1 | |
| `prettier` | 3.9.10 | |
| `size-limit` / `@size-limit/file` | 14.2.0 | Per-entry size budgets |
| `tsx` | 4.23.15 | Run eval scripts |
| `sirv-cli` | 3.0.1 | Serve fixture pages on 127.0.0.1 for e2e |
| `@types/node` | 26.6.5 | |
| `@google/design.md` | 0.4.0 | Lint DESIGN.md (`npx @google/design.md lint DESIGN.md`) |

**Model asset:** `Xenova/all-MiniLM-L6-v2`, `onnx/model_quantized.onnx` (int8, 384-dim, mean pooling + L2 normalise), plus tokenizer files.

- `scripts/fetch-model.ts` downloads it **once, at developer build time**, verifies a pinned SHA-256, and writes `public/models/`. It is not committed to git (size) and is cached in CI.
- This is the only network access in the project, and it happens in the developer's build, never in the shipped extension.
- Licence: Apache-2.0, recorded in `THIRD_PARTY.md`.

## 2. Module layout

```
old-news/
├─ wxt.config.ts                 # manifest: incognito not_allowed, CSP, permissions, commands
├─ entrypoints/
│  ├─ background.ts              # router, badge, alarms (TTL), offscreen lifecycle, ingest, settings cache
│  ├─ content/
│  │  ├─ index.ts                # bootstrap (≤ 15 KB gz): gate, detect, extract, map, observe, dwell
│  │  └─ overlay/                # vanilla TS shadow-DOM UI: pill, tags, hover card, drift chip, fold, previously-on
│  ├─ offscreen/                 # offscreen.html + main.ts: engine host (Chrome); spawns engine.worker.ts
│  ├─ popup/                     # React: page status, Previously on, Drift tab, privacy meter, pause
│  ├─ app/                       # unlisted page app.html (React): Stories, Drift, Receipt, Memory, Settings, Playground
│  └─ onboarding/                # unlisted page onboarding.html (React): permission → ingest → done
├─ src/
│  ├─ engine/                    # PURE: no DOM, no chrome.*; shared with site/ and Node
│  │  ├─ normalize.ts  shingle.ts  minhash.ts  lsh.ts
│  │  ├─ facts.ts                # number/date/money/entity/negation/modal/outcome extractors
│  │  ├─ guard.ts                # fact-token diff → DriftFinding[]
│  │  ├─ tiers.ts                # decision table (§5)
│  │  ├─ thresholds.ts           # single source of tuned constants (+ corpus provenance)
│  │  ├─ index.ts                # MemoryIndex: candidates via LSH + brute-force int8 cosine
│  │  ├─ story.ts  receipt.ts
│  │  └─ embedder.ts             # interface Embedder { embed(texts): Promise<Float32Array[]> }
│  ├─ embed/                     # transformers.js adapter (webgpu|wasm), warm-up benchmark, idle unload
│  ├─ extract/                   # readerable.ts, english.ts, readability.ts, map.ts, liveblog.ts, dwell.ts
│  ├─ paint/                     # contrastFloor.ts (solver), fade.ts, fold.ts, highlight.ts (CSS Custom Highlight API)
│  ├─ store/                     # db.ts (schema v1), repo.ts, ttl.ts, wipe.ts, quantize.ts
│  ├─ messaging/                 # protocol.ts (valibot), typed sendMessage wrappers
│  ├─ net/                       # localAsset.ts: the ONLY module allowed to call fetch; asserts chrome-extension://
│  └─ ui/                        # tokens.css (from DESIGN.md), overlay.css (same tokens), React components
├─ public/models/                # fetched at build (gitignored); public/ort/ (copied from node_modules)
├─ tests/
│  ├─ unit/                      # engine, guard, tiers, quantize, ttl, contrast solver, dwell
│  ├─ fixtures/
│  │  ├─ corpus/stories/<id>/    # authored article HTML + labels.json
│  │  ├─ corpus/changed-meaning.jsonl
│  │  ├─ corpus/negatives/       # Wikinews (CC BY 2.5)
│  │  ├─ layouts/                # CMS-pattern templates + expected mapping
│  │  ├─ ATTRIBUTION.md  PROVENANCE.md
│  └─ e2e/                       # Playwright: extension loaded, fixtures served on 127.0.0.1
├─ scripts/  fetch-model.ts  eval-corpus.ts  check-tokens.ts  size-report.ts
└─ site/                         # landing page (Stage 3b), separate package
```

**Rules:**

- `src/engine` imports nothing from `chrome`, the DOM, React or transformers.js, so it is unit-testable and portable.
- Only `src/net/localAsset.ts` may call `fetch`. This is enforced by `no-restricted-globals` with an override for that file.
- `entrypoints/content/**` must not import React, Radix, Motion or Tailwind. This is enforced by ESLint `no-restricted-imports`.

## 3. Runtime architecture

```
 page (any site)                         extension origin
┌───────────────────────────┐   msg    ┌──────────────────────┐  msg   ┌──────────────────────────────┐
│ content/index.ts          │────────▶│ background (SW)       │──────▶│ offscreen doc → engine.worker│
│  gate: paused? incognito? │         │  router · badge       │       │  Embedder (transformers.js)  │
│  readerable + english     │◀────────│  settings cache       │◀──────│  MemoryIndex (LSH + int8 cos)│
│  Readability(clone)       │ results │  alarms: TTL sweep    │       │  guard + tiers               │
│  map → live nodes or STOP │         │  ingest (scripting)   │       │  IndexedDB (single writer)   │
│  dwell tracker            │         └──────────────────────┘       └──────────────────────────────┘
│  MutationObserver         │                 ▲  popup / app / onboarding read summaries + IDB views
│  paint: fades, overlay    │                 └───────────────────────────────────────────────
└───────────────────────────┘
```

### Flows

1. **Page load (`document_idle`).** The bootstrap reads cached settings (`storage.local`) and stops if any of these hold:
   - paused globally, or the origin is paused;
   - `inIncognitoContext`;
   - non-English;
   - not readerable;
   - no article signal (any of: `og:type=article`; JSON-LD `NewsArticle`, `Article`, `BlogPosting` or `LiveBlogPosting`; or ≥ 5 paragraphs ≥ 140 characters).

   Otherwise Readability runs on `document.cloneNode(true)`, then `map.ts` runs. On rejection it sends `{status:'unmapped', reason}` and stops.
2. **Match.** The content script sends `{url, canonical, siteName, title, paragraphs:[{ordinal, text}]}`. The engine embeds the paragraphs, finds candidates, applies the guard, decides tiers, and returns `{ordinal, tier, provenance, drift[]}` plus story info. Texts are held in an in-memory LRU (by hash, ≤ 2,000 entries) in the worker so ingest doesn't re-embed. **Nothing is persisted at match time.**
3. **Paint.** Fades are applied (with the dissolve on first paint, §DESIGN). The overlay mounts lazily, only when there is something to show.
4. **Dwell → ingest.** Read ordinals are batched every 5 s and on `pagehide`. The engine persists the paragraph records, updates the article centroid, links the story, writes drift records for changed paragraphs, and bumps `daily`.
5. **Observe.** A MutationObserver on the article container (debounced 500 ms) re-extracts new blocks (live-blog posts). A `history.pushState`/`popstate` hook plus a canonical-URL change triggers teardown and a re-run (infinite scroll, SPA).
6. **Ingest at install.** Onboarding runs `chrome.scripting.executeScript` on each confirmed open tab. It uses the same extract/map code and marks every mapped paragraph as read. No fetches.
7. **TTL.** `alarms` runs a daily sweep plus one at startup, using `expiresAt` indexes in every store.

### Lifecycle and performance

- **Offscreen.** Created on the first match request. The worker loads the model lazily. The host closes after 5 min with no requests, which frees ≈ 100–150 MB.
- **Index cache.** The worker loads vectors and bands from IDB into typed arrays on start, which takes ≈ 100–200 ms for 40k paragraphs. It is updated incrementally after that.
- **Overlay geometry.** Tags and chips live in one document-absolute layer (`position:absolute` relative to `document.documentElement`). They are recomputed on `ResizeObserver` (article container), font loads and mutations, never on scroll. This gives 0 layout shift because nothing enters page flow.
- **Budgets:**

  | Item | Budget |
  |---|---|
  | Content bootstrap | ≤ 15 KB gz |
  | Bootstrap + overlay | ≤ 45 KB gz |
  | Popup JS | ≤ 120 KB gz |
  | Bootstrap work on non-article pages | ≤ 8 ms |
  | Warm match, 30 paragraphs | ≤ 300 ms p50 |
  | First visible fade after `document_idle`, warm | ≤ 600 ms |

### Firefox

Firefox MV3 uses a non-service-worker background page with a DOM. The engine host there is the background page itself:

- `entrypoints/background.ts` imports `engine-host.ts` when `import.meta.env.FIREFOX`.
- The model runs with `device: 'wasm'` and `numThreads: 1`.
- `chrome.offscreen` is not referenced in the Firefox build.

## 4. Key decisions and options considered

### 4.1 In-page overlay: React in Shadow DOM vs. vanilla TS

| Dimension | React + Tailwind in shadow root (WXT `createShadowRootUi`) | **Vanilla TS + token CSS (chosen)** |
|---|---|---|
| Per-page JS | ≈ 60–70 KB gz on every article page | ≈ 25–30 KB gz |
| Consistency with pages | High | Tokens are shared via generated CSS; components are re-implemented |
| Complexity | Low | Medium: a small hand-written component set |

The overlay runs on every article load. Injected UI has to be fast and isolated, and its components are few and static (pill, tag, card, chip, hairline). Extension pages use React.

### 4.2 Engine host on Chrome: service worker vs. offscreen document

| Dimension | Service worker directly | **Offscreen doc + Worker (chosen)** |
|---|---|---|
| Lifetime | Killed after ~30 s idle, so the model reloads often | Lives while in use; we close it after 5 min idle |
| WebGPU | Available in SW, but restarts discard sessions | Stable session |
| Scope fit | — | Matches the brief ("offscreen document") |

### 4.3 Inference backend: WebGPU + WASM vs. WASM only

- The product brief specifies "WebGPU, with WASM fallback", so v0.1 ships both. This is **binding**.
- Measured cost (npm pack, 2026-10-20):

  | Runtime build | Size |
  |---|---|
  | WASM-only `ort-wasm-simd-threaded.wasm` | 13.6 MB |
  | WebGPU-capable `.jspi.wasm` | 16.0 MB |
  | WebGPU-capable `.asyncify.wasm` | 25.6 MB |
  | WebGPU-capable `.jsep.wasm` | 27.0 MB |

- Only the int8 (`q8`) model is bundled, because fp16/fp32 would add 45–90 MB. WebGPU with an int8 model may not beat WASM at MiniLM-L6 scale.
- **Rule:** at host start, run a 32-paragraph warm-up on WebGPU (if an adapter exists) and on WASM. Use the faster one and record it in `meta.modelInfo`, shown on the Memory page.
- **Stage 2 must report:** the actual ORT file(s) transformers.js 4.3.1 loads for WebGPU, the measured package size, and warm latencies for both backends.
- If WebGPU shows < 20% gain, propose (not perform) a WASM-only build in ADR-0002, because that changes the authoritative scope.

### 4.4 Storage: IndexedDB (idb) vs. OPFS vs. `chrome.storage`

IndexedDB with `idb` (≈ 1 KB) wins:

- it stores typed arrays natively and has `expiresAt` and `bands` indexes;
- it is reachable from the SW, offscreen document and pages, which share one origin;
- `chrome.storage` has quotas and JSON serialisation;
- OPFS adds complexity with no indexing.

### 4.5 Fade mechanism

| Option | Problem |
|---|---|
| Fixed opacity | Fails AA on many pages and is inconsistent across themes |
| Injected page stylesheet + `data-*` attributes | Collides with page CSS |
| **Inline `opacity` computed per paragraph from the contrast floor (chosen)** | — |

- The previous inline value is stored, so the change is fully reversible.
- A paragraph whose background is not solid (image or gradient) falls back to `opacity: 0.62` for seen and `0.78` for similar, and gets a 1px left rule from the overlay.

### 4.6 Drift highlight

- **CSS Custom Highlight API** (`CSS.highlights`, `::highlight(on-drift)`) for the steady state. It does not mutate the page DOM.
- An overlay rect does the two-beat pulse (opacity only), because `::highlight` cannot animate.
- The chip is anchored above the token's `Range.getBoundingClientRect()`.
- Fallback where highlights are unsupported (older Firefox): the overlay rect stays at rest opacity.

## 5. Matching: tier decision table

Inputs for paragraph `p` (normalised: NFKC, lowercased for shingles, quotes and dashes unified, whitespace collapsed; skipped if < 60 characters or boilerplate):

- `J`: MinHash Jaccard estimate with the best LSH candidate `m_j`.
- `C`: cosine with the best embedding candidate `m_c` (top-k = 5 over the last 30 days, excluding the same article in the same session).
- `G(p, m)`: guard findings between `p` and its match.
- `L = len(p) / len(m)`.
- `F`: a "Not old news" feedback entry for the pair.

| Condition (first match wins) | Tier | Paint |
|---|---|---|
| `F` exists | new | none |
| (`J ≥ J_seen` or `C ≥ C_dup`) and `G ≠ ∅` | **changed** | full ink + drift highlight + chip |
| `C ≥ C_sim` and `G ≠ ∅` | **changed** | same |
| `J ≥ J_seen` and `G = ∅` and `0.7 ≤ L ≤ 1.4` | **seen** | fade to 4.6:1 + tag "Outlet · time" |
| `C ≥ C_dup` and `J ≥ J_near` and `G = ∅` | **seen** | same |
| `C ≥ C_sim` and `G = ∅` | **similar** | fade to 7:1 + tag "Similar to Outlet · time" |
| otherwise | **new** | none |

Starting values in `thresholds.ts`: `J_seen 0.60`, `J_near 0.35`, `C_dup 0.93`, `C_sim 0.82`. Stage 2 tunes them on the corpus to maximise similar-tier recall subject to full-fade precision ≥ 0.98 and 0 full fades on the changed-meaning split. The tuned values and the corpus hash are recorded beside them.

### The guard

`facts.ts` extracts typed tokens with offsets. `guard.ts` aligns tokens by kind and local context (the 3 words before) and reports a finding when an aligned pair differs or a load-bearing token is present on one side only.

| Kind | Extracted |
|---|---|
| number | Digits with separators, number words up to "twenty", "dozens", percentages, units |
| date | Weekday names, month-day forms, ISO dates, "yesterday/today" (kept raw, not resolved) |
| money | Currency symbol or code + amount + multiplier (m/bn/million) |
| entity | Capitalised spans not at sentence start, minus a stoplist; acronyms |
| negation | not, no, never, n't, without, denied, refused |
| modal | may, might, could, will, would, should, must, plans to, expected to |
| outcome | arrested, fled, charged, released, died, killed, injured, hurt, denied, confirmed, resigned, delayed, cancelled, postponed, approved, rejected, won, lost, closed, reopened, evacuated, found, missing, recovered, sentenced, acquitted, and lemma variants |

**Asymmetry rule:** an outcome, negation or modal token present on only one side always fires. A number present on only one side fires only if the other side has a number of the same unit within the aligned context. This keeps "more details" from firing.

## 6. Contrast-floor solver

For each paragraph element:

1. `ink` = computed `color`.
2. `bg` = the first ancestor with a non-transparent `background-color` (alpha-composited down to the canvas). If an ancestor has a `background-image`, use the fallback (§4.5).
3. Binary-search α ∈ [0, 1] so that `contrast(blend(ink, bg, α), bg)` = target (4.6 seen, 7.0 similar; "light" fade strength uses 7.0 and 10.0).
4. Apply `opacity: α`. If the native contrast is already below the target, apply no fade and draw only the tag.

Worked values:

| Ink on background | Native | Seen (α → result) | Similar (α → result) |
|---|---|---|---|
| `#121212` on `#ffffff` | 18.7:1 | α 0.58 → `#767676` | α 0.70 → `#5a5a5a` |
| `#e8e8e8` on `#121212` | 15.3:1 | α 0.50 → `#7d7d7d` | — |

## 7. Message protocol (valibot-validated)

| Message | Direction | Response |
|---|---|---|
| `page/analyse` | content → background → engine | `page/result` |
| `page/read` (ordinals) | content → background → engine | — |
| `page/status` | content → background | updates badge and session summary |
| `ingest/tabs` | onboarding → background | — |
| `settings/changed` | broadcast | — |
| `memory/stats` | popup/app → engine | — |
| `memory/wipe` | popup/app → engine | — |
| `drift/list`, `stories/list`, `receipt/week` | app → engine | — |
| `font/get` | content → background | base64 woff2 |

All payloads are schema-checked at each boundary. Unknown messages are dropped. Paragraph text never appears in logs: the logger redacts `text` fields and is off in production builds.

## 8. Testing approach and fixture strategy

### Pyramid

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest (node + jsdom) | normalise, shingle and MinHash maths (property tests: Jaccard estimate error ≤ 0.1 at 128 perms), LSH, guard (≥ 3 minimal pairs per kind), tiers table, int8 quantisation error (cosine drift ≤ 0.01), contrast solver, dwell rule, TTL sweep, wipe, story linking, receipt maths, protocol schemas |
| Fixture | Vitest + linkedom/jsdom | extraction + mapping on `tests/fixtures/layouts/*` with expected mapped ordinals or `REJECT`; live-blog block splitting; English detection |
| Corpus eval | `scripts/eval-corpus.ts` (tsx, Node) | The **real** MiniLM via transformers.js in Node (same weights, same thresholds). Simulates reading story articles in order and scores every paragraph's tier against `labels.json`. Writes `metrics.json` and a Markdown table. |
| E2E | Playwright (Chromium persistent context, `--load-extension=.output/chrome-mv3`) | Fixture pages served by `sirv` on 127.0.0.1: dissolve + tiers, pill and badge, hover card, N/J/K, unmapped rejection, live-blog append, infinite-scroll swap, onboarding ingest, wipe, pause, **network recorder (0 external requests)**, axe on popup/app/onboarding, screenshots at 375/768/1440 light+dark for pages and the popup at its real size |

Unit and fixture tests use a deterministic `FakeEmbedder` (hashed bag-of-words → 384-d). Only the corpus eval and e2e use the real model.

### Corpus (`tests/fixtures/corpus/`)

**Story sets** are authored for this repo (CC0). We do **not** commit copyrighted news text. There are 12 invented stories (e.g. "Port Alder warehouse fire", "Kessel Valley rail closure", a city budget vote, a court ruling, a product recall, a long-form health blog cluster). Each has:

- a wire original by an invented wire service ("Fenwick Wire");
- 2–3 republications by invented outlets ("Calder Courier", "Morrow Daily", …) with new headlines and ledes, re-ordered paragraphs, light copy-edits, inserted local paragraphs and ads;
- 1–2 day-2 updates with labelled drift (numbers, outcomes, negations, dates, entities) and re-pasted background;
- `labels.json`: for each paragraph, the expected tier and the source paragraph id, written by hand at authoring time.

**Changed-meaning split** (`changed-meaning.jsonl`, ≥ 150 minimal pairs) covers each guard kind plus paraphrased-but-unchanged controls.

**Negatives:** ≥ 30 Wikinews articles (CC BY 2.5, attributed) on the same topics but different events, so the similar tier doesn't over-fire.

**Layout fixtures:** authored templates of common CMS markup patterns, each with an expected mapping:

- WordPress-like
- Arc-like nested wrappers
- Ghost and Substack-like
- Medium-like
- AMP
- Live blog with timestamped posts
- Paywall teaser (expected **REJECT**)
- Text split by inline ad slots
- Pull quotes and captions (must be excluded)
- Infinite-scroll second article

### Metrics published (README + `metrics.json`)

- Full-fade (seen) precision
- Similar-tier precision
- Wire recall
- Paraphrase recall
- **Changed-meaning recall**
- Full fades on the changed-meaning split (must be 0)
- Mapping acceptance rate on layout fixtures
- Corpus size, model SHA-256 and thresholds hash

**CI gates:** seen precision ≥ 0.98; 0 changed-meaning full fades; every layout fixture's expected `REJECT` holds.

### Real-site smoke list (manual, per release)

`docs/smoke-sites.md` lists 20 public article URLs: major wires, national outlets, a live blog, two blogs. Each is checked by hand (mapped / rejected / tiers sane). Only results are recorded, never page text.

## 9. Security and privacy controls (summary)

- **Manifest:**
  - `incognito: "not_allowed"`;
  - `content_security_policy.extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self'"`;
  - host access is optional and requested on onboarding (`activeTab` works before it is granted).
- **Content script:** never `innerHTML`s page text into our UI (`textContent` only); the overlay root is a closed shadow root; no `eval`.
- **Logging:** none of user data. Redaction is unit-tested.

## Trade-off analysis

| We chose | Over | Accepting | Instead of |
|---|---|---|---|
| A strict do-nothing mapping rule | Partial painting | Lower coverage (some sites never activate) | Broken or mis-faded pages |
| Bundling the model | Downloading it | A 40–50 MB package | A runtime network call |
| A vanilla overlay | Reusing React components | Some duplication | 45 KB gz of React on every article page |
| Contrast-floor fades | Stylish ghost-grey | A less dramatic fade on low-contrast pages | Unreadable "old" text |

## Consequences

**Easier:**
- Proving privacy (CSP + recorder).
- Porting the engine to the site playground and Node eval.
- Tuning thresholds against published metrics.

**Harder:**
- Maintaining two UI implementations (overlay vs. pages).
- Firefox parity (a separate engine host path).
- Getting a 40–50 MB extension through store review. Mitigated by a clear listing description.

**Revisit:**
- WebGPU's value (ADR-0002 candidate).
- Multilingual support.
- A smaller model (e.g. a distilled 128-d model) if size complaints arrive.
- The side panel for Drift if the popup tab proves cramped.

## Action items (Stage 2)

1. [ ] Scaffold WXT with the pinned versions. Wire DESIGN.md tokens into `src/ui/tokens.css` and `overlay.css` from one source (`scripts/check-tokens.ts` verifies parity, contrast and ΔE with culori).
2. [ ] `scripts/fetch-model.ts` with a pinned SHA-256. Copy ORT wasm into `public/ort/`. Record exact sizes.
3. [ ] Implement `src/engine/*` with the unit tests in §8.
4. [ ] Implement `src/extract/*` and `src/paint/*` with layout fixtures.
5. [ ] Engine host (offscreen + worker; Firefox background path), protocol and storage.
6. [ ] Author the corpus (≥ 12 stories, ≥ 150 minimal pairs, ≥ 30 Wikinews negatives). Write `eval-corpus.ts`, tune thresholds, and write `metrics.json`.
7. [ ] Run the WebGPU vs WASM benchmark and record it in HANDOFF.md.
8. [ ] Set size-limit budgets for the content script and popup, and a package-size baseline.
