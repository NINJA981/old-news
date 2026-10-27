# Old News: product specification (v0.1)

**Status:** Stage 1 (architect), 2026-10-20. **Scope authority:** `_studio/picks.json` → `old-news` (`refined_scope`, `signature_moment`, `risks`). Where this document adds emphasis (the weakness fix in §5), picks.json wins on conflict.

**One line:** a browser extension that remembers every paragraph you've read, across sites, and on the next article about the same story fades what you already know, names where you read it, and lights up only what's new, including the one number that changed. On-device, 0 network requests.

---

## 1. Problem

News reading is mostly re-reading.

- Each update on a developing story re-pastes 60–80% background.
- The same wire copy runs on a dozen sites under different headlines.
- Five "best X" or health tabs repeat each other.

Readers scroll 1,500 words to find the 2 paragraphs that are new to them, and they miss the one figure that changed between versions ("12 injured" yesterday, "14 injured" today). Nothing on the market marks this inside the article body, across sites, at paragraph level:

| Tool | Granularity | What it does |
|---|---|---|
| Fresh News, Nunus | Link or headline | Marks links you've already seen |
| SiteDelta | One URL against itself | Diffs a page against your last visit |
| DejaRead | Search | Searches your past reading; never marks the page |
| read smart | Rewrite | An LLM rewrites the page |

## 2. Users

| Who | Situation | Job |
|---|---|---|
| **Primary: multi-outlet news reader** (desktop) | Opens 3–5 outlets on one story each morning, from an aggregator, a newsletter or Reddit | Read only what's new; catch figures that changed |
| **Story follower** (desktop) | Returns to a developing story on day 2 and day 3 | "What changed since I last read about this?" |
| **Long-form researcher** (desktop) | Health, purchase or how-to research across several blog posts that repeat each other | Skip the repeated background and find the distinct advice |

**Honest limits** (from the council): this is a desktop minority habit. Mobile Chrome has no extensions. Most casual readers read one source per story. v0.1 targets the people above and does not pretend otherwise.

## 3. Daily trigger

Old News works passively, so there is nothing to start.

1. **Morning tabs.** By the second article on a story, the page is mostly greyed out with "Fenwick Wire · 14 min ago" tags, and the toolbar badge reads `4`. The pill reads "Only 4 of 23 paragraphs are new to you."
2. **Next-day return.** A "Previously on this story" card at the top of the article lists what you read and which figures changed since.
3. **Day 1 (cold start).** At install, Old News offers to remember the article tabs already open, so the first fade can happen within minutes.
4. **Weekly.** A reading receipt: "You read 41,200 words this week. 63% was stuff you'd already read." This is computed only from the reader's own local counters, and the numbers here are illustrative copy, not data.

## 4. MVP features (refined scope)

