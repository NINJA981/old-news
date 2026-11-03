# Contributing to Old News

Thanks for helping. Old News is a small, local-first browser extension, and the bar for a change is
simple: it keeps the promise that nothing leaves the reader's machine, and every claim it makes is
measured.

## Ground rules

1. **No network at runtime.** The extension may not make a request to anything but its own package.
   `src/net/localAsset.ts` is the only `fetch`, ESLint blocks the rest, the extension pages carry
   `connect-src 'self'`, and the e2e suite fails any test that makes a non-local request. A pull
   request that adds telemetry, a CDN, a remote model or an update check will not be merged.
2. **Never fade a changed fact.** The changed-meaning split of the corpus must have zero full fades
   (`pnpm eval` fails otherwise). If you tune `src/engine/thresholds.ts`, include the new
   `metrics.json`.
3. **Fictional outlets only.** Fixtures, screenshots and docs use invented outlets (Fenwick Wire,
   Calder Courier, Morrow Daily) and invented places. Do not commit saved pages from real sites.
4. **Numbers are measured.** If you quote a size, a latency or an accuracy figure in a doc, say which
   command produced it.

## Set up

Requires Node 22 or later and pnpm 10 (`corepack enable` gives you the pinned version).

```bash
pnpm install
pnpm fetch-model     # once: the 23 MB model from a pinned Hugging Face revision, SHA-256 checked
pnpm build           # .output/chrome-mv3
```

Load `.output/chrome-mv3` unpacked (see the README), then click **Allow on websites** on the
onboarding page that opens.

`pnpm dev` gives you hot reload in a fresh Chrome profile. `site/` (landing page and web app) is a
separate package with its own `pnpm install`; see `site/HANDOFF.md`.

## Before you open a pull request

```bash
pnpm lint && pnpm typecheck && pnpm check-tokens
pnpm test            # unit and fixture tests (Vitest)
pnpm test:e2e        # builds an e2e variant and drives Chromium with the real model
pnpm eval            # only if you touched src/engine, src/extract or the corpus
```

CI runs the same commands (`.github/workflows/ci.yml`).

## Where things live

| Path | What |
|---|---|
| `src/engine/` | Pure matching: shingles, MinHash, LSH, the fact guard, tiers. No browser APIs. |
| `src/extract/` | Article detection, Readability on a clone, mapping paragraphs back to the live DOM. |
| `src/overlay/` | The in-page overlay (vanilla TypeScript, closed shadow root). |
| `src/ui/`, `entrypoints/` | Popup, app page, onboarding (React), background, offscreen engine host. |
| `src/core/index.ts` | The one module the web app imports. It must stay free of `chrome.*`. |
| `tests/fixtures/` | Authored layouts and stories. Read `PROVENANCE.md` before adding one. |
| `DESIGN.md` | Tokens and component rules. `pnpm check-tokens` enforces them. |
| `docs/adr/` | Architecture decisions. Add one for any change to the data flow. |

## Good first contributions

- A layout fixture for a CMS pattern we do not cover yet (with a test in `tests/fixture/layouts.test.ts`).
- Changed-meaning minimal pairs in `tests/fixtures/corpus/changed-meaning.jsonl`.
- Running the Firefox build and reporting what breaks (it is built in CI but has not been run).
- Reports of pages where paragraphs failed to line up, with a fictionalised copy of the markup.

## Commits and reviews

Small commits with a plain subject line ("overlay: keep chips off the pill"). One logical change
per pull request. Fill in the pull request template; a reviewer will run the commands above.

By contributing you agree that your work is released under the MIT licence in `LICENSE`, and you
agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
