# Test matrix

Every acceptance criterion in `SPEC.md` mapped to the tests that check it. Layers: **U** unit
(Vitest, `tests/unit`), **F** fixture (Vitest on the authored corpus and layouts, `tests/fixture`),
**E** end-to-end (Playwright driving the built extension in Chromium, `tests/e2e`), **S** site and
web-app e2e (`site/tests/e2e`).

Run: `pnpm test` (U + F), `pnpm test:e2e` (E, real model, builds `.output-e2e` and `site/dist`),
`pnpm eval` (AC19.1 gates), `pnpm --dir site test` and `pnpm --dir site test:e2e` (S).

| AC | What | Tests |
|---|---|---|
| 1.1 | Article-like pages classified; non-articles untouched, no badge | F `fixture/layouts.test.ts`; U `extract/analyse-gates.test.ts`; E `coverage.spec.ts` (every layout fixture, MutationObserver diff, badge) |
| 1.2 | `lang="fr"` / non-English stopwords: page untouched | U `extract/english-signals.test.ts`, `extract/analyse-gates.test.ts`; F `layouts.test.ts`; E `coverage.spec.ts` |
| 1.3 | Not allowed in incognito | E `extension.spec.ts` (manifest locks) |
| 2.1 | Mapped/total >= 0.8, no double mapping; rejections make zero DOM mutations | F `layouts.test.ts`; E `coverage.spec.ts` (paywall, canvas, ad-split: 0 mutations) |
| 2.2 | Rejected page shows "couldn't line up this page's paragraphs" | F `layouts.test.ts` (status is `unmapped`); U `core/page.test.ts`, `extract/analyse-gates.test.ts`; E `coverage.spec.ts`, `overlay.spec.ts` (popup) |
| 3.1 | Live-blog posts are blocks; appended post matched within 1 s | F `layouts.test.ts`; E `overlay.spec.ts` |
| 3.2 | Infinite scroll: the appended article counts on its own | E `overlay.spec.ts` |
| 4.1 | Dwell rule with mocked IntersectionObserver and visibility | U `extract/dwell.test.ts` |
| 4.2 | Reading pace stores; scrolling to the bottom in < 1 s stores none | U `extract/dwell.test.ts`; E `extension.spec.ts` |
| 5.1 | Offscreen document created on first article, closed after idle | U `embed/embed.test.ts` (5 min, fake timers); E `coverage.spec.ts` (real `chrome.alarms` handler, delay shortened) |
| 5.2 | Warm match <= 300 ms p50, cold <= 2.5 s | E `extension.spec.ts` (timings reported in HANDOFF) |
| 5.3 | Model removed from the build: exact and changed tiers still work, notice shown | E `coverage.spec.ts` (separate profile on a copy without `models/`) |
| 6.1 | Tier decision table | U `engine/tiers.test.ts` |
| 6.2 | Full-fade precision >= 0.98, 0 full fades on changed-meaning | F `fixture/stories.test.ts`, `fixture/changed-meaning.test.ts`; `pnpm eval` (real model) |
| 7.1 | Guard: numbers, dates, money, entities, negation, modals, outcome verbs | U `engine/guard.test.ts`; F `fixture/changed-meaning.test.ts` |
| 8.1 | Seen 4.6, similar 7.0, none below 4.5 on light, dark and tinted pages | U `paint/contrastFloor.test.ts`, `overlay/overlay.test.ts`; E `coverage.spec.ts` (measured live on three themes) |
| 8.2 | Nothing removed or `display:none` unless fold is on | U `overlay/overlay.test.ts`; E `overlay.spec.ts`, `coverage.spec.ts` |
| 9.1 | Tag/card within 150 ms; Open original; Not old news | E `overlay.spec.ts` |
| 10.1 | Changed paragraph: full ink, highlight, chip text | U `engine/present.test.ts`; E `overlay.spec.ts` |
| 11.1 | Badge = new count (`99+`); none with no matches, pill hidden | U `core/page.test.ts`, `engine/present.test.ts`; E `overlay.spec.ts` |
| 11.2 | Pill sentences | U `engine/present.test.ts`; E `overlay.spec.ts` |
| 12.1 | N folds with 0 ms, J/K move; ignored in inputs and contenteditable | U `overlay/overlay.test.ts`; E `overlay.spec.ts`, `coverage.spec.ts` (input and contenteditable guard) |
| 13.1 | Onboarding lists exactly the article tabs; 0 network requests | E `overlay.spec.ts` |
| 14.1 | Day-2 card lists prior articles and changed figures | E `overlay.spec.ts` |
| 15.1 | Drift tab: one row per record, newest first | E `overlay.spec.ts` |
| 16.1 | Receipt derives from the last 7 `daily` records; empty state | U `engine/story-receipt.test.ts` |
| 16.2 | Save image downloads a PNG, 0 requests | E `overlay.spec.ts` |
| 17.1 | TTL sweep across all stores | U `store/store.test.ts` |
| 17.2 | Forget everything empties every store, resets the meter | U `store/store.test.ts`; E `overlay.spec.ts` |
| 17.3 | Paused origin gets no processing; unpausing applies on next load | U `core/page.test.ts`, `core/settings.test.ts`; E `overlay.spec.ts` |
| 17.4 | 0 external requests across the whole e2e suite | E `fixtures.ts`: the `context` fixture fails any test that made a non-local request; plus per-test assertions |
| 18.1 | Playground reproduces the signature moment; counts equal the labels | E `overlay.spec.ts` |
| 19.1 | `pnpm eval` writes `metrics.json`; fails on a gate | `scripts/eval-corpus.ts` (gates), run in the Stage 4 check list |

## Beyond the acceptance criteria (Stage 4)

| Area | Tests |
|---|---|
| axe (WCAG 2.0/2.1 A and AA) on every extension surface: popup states, app screens, onboarding, palette, playground, overlay, light and dark | E `a11y.spec.ts` |
| axe on every site surface: landing (light, dark, scrolled, reduced motion), web app (empty, errors, composer, result, hover card, stories, settings), at 375x812 touch and 1440x900 | S `a11y.spec.ts` |
| Site smoke: `/` and `/app/` load with no console or page errors, one h1, title, description, lang, no overflow, images load, internal links and anchors resolve, external links safe, no third-party scripts | S `smoke.spec.ts` |
| Web app flows at phone (375x812, touch) and desktop: samples, paste, upload (`.txt`, `.md`, `.html`, empty, oversize), offline after the first load, a whole session makes only same-origin GETs, no WebSockets, the 23 MB model is not fetched without opt-in | S `webapp.spec.ts` |
| PWA: manifest complete, icons load at their declared sizes, maskable icon, iOS metadata, service worker scope and activation, precache list matches the build, offline navigation to the start URL and deep links | S `pwa.spec.ts` |
| Parity: the web app and the extension (real model) give the same tier, fingerprint, source outlet and changed figures for every paragraph of every bundled sample story | E `parity.spec.ts` |
| Equal-score sources are ordered deterministically (the copy read first), independent of fill order and of batch noise in the vectors | U `engine/match.test.ts` |

## Not covered, and why

- The onboarding "Allow on websites" permission prompt needs a real user gesture (headless Chromium cannot grant it). The e2e build adds the host permission instead.
- Firefox: the build compiles, nothing runs in Firefox.
- The PWA install prompt cannot be driven headless; each installability criterion is asserted instead.
- The optional 23 MB model path in the web app (`enableModel`) has no browser test.
- No screen-reader run; axe finds the rule-based issues only.