| # | Feature | Notes |
|---|---|---|
| F1 | **Article detection + extraction** | WXT content script; Readability on a document clone. Runs only on article-like pages (news, long-form blog posts, live blogs), English only, never in incognito. |
| F2 | **DOM mapping, or nothing** | Each extracted paragraph is mapped back to exactly one live DOM element. **If mapping fails, Old News does nothing on that page** (§5.2). |
| F3 | **Live blogs + infinite scroll** | Each timestamped live-blog post is a paragraph block. A MutationObserver handles appended posts and next-article infinite scroll. |
| F4 | **Read tracking (dwell)** | A paragraph counts as read once ≥ 60% of it has been visible in a focused, visible tab for a cumulative `max(1.2 s, words ÷ 6 s)`, capped at 6 s. |
| F5 | **On-device embeddings** | Bundled quantized all-MiniLM-L6-v2 (int8) via transformers.js in an MV3 offscreen document (WebGPU with WASM fallback). Firefox runs the same engine in the background event page. **Lazy:** nothing loads until the first article page needs it, and it unloads after 5 min idle. |
| F6 | **Three-tier matching** | **Seen**: a MinHash/shingle match (wire copy, re-pasted background) gets the full fade. **Similar**: an embedding-only match gets a lighter fade, labelled "similar to". **Changed**: a match whose load-bearing tokens differ stays lit and glows amber. |
| F7 | **Fact-drift guard** | Fires on any number, date, money or named-entity difference, or any negation, modal or outcome-verb difference (arrested / fled / charged / released / died / injured / denied / confirmed / resigned / delayed / cancelled …). A guarded paragraph is **never faded**. |
| F8 | **Fade, never hide** | Faded text lands at a contrast floor: 4.6:1 for seen, 7:1 for similar, against the page's own background. Hover, focus or J/K restores full ink. Nothing is removed from the page. |
| F9 | **Provenance tag + hover card** | Tag: "Fenwick Wire · 6 min ago" (or "Similar to Calder Courier · yesterday"). The hover card shows the outlet, article title, when you read it, the 140-character snippet, **Open original**, and **Not old news** (local feedback). |
| F10 | **Drift chip** | Amber chip on the changed token: "12 → 14 · Calder Courier said 12, 14 min ago". The chip is keyboard-reachable. |
| F11 | **Badge + pill** | Toolbar badge shows the new-paragraph count (≤ 4 characters). The in-page pill reads "Only 4 of 23 paragraphs are new to you". |
| F12 | **Keyboard** | **N** folds old paragraphs to hairlines (and unfolds them). **J/K** jump between new paragraphs. Active only when no input is focused and only on pages Old News acted on. Can be turned off. |
| F13 | **Install-time ingest** | The onboarding page lists open tabs that look like articles, all pre-checked, with a "Remember these 6 tabs" action. It reads only the already-loaded DOM of those tabs and never fetches anything. |
| F14 | **"Previously on" card** | Per-story card that replaces full story clustering. A story is the set of articles from the last 7 days linked by ≥ 2 matched paragraphs or article-centroid cosine ≥ 0.75. The card lists prior articles (outlet, title, when) and changed figures. Collapsed by default to one line. |
| F15 | **Drift list** | Popup tab (current story) and app page (all stories, 30 days). Each row: context label, before → after, both sources and times. |
| F16 | **Weekly reading receipt** | App page card built from local daily counters. **Save image** renders a PNG locally; **Copy text** copies one sentence. Nothing is uploaded. |
| F17 | **Storage + privacy controls** | IndexedDB, 30-day TTL (daily sweep), one-click **Forget everything**, per-site pause, global pause. |
| F18 | **Playground** | Extension page that runs 3 fixture articles (one invented story, three invented outlets) through the same engine. The landing site embeds the same engine with build-time-precomputed fixture embeddings (§9). |
| F19 | **CI fixture corpus** | Publishes **fade precision** and **changed-meaning recall** (plus wire and paraphrase recall) to `metrics.json` and the README on every CI run. |

## 5. Weakness fix (council scores: utility 5, feasibility 6)

### 5.1 Raising utility

- **No empty day 1.** The install-time ingest offer (F13) turns already-open article tabs into memory before the first new article loads. Copy is honest about what this means: "Old News will treat these as read."
- **Value on every return, not only on the third tab.** The "Previously on" card (F14) fires when you come back to a story the next day, which is the more common habit than reading three outlets in one sitting.
- **A number on every visit.** The "4 of 23 paragraphs are new to you" pill and the badge (F11) quantify the payoff on each matched article, and the weekly receipt (F16) aggregates it.
- **A wider page set.** Long-form blog posts (`BlogPosting`, Substack and Ghost-style posts, Medium-style articles) count as article-like, alongside news and live blogs. Research tabs that repeat each other are a real second use.
- **A focused scope.** Chrome first, English first, article-like pages only. Firefox ships as a second build with the same engine (§10). Nothing is promised for other languages.

### 5.2 Raising feasibility

