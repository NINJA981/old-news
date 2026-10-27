# Old News

A browser extension that remembers every paragraph you have read, across sites. On the next article
about the same story it fades what you already know, names where you read it, and keeps lit what is
new, including the one number that changed. It runs on your machine and sends nothing anywhere.

**Status: in development (v0.1).** The engine, storage, page pipeline and extension shell work and
are tested. The in-page overlay (fades, tags, drift chip, pill), the real popup/app screens and the
onboarding ingest list are still placeholders. See `HANDOFF.md` for exactly what works.

## Privacy

- No server, no telemetry, no accounts. The model and the runtime are bundled in the package.
- Extension pages carry the policy `connect-src 'self'`, so even a bug cannot reach the network.
- The e2e suite records every request the browser makes while Old News works and asserts that none
  leaves the machine.
- Memory (vectors, hashes, 140-character snippets, URLs, titles) stays in IndexedDB for 30 days.
  Full paragraph text is never stored. The extension is not allowed in incognito windows.
- The only network access in this repository is `pnpm fetch-model`, which a developer runs once to
  download the model at a pinned revision and verify its SHA-256.

## Package size

Measured on 2026-10-27 (`pnpm size`), Chrome build:

| Part | Size |
|---|---|
| Unpacked | 56.2 MB |
| Packed (zip) | 24.6 MB |
| ONNX Runtime wasm (base + JSPI/WebGPU) | 31.1 MB |
| Model (int8 MiniLM-L6) | 23.0 MB |
| Everything else (JS, fonts, tokenizer) | 2.1 MB |

The model loads lazily on the first article and is released after 5 minutes idle.

## Measured accuracy (small corpus, read the caveats)

`pnpm eval` runs the real model over an authored corpus and writes `metrics.json`. Latest run:
4 stories, 118 labelled paragraphs, 166 changed-meaning pairs, 0 negatives.

| Metric | Value |
|---|---|
| Seen (full fade) precision | 1.00 |
| Changed-meaning pairs fully faded | 0 of 141 |
| Changed-meaning recall (kept lit **and** flagged) | 0.82 (115 of 141) |
| Wire/re-paste recall | 0.98 (50 of 51) |
| Paraphrase recall | 0.50 (1 of 2, not meaningful) |

The corpus is far smaller than the planned 12 stories and 30 negatives, and the thresholds are the
architect's untuned starting values. These numbers show the engine behaves as designed on the
fixtures; they are not a claim about real-world accuracy.

## Develop

Requires Node 22 or later and pnpm.

```bash
pnpm install
pnpm fetch-model        # one-time model download, verified against scripts/model-manifest.json
pnpm dev                # Chrome, with hot reload
pnpm dev:firefox
pnpm build              # .output/chrome-mv3
pnpm build:firefox      # .output/firefox-mv3
pnpm test               # unit and fixture tests
pnpm test:e2e           # builds an e2e variant and drives Chromium with the real model
pnpm lint && pnpm typecheck
pnpm eval               # corpus metrics with the real model
pnpm check-tokens       # DESIGN.md tokens, contrast pairs, no off-token colours
pnpm size               # package size report
```

Architecture: `docs/adr/0001-architecture.md`. Product spec: `SPEC.md`. Design system: `DESIGN.md`.
The engine is exported from one module, `src/core/index.ts`, which the extension and the planned web
app both import; it contains no `chrome.*` or `browser.*` calls.

## Licence

MIT. Third-party components are listed in `THIRD_PARTY.md`.
