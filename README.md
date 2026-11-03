# Old News

**A browser extension that fades the paragraphs you have already read, on any news site, and
lights up the one number that changed.** It runs on your machine and sends nothing anywhere.

[![CI](https://github.com/NINJA981/old-news/actions/workflows/ci.yml/badge.svg)](https://github.com/NINJA981/old-news/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![The third article on a story: 19 paragraphs fade to grey with a tag naming the outlet where they were read, four stay in full ink, and an amber chip above "14" says "12 → 14 · Calder Courier said 12". The pill counts down to "Only 4 of 23 paragraphs are new to you".](docs/launch/dissolve.gif)

<sub>The extension's own playground running a fixture story. Fenwick Wire, Calder Courier and
Morrow Daily are invented outlets.</sub>

## What it does

You read about a story on one site, then again on a second and a third. By the third, most of
the article is things you already know. Old News remembers what you read, paragraph by paragraph,
across sites. On the next article about the same story:

- **Paragraphs you already read fade** (never hidden) and carry a tag saying where you read them:
  "Fenwick Wire · 30 min ago". Hover the tag for the snippet and a link back.
- **New paragraphs stay in full ink.** The pill says how many: "Only 4 of 23 paragraphs are new to
  you". Press N to fold the old ones, J and K to jump between new ones.
- **A paragraph you read with one fact changed is never faded.** The changed token glows amber and a
  chip says what it was: "12 → 14 · Calder Courier said 12, 16 min ago". Numbers, dates, amounts,
  names, negations ("not"), modals ("may") and outcome verbs ("arrested", "cancelled") all count.

The app page collects every changed figure per story (Drift), shows what you remembered (Memory)
and makes a weekly reading Receipt image.

## Install

Old News is **not in the Chrome Web Store or on Firefox Add-ons yet**. Install it from a release
zip or from source.

### Chrome, Edge and other Chromium browsers (tested in Chromium)

1. Download `old-news-0.1.0-chrome.zip` from the
   [Releases page](https://github.com/NINJA981/old-news/releases) and unzip it, or build it from
   source (below) and use `.output/chrome-mv3`.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder.
4. The onboarding page opens. Click **Allow on article pages**. Old News reads no page until you do, and
   you can offer it the article tabs you already have open.

### Firefox (built, not yet tested)

`old-news-0.1.0-firefox.zip` is built by the same commands, but nobody has run it in Firefox yet.
If you try it: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and
pick the zip. Temporary add-ons are removed when Firefox restarts. Reports are
very welcome.

### Try it without installing

`site/` holds a landing page and a phone-friendly web app (`/app/`) that run the same engine on
two pasted articles, in the browser, offline after the first load. It is not deployed yet; see
`site/HANDOFF.md` to build and serve it locally.

## How it works

1. **Is this an article?** Old News looks for article markup and enough English prose. Search
   pages, webmail, shops, feeds and non-English pages are left alone.
2. **Find the paragraphs.** Readability runs on a copy of the page, and each paragraph it finds is
   mapped back to the live page. If fewer than 80% map cleanly, Old News does nothing and the popup
   says it "couldn't line up this page's paragraphs".
3. **Fingerprint each paragraph** two ways: word shingles with MinHash (catches wire copy and
   re-pastes), and a 384-number sentence vector from all-MiniLM-L6-v2, int8, run on-device with
   ONNX Runtime Web (catches close paraphrase).
4. **Compare with memory** in IndexedDB. A strong shingle match is "seen", a vector-only match is
   "similar", and a match whose facts differ is "changed" and stays lit.
5. **Remember what you actually read.** A paragraph is stored only after it has been on screen long
   enough to read, so scrolling past does not count.

The model is loaded in an offscreen document on the first article and released after 5 minutes
idle. Details: `docs/adr/0001-architecture.md`.

## Privacy, and how it is checked

- **No server, no account, no telemetry, no update check.** The model and the runtime ship inside
  the package.
- **Extension pages carry the Content Security Policy `connect-src 'self'`**, so even a bug cannot
  reach the network from them. The only `fetch` in the code (`src/net/localAsset.ts`) refuses any
  URL outside the package, and a lint rule blocks other network calls.
- **The e2e suite fails any test that makes a request leaving the machine**
  (`tests/e2e/fixtures.ts`), across every e2e test.
- **What is stored**, in IndexedDB on your machine for 30 days: shingle signatures, int8 vectors,
  a 140-character snippet, the URL, title and outlet name, and when you read it. Full paragraph
  text is never stored. Settings live in `chrome.storage.local`.
- **Your controls:** pause per site or everywhere, **Not old news** on any paragraph, and
  **Forget everything** in Settings, which empties every store.
- Old News cannot run in incognito windows (`incognito: "not_allowed"`).

### Permissions

| Permission | Why |
|---|---|
| Site access (optional, asked on the onboarding page) | To read article pages and paint the overlay. Not granted at install. |
| `scripting` | Registers the content script once you allow site access. |
| `tabs` | Lists your open article tabs for the onboarding offer, and keeps the badge per tab. |
| `storage`, `unlimitedStorage` | Settings, and the paragraph memory in IndexedDB. |
| `alarms` | The 30-day expiry sweep and unloading the model when idle. |
| `offscreen` (Chrome) | Runs the model in an offscreen document. |

## Measured

All on one laptop (Ryzen 9 8940HX) in headless Chromium, not on a CI runner.

| What | Result | Command |
|---|---|---|
| Package, Chrome | 56.7 MB unpacked, 24.8 MB zipped (ONNX Runtime 31.1 MB, model 23.0 MB) | `pnpm size`, 2026-11-04 |
| Warm match, 30-paragraph article, p50 | 127 ms and 185 ms in two runs (budget 300 ms) | `pnpm test:e2e` |
| Cold first article (creates the offscreen document) | 2.1 s and 3.9 s in two runs (budget 2.5 s, missed once) | `pnpm test:e2e` |

**Accuracy, on a small authored corpus** (`pnpm eval`, `metrics.json`, 2026-10-27): 4 stories,
118 labelled paragraphs, 166 changed-meaning pairs.

| Metric | Value |
|---|---|
| Full-fade precision (nothing faded that should stay lit) | 1.00 |
| Changed-meaning pairs fully faded | 0 of 141 |
| Changed-meaning recall (kept lit **and** flagged with a chip) | 0.82 (115 of 141), target 0.85 |
| Wire and re-paste recall | 0.98 (50 of 51) |

These numbers show the engine behaves as designed on fixtures written for it. They are **not** a
measurement of accuracy on real news sites, which has not been done yet.

## Limitations

- **Not measured on real news sites.** Matching and paragraph mapping are tested on 15 authored
  layouts that imitate common CMS markup. Unusual layouts may be skipped, and drift chips may sit
  awkwardly next to floats or in-article sidebars.
- **Changed-meaning recall is 0.82**, below the 0.85 target. A missed change stays lit (it is never
  faded) but gets no chip. Paraphrase recall is based on only 2 examples. The thresholds are
  untuned starting values.
- **The package is large**: 56.7 MB unpacked, 24.8 MB zipped, almost all of it ONNX Runtime and the
  model.
- **Cold start** missed its 2.5 s budget in one of two runs.
- **Firefox has never been run.** The build compiles (with a warning about `import.meta`), and the
  engine and overlay have not been executed there.
- **English only, desktop only.** Mobile Chrome has no extensions; the web app is the phone path.
- **Drift is stored only once you read the changed paragraph.** Until then the card and popup list
  it, but the app's Drift screen does not.
- **Ad copy inside a paragraph** can produce a chip about an ad's numbers when the ad slot is not
  recognised.
- **Not covered by automated tests:** the real site-access prompt (it needs a user gesture), the web
  app's install prompt and optional model download, and a screen-reader pass.

## Develop

Requires Node 22 or later and pnpm 10.

```bash
pnpm install
pnpm fetch-model        # once; see "The model" below
pnpm build              # .output/chrome-mv3
pnpm build:firefox      # .output/firefox-mv3
pnpm zip                # .output/old-news-0.1.0-chrome.zip
pnpm zip:firefox        # .output/old-news-0.1.0-firefox.zip and -sources.zip
pnpm dev                # Chrome with hot reload
pnpm test               # unit and fixture tests (Vitest)
pnpm test:e2e           # builds an e2e variant, drives Chromium with the real model
pnpm lint && pnpm typecheck && pnpm check-tokens
pnpm eval               # corpus metrics with the real model, writes metrics.json
pnpm size               # package size report
pnpm screenshots        # docs/screenshots, every surface in light and dark
pnpm launch-assets      # docs/launch: store screenshots, social preview, README GIF (needs ffmpeg)
```

### The model

The model file (all-MiniLM-L6-v2, int8 ONNX, 23 MB, Apache-2.0) is **not committed**. `pnpm
fetch-model` downloads four files from Hugging Face at a pinned revision into `public/models/`
(gitignored) and checks each against the SHA-256 in `scripts/model-manifest.json`. It is the only
command in the repository that uses the network, and the build refuses to run without the model.

### Release zips

`pnpm zip` and `pnpm zip:firefox` build the store packages. Each zip contains the model and the
runtime, plus `LICENSE.txt`, `THIRD_PARTY.md` and a `licenses/` folder with the licence text of every
redistributed component (`THIRD_PARTY.md` lists them). The Firefox command also writes a sources
zip, which Firefox Add-ons asks for when the code is bundled. CI uploads both zips as artifacts.

### Layout

The engine is plain TypeScript in `src/engine` and `src/extract`, exported from `src/core/index.ts`
with no browser-extension APIs, so the web app in `site/` imports the same code. The overlay
(`src/overlay`) is vanilla TypeScript in a closed shadow root; the popup, app page and onboarding
are React. Product spec: `SPEC.md`. Design system: `DESIGN.md`. Test map: `docs/TEST-MATRIX.md`.

## Contributing

Bug reports, fixture layouts and changed-meaning examples are the most useful contributions. Read
[CONTRIBUTING.md](CONTRIBUTING.md) first, and report security or privacy problems privately as
described in [SECURITY.md](SECURITY.md). Everyone taking part follows the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

MIT, see [LICENSE](LICENSE). Bundled components and their licences are listed in
[THIRD_PARTY.md](THIRD_PARTY.md).