- **Strict "do nothing if DOM mapping fails".** A page is acted on only if all of these hold:
  1. Readability returns ≥ 3 paragraphs of ≥ 60 characters.
  2. ≥ 80% of those paragraphs (by count) map to exactly one live element whose normalised text equals the extracted text, with a whitespace- and quote-insensitive comparison.
  3. No two extracted paragraphs map to the same element.

  Otherwise the page gets no fades, no overlay and no badge. The popup says "Old News couldn't line up this page's paragraphs, so it left the page alone." An unmapped paragraph on an otherwise-mapped page is never touched.
- **Guard before fade.** Tier logic is "fade only if nothing load-bearing differs". Ambiguity resolves to *lit*.
- **CI fixture corpus with published metrics** (F19, §11). Thresholds are tuned on the corpus, and the numbers ship in the README whatever they are.
- **Layout fixtures.** Authored HTML templates mimic common CMS markup patterns: nested wrappers, interleaved ads, pull quotes, figure captions, paywall teasers, AMP, live blogs and infinite scroll. Each mapping rule is tested against them.
- **A degrading engine.** If the model fails to load, the seen and changed tiers still work (MinHash + guard), the similar tier is off, and the popup says so.

### 5.3 Size, honestly

- The model is bundled, because runtime downloads would break the 0-request promise. It is **lazy-loaded**: no memory or CPU cost until an article page needs it, and it unloads after 5 min idle.
- Measured inputs (2026-10-20; the onnxruntime-web version pinned by transformers.js 4.3.1):

  | Component | Size |
  |---|---|
  | `ort-wasm-simd-threaded.wasm` (WASM only) | 13.6 MB |
  | `…jspi.wasm` / `…asyncify.wasm` / `…jsep.wasm` (WebGPU-capable) | 16.0 / 25.6 / 27.0 MB |
  | `model_quantized.onnx` (int8 MiniLM-L6) | ≈ 23 MB, exact size measured in Stage 2 |

  The extension will be roughly 40–50 MB unpacked.
- **The README states the measured packed and unpacked size, and what each part is.** CI fails if the packed size grows more than 5% over the recorded baseline without a README update.

## 6. Non-goals (v0.1)

- Mobile browsers, Safari, and non-English pages.
- PDFs, paywalled text you never saw, comment sections, and social feeds.
- Rewriting, summarising or translating pages. No LLM is used anywhere.
- Full story clustering or a timeline view (replaced by the "Previously on" card).
- Fetching history pages, background crawling, or any sync, accounts or cloud.
- Hiding content without a user action.

## 7. Data model

All user data lives in **IndexedDB** in the extension origin (`chrome-extension://<id>`, database `old-news`, schema v1), except settings, which live in `chrome.storage.local`.

| Store | Key | Fields | Notes |
|---|---|---|---|
| `articles` | `id` = SHA-256(canonical URL) | `url`, `canonicalUrl`, `origin`, `siteName` (from `og:site_name`, else hostname), `title`, `kind` (`news`/`blog`/`liveblog`), `firstReadAt`, `lastReadAt`, `paragraphCount`, `readCount`, `centroid` (Int8Array 384 + scale), `storyId`, `expiresAt` | The URL and title are needed for provenance ("Open original") |
| `paragraphs` | `id` = SHA-256(articleId + normalised text) | `articleId`, `ordinal`, `snippet` (≤ 140 chars), `minhash` (Uint32Array 128), `bands` (string[32], multiEntry index), `vec` (Int8Array 384) + `vecScale`, `facts` (≤ 24 `{kind, norm, raw, offset}`), `words`, `readAt`, `expiresAt` | Full paragraph text is **not** stored |
| `stories` | `id` | `articleIds[]`, `label` (title of the first article), `createdAt`, `updatedAt`, `expiresAt` | |
| `drift` | `id` | `storyId`, `newParagraphId`, `oldParagraphId`, `kind` (`number`/`date`/`money`/`entity`/`negation`/`modal`/`outcome`), `before`, `after`, `context` (≤ 60 chars around the token), `oldArticleId`, `newArticleId`, `detectedAt`, `expiresAt` | |
| `feedback` | `pairKey` | `verdict: 'not-old'`, `createdAt`, `expiresAt` | Set by "Not old news"; suppresses that pair |
| `daily` | `day` (YYYY-MM-DD, local) | `words`, `wordsKnown`, `wordsFolded`, `articles`, `pNew`, `pSeen`, `pSimilar`, `pChanged` | Feeds the receipt. Kept 35 days. |
| `meta` | `key` | `schemaVersion`, `lastSweepAt`, `modelInfo` | |

**`chrome.storage.local`, key `settings`:**

- `paused`, `pausedOrigins[]`
- `fadeStrength` (`standard` | `light`)
- `dissolve` (bool), `keys` (bool)
- `theme` (`system` | `light` | `dark`)
- `onboardingDone`, `ingestOffered`

**`chrome.storage.session`:** per-tab page summaries, so the popup paints instantly. These are cleared when the browser closes.

**Size estimate.** About 2.3 KB per paragraph: 384 B vector + 512 B MinHash + 32 bands + snippet + facts. A heavy reader (50 articles/day × 25 paragraphs × 30 days ≈ 37,500 paragraphs) uses about 90 MB at worst. The TTL bounds it.

## 8. Privacy model

### What is stored where

| Data | Where | Retention |
|---|---|---|
| Vectors, MinHash signatures, fact tokens, 140-character snippets, article URL/title/outlet, read timestamps, drift records, daily counters | IndexedDB, extension origin, this browser profile only | 30-day TTL (daily counters 35 days) |
| Settings, paused sites | `chrome.storage.local` | Until changed |
| Current-tab summaries | `chrome.storage.session` | Cleared when the browser closes |

Never stored:

- Full paragraph text
- Pages you didn't dwell on
- Incognito pages (the extension is `incognito: "not_allowed"`)
- Pages on paused sites
- Non-article pages
- Anything typed into forms

### Network policy: zero requests at runtime

- No server, telemetry, analytics, crash reporting, update pings or remote fonts. The model and the WASM runtime are bundled.
- **Enforced, not promised:**
  1. Extension-page CSP sets `connect-src 'self'` (plus `script-src 'self' 'wasm-unsafe-eval'`), so even a bug cannot reach the network from the service worker, offscreen document, popup or app pages.
  2. transformers.js runs with `allowRemoteModels = false` and local `wasmPaths`.
  3. The content script never calls `fetch` or `XMLHttpRequest`. Overlay fonts reach the page as base64 via extension messaging, so the page's Network panel shows no Old News entries.
  4. A lint rule bans `fetch` outside one allowlisted module that asserts `chrome-extension://` URLs.
  5. An e2e test records every request from all extension targets and from the page while Old News works, and asserts **0 requests leave the machine**.
- The only network activity related to Old News is the browser's own extension-store update check, which the browser performs, not the extension.

### Controls

- **Forget everything:** deletes the IndexedDB database and the session summaries, with a two-step inline confirm because it is irreversible.
- Per-site pause, global pause, and a 30-day TTL that is not configurable upward.
- The privacy meter in the popup footer reads: "0 requests sent · 3,412 paragraphs remembered · oldest 29 days."

### Permissions

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Memory |
| `offscreen` | Engine host |
| `scripting`, `tabs` | Install-time ingest of open tabs |
| `alarms` | TTL sweep |
| `activeTab` | Works on click before host access is granted |
| optional host `https://*/*`, `http://*/*` | Requested on the onboarding page with an explanation; needed for passive operation |

## 9. Platform matrix

| Target | Status v0.1 | Engine host | Inference | Notes |
|---|---|---|---|---|
| Chrome ≥ 120 (desktop) | **Primary**: full support and e2e-tested | Offscreen document (`WORKERS` reason) + dedicated Worker | WebGPU if an adapter is available and faster on warm-up; otherwise WASM | Offscreen API since 109; WebGPU in extension pages since 113 |
| Edge / Brave (Chromium) | Best effort: same build, smoke-tested manually | Same | Same | |
| Firefox ≥ 128 (desktop) | Second build (`wxt build -b firefox`); unit-tested plus a manual smoke list | Background event page (Firefox has no offscreen API) | WASM, single-thread | `incognito: "not_allowed"` honoured |
| Safari, iOS, Android, mobile Chrome | **Not supported** | — | — | Mobile Chrome has no extensions |
| Landing-site playground | Static site | Page | MinHash + guard live; embeddings precomputed at build time by the same model and labelled so | No 23 MB download for visitors |
| Languages | English only | — | — | Non-English pages: do nothing |

## 10. Acceptance criteria (testable)

Test levels are **U** (Vitest unit), **F** (fixture/corpus), **E** (Playwright e2e with the built extension) and **M** (manual checklist recorded in HANDOFF.md).

**F1. Detection and extraction**
- AC1.1 (F/E): on every article fixture (news, blog, live blog), the page is classified article-like. On every non-article fixture (search results, a webmail-like page, a product listing, a docs index, a social feed), Old News makes no DOM changes and sets no badge.
- AC1.2 (E): with `lang="fr"` or a non-English stopword ratio, the page is untouched.
- AC1.3 (E): the extension cannot be enabled in incognito. The manifest has `incognito: "not_allowed"`, and a test asserts it.

**F2. Mapping**
- AC2.1 (F): for each layout fixture, mapped/total ≥ 0.8 and no element is double-mapped, or the page is rejected. The rejection fixtures (paywall teaser with truncated text, canvas-rendered text, text split across sibling spans by ads) produce **zero** DOM mutations, as asserted by a MutationObserver diff.
- AC2.2 (E): a rejected page shows the popup state "couldn't line up this page's paragraphs".

**F3. Live blogs and infinite scroll**
- AC3.1 (F): live-blog fixture posts are treated as blocks. Appending a post via script gets it matched within 1 s.
- AC3.2 (E): when infinite scroll swaps the URL and appends the next article, that article is processed as its own article (its own pill counts).

**F4. Read tracking**
- AC4.1 (U): the dwell rule from F4 (thresholds, visibility, focus) holds with mocked IntersectionObserver and visibility state.
- AC4.2 (E): scrolling a fixture at reading pace stores the paragraphs. Scrolling straight to the bottom in < 1 s stores none.

**F5. Engine**
- AC5.1 (E): the first article page creates the offscreen document. After 5 min idle (fake timers in an integration test), it is closed.
- AC5.2 (E, measured): warm match of a 30-paragraph article ≤ 300 ms p50 on the CI runner (WASM). Cold first load ≤ 2.5 s. Both are reported in HANDOFF.md.
- AC5.3 (E): with the model file removed from the build, seen and changed tiers still work and the popup shows the degraded-engine notice.

**F6/F7. Tiers and drift guard**
- AC6.1 (U): the tier decision table (ADR §5) holds for synthetic pairs.
- AC6.2 (F): on the corpus, full-fade precision ≥ 0.98 and **0 full fades on the changed-meaning split**. Changed-meaning recall is published; the target is ≥ 0.85, and any value ships as measured.
- AC7.1 (U): the guard detects differences in numbers (incl. "twelve" → 12), dates, money with currency, entities, negation, modals and the outcome-verb lexicon, each with ≥ 3 minimal-pair tests. Identical tokens in a different order do not fire.

**F8. Fade levels**
- AC8.1 (U/E): seen paragraphs measure 4.6:1 ±0.2 and similar paragraphs 7:1 ±0.3 against the page background, for light, dark and tinted fixture themes. No faded paragraph falls below 4.5:1.
- AC8.2 (E): no element is removed or set to `display: none` unless fold mode is on.

**F9/F10. Provenance and drift UI**
- AC9.1 (E): hovering or focusing a tag opens the hover card within 150 ms. **Open original** opens the stored URL in a new tab. **Not old news** restores full ink and stores feedback, and the pair is never faded again.
- AC10.1 (E): a changed paragraph keeps full ink, the changed token has the drift highlight, and the chip text equals `{before} → {after} · {outlet} said {before}, {relative time}`.

**F11. Badge and pill**
- AC11.1 (E): the badge text equals the new-paragraph count (`99+` above 99). With no matches there is no badge, and the pill is hidden.
- AC11.2 (E): the pill text equals "Only {n} of {total} paragraphs are new to you". With n = 0, it reads "Nothing new here. All {total} paragraphs are old news."

**F12. Keyboard**
- AC12.1 (E): N folds every seen and similar paragraph to a hairline and back, with 0 ms animation. J/K move focus to the next or previous new or changed paragraph and scroll it into view. Neither fires while an input or contenteditable has focus.

**F13. Ingest**
- AC13.1 (E): with 3 article fixture tabs and 1 non-article tab open, onboarding lists exactly the 3 articles. Confirming stores their paragraphs with 0 network requests.

**F14/F15. "Previously on" and Drift**
- AC14.1 (F/E): after reading fixture day-1 articles, opening the day-2 article shows the card listing the prior articles and N changed figures.
- AC15.1 (E): the Drift tab lists one row per drift record for the current story, newest first.

**F16. Receipt**
- AC16.1 (U): receipt numbers derive only from `daily` records of the last 7 days. With no data, the receipt shows its empty state, never zeros dressed as results.
- AC16.2 (E): **Save image** downloads a PNG with 0 network requests.

**F17. Storage and privacy**
- AC17.1 (U): the TTL sweep deletes every record whose `expiresAt` is in the past, across all stores.
- AC17.2 (E): **Forget everything** leaves every store with zero records and resets the privacy meter.
- AC17.3 (E): a paused origin gets no processing. Unpausing takes effect on the next load.
- AC17.4 (E): **0 network requests** leave the machine across the full e2e suite.

**F18. Playground**
- AC18.1 (E): the extension playground reproduces the signature moment on its 3 fixture articles. Tier counts equal the corpus labels.

**F19. Corpus metrics**
- AC19.1 (CI): `pnpm eval` writes `metrics.json` (precision and recall per tier, changed-meaning recall, corpus size, model hash). CI fails if full-fade precision < 0.98 or any changed-meaning pair is fully faded.

**Design**
- AC-D1 (M/E): every surface follows DESIGN.md tokens. The bible §9 rubric average is ≥ 9.0 with no criterion < 8.

## 11. Fixture corpus (summary; details in the ADR §8)

| Part | Content | Licence |
|---|---|---|
| Story sets | Authored for this repo. Each story has a wire original, 2–3 rewrites by invented outlets (re-ordered, re-headlined, background re-pasted, paraphrased), and day-2 updates with labelled drift | CC0 |
| Changed-meaning split | ≥ 150 minimal pairs (fled → arrested, 12 → 14, "will" → "will not", denied → confirmed, Tuesday → Wednesday, €4.5m → €5.4m) | CC0 |
| Negatives | Wikinews articles on unrelated or same-topic-different-event stories | CC BY 2.5, attributed in `tests/fixtures/ATTRIBUTION.md` |
| Layout fixtures | Authored HTML templates for CMS patterns | CC0 |

## 12. Demo script (10 seconds, shot by shot)

Recorded on the extension playground (fixture story, invented outlets), at 1440×900. DevTools Network is docked right, filtered to "All", and "Preserve log" is on.

| t (s) | Shot | On screen |
|---|---|---|
| 0.0–1.5 | **Tab 1 read** | "Fenwick Wire" article, scrolled at reading pace. The toolbar icon is plain. Lower third: "Tab 1 of 3: read normally." |
| 1.5–2.5 | **Tab switch** | Ctrl+3 to the third tab, the "Morrow Daily" version. The page is in full ink for one beat (≈ 300 ms). |
| 2.5–2.9 | **The dissolve** | Top to bottom in ≈ 400 ms, 19 paragraphs drop to pencil grey, each with a "Fenwick Wire · 6 min ago" tag fading in at its right edge. 4 stay in full ink. The pill counts down 23 → 4. |
| 2.9–4.4 | **Drift pulse** | One sentence pulses amber twice. The chip "12 → 14 · Calder Courier said 12, 14 min ago" rises above "14". The camera crops in 1.4×. |
| 4.4–5.6 | **The pill** | Hold on "Only 4 of 23 paragraphs are new to you". Badge: `4`. |
| 5.6–6.8 | **Proof** | Pan to the DevTools Network panel: **0 requests**. The privacy meter shows "0 requests sent". |
| 6.8–8.4 | **Fold** | Press N. The 19 old paragraphs collapse to hairlines instantly, leaving the 4 new paragraphs and the amber one. Press J twice: focus jumps between them. |
| 8.4–10.0 | **End card** | Text only, set in the display face: "Old News. Fades what you've already read. Runs on your machine." Under it: the GitHub URL. |

The same timeline drives the deterministic capture for the README GIF and LinkedIn MP4 (DESIGN.md §Landing).

## 13. Risks (from picks.json, with mitigations)

| Risk | Mitigation |
|---|---|
| Narrow daily audience (desktop, multi-outlet readers) | Next-day "Previously on" card, long-form blog support, ingest at install, honest positioning |
| A false fade on a changed outcome would destroy trust | Guard-before-fade, the changed-meaning split in CI with 0 full fades allowed, the lighter similar tier, "Not old news" feedback |
| The verb/negation guard is heuristic | Lexicon plus minimal-pair tests; similar-tier fades stay at the 7:1 floor; recall published |
| Paraphrase recall is weaker than wire recall | Published separately; paraphrase matches only ever get the light fade |
| Chrome or Gemini ships a platform version | Open source, on-device, with provenance and a drift guard as differentiators |
| Package is ≈ 40–50 MB | Lazy-loaded; measured and stated in the README; CI size budget |
| DOM mapping across thousands of layouts | Strict do-nothing rule plus layout fixtures plus a real-site manual smoke list per release |

## 14. Web app (`/app`, Stage 3b)

**Why it exists:** most readers meet the product from a phone, where no extension can run. `/app` lets them try the same engine on pasted or dropped text. It is a static page in `site/`; there is no server.

**What it is:** a client-only PWA. It imports the real engine from `src/core/index.ts` through the `@engine` Vite alias (no copy of the matcher, tiers, fact guard or receipt logic). The only environment code is a thin adapter in `site/src/app/engine.ts`: which IndexedDB database to open (`old-news-web`), which `Embedder` to inject, and a clock. History is stored locally in IndexedDB. Nothing is uploaded and the app makes no request beyond its own static files.

**Embedder choice (stated, not hidden):** the bundled sample stories carry precomputed MiniLM vectors (the same model as the extension), so they show all three tiers without a download. Pasted text uses exact wording and the changed-fact guard only (degraded mode, labelled as such) until the reader opts in to download the 23 MB model from this site's own files, once, for offline use.

### Acceptance criteria

Each one is automated in `site/tests/e2e/site.spec.ts` (Playwright against the production build) unless the "How" column names another gate.

| # | Criterion | How it is tested |
|---|---|---|
| W1 | **Empty state:** with no history, `/app/` shows the heading "Paste two articles about the same story.", the line "Runs entirely in your browser. Nothing is uploaded.", a primary **Try a sample story** button (plus Day-2 update, Rail closure and Sleep blogs samples), a paste box and a file picker. | e2e `375: empty state` |
| W2 | **Sample, success state:** pressing **Try a sample story** reads the bundled bridge story (three articles: Fenwick Wire, Calder Courier, Morrow Daily) through the real engine. The pill reads "Only 4 of 23 paragraphs are new to you", the third article is tagged seen 19, changed 1, new 3, and its drift chip reads "12 → 14" with an amber highlight. **Day-2 update sample** (Port Alder fire) ends at "4 of 7" with the chips "Twelve → 14", "closed → reopened" and "Monday → Tuesday". | e2e `375: empty state`, e2e `each bundled sample` |
| W3 | **Paste, two articles:** pasting article A, then article B with one repeated paragraph and one changed number, fades the repeated paragraph and flags the number. | e2e `pasting two articles` |
| W4 | **Drop or choose files:** `.txt`, `.md` and `.html` files are accepted, each read in the order added. Unreadable or too-short input shows an error that says why and offers Retry or Dismiss; it is never swallowed. | e2e `too little text`, unit `parse.test.ts` |
| W5 | **Loading state:** while an article is analysed the page shows a live "…" status line, and a skeleton if it takes longer than the slow threshold. | e2e `375: empty state` (busy line), manual for the skeleton |
| W6 | **Contrast floor:** every faded paragraph stays at or above 4.5:1 against its sheet, measured from computed styles. | e2e `375: empty state` |
| W7 | **Offline:** after one online load, the app reloads and works with the network off (sample story included). History survives a reload. | e2e `works offline` |
| W8 | **Forget everything:** asks twice, then empties the IndexedDB database. | e2e `Forget everything` |
| W9 | **No network:** across load, a sample read and a paste, every request is to the page's own origin. The page's CSP has `connect-src 'self'`. There is no analytics, font or CDN host. | e2e `no foreign requests` (all web-app tests) |
| W10 | **Installable:** `/app/manifest.webmanifest` has `start_url` and `scope` `/app/`, 192 and 512 px icons plus a maskable one, and a service worker at `/app/sw.js` precaches the app shell. | `pnpm build` prints the precache count; e2e `works offline` proves the worker serves the shell; the install prompt itself is a manual check in Chrome |
| W11 | **Reduced motion:** with `prefers-reduced-motion: reduce`, the result is shown in its final state with no sequence. | e2e `reduced motion` |
| W12 | **Responsive:** laid out mobile-first at 375, then 768 and 1440. No horizontal scroll at 375. Every control has a hit area of at least 44 px (inline links in a sentence are exempt). Light and dark both work. | e2e `375: empty state` (no overflow), e2e `375 touch` (hit areas in the empty, result and settings views) |
| W13 | **Tokens:** only DESIGN.md tokens; no colour literal outside `site/src/styles/tokens.css`. | `pnpm check-tokens` in `site/` |
| W14 | **Engine reuse:** the app has no matching, fading or drift logic of its own. It imports `@engine`. | code review; the aliases are in `site/vite.config.ts` |
| W15 | **Budget:** first-route JS <= 170 KB gz (`pnpm build` prints it); LCP <= 2.0 s with CLS 0 on the 375 px profile with 4x CPU slowdown and Fast 4G, cold cache. Measured values are recorded in `site/HANDOFF.md`. | Lighthouse and a performance trace via chrome-devtools |
| W16 | **A drift chip never covers text:** at 375 and 1440, on the landing hero, the landing drift beat and both web-app samples with changed facts, no visible chip box intersects any line box of paragraph text. Chips sit in flow above their paragraph and start at the changed token's x when they fit on one line. | e2e `marks.spec.ts` (phone and desktop projects) |
| W17 | **Deterministic countdown:** with `?capture`, `window.__frame(0)` shows the hero pill at "23 of 23" with every faded paragraph still at full ink; the number never rises from frame to frame, ends at 4, and the pill's width does not change while it counts. The schedule comes from the extension's own `src/overlay/geometry.ts` (`@overlay` alias). | e2e `marks.spec.ts`, unit `schedule.test.ts` |
| W18 | **Honest numbers and labels:** every number on the landing page comes from `site/src/generated/measured.json`, which must equal the repo's `metrics.json` and `scripts/size-baseline.json`; the hero button reads "Install in Chrome from source" until `VITE_STORE_URL` is set, and only then "Add to Chrome". Product screenshots come from `docs/screenshots/` unchanged except for cropping. | unit `freshness.test.ts`, `landing.test.ts` |
