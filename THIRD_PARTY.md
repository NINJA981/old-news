# Third-party software and assets

Old News is MIT licensed (see `LICENSE`). The extension package redistributes the components below.
Nothing is fetched at runtime.

| Component | Version | Licence | Where it is used |
|---|---|---|---|
| all-MiniLM-L6-v2 (ONNX, int8 `model_quantized.onnx`), as published by Xenova | HF revision `751bff37182d3f1213fa05d7196b954e230abad9` | Apache-2.0 | Sentence embeddings (similar tier). Downloaded once at developer build time by `scripts/fetch-model.ts` and verified against SHA-256 `afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1`. Original model: sentence-transformers/all-MiniLM-L6-v2. |
| `@huggingface/transformers` | 4.3.1 | Apache-2.0 | Runs the model. |
| `onnxruntime-web` (via transformers.js) | 1.31.0-dev.20260914-8d85527a0 | MIT | WASM and JSPI (WebGPU) runtimes, copied to `ort/` in the package. |
| `@mozilla/readability` | 0.6.0 | Apache-2.0 | Article extraction on a document clone. |
| Newsreader Variable (`@fontsource-variable/newsreader`) | 5.3.0 | SIL OFL 1.1 | Reading face, latin subset. |
| Hanken Grotesk Variable (`@fontsource-variable/hanken-grotesk`) | 5.3.0 | SIL OFL 1.1 | UI face, latin subset. |
| `idb` | 8.0.4 | ISC | IndexedDB wrapper. |
| `valibot` | 1.5.0 | MIT | Message and settings schemas. |
| `react`, `react-dom` | 19.3.1 | MIT | Extension pages only (never the content script). |
| `@radix-ui/react-switch`, `react-tabs`, `react-tooltip` | 1.4.1, 1.2.1, 1.4.1 | MIT | Switch, tabs and tooltip primitives on extension pages. |
| `cmdk` | 1.1.1 | MIT | Command palette in the app page. |
| `sonner` | 2.0.8 | MIT | Toasts on extension pages. |
| `motion` | 14.7.1 | MIT | Extension-page transitions (reduced motion respected). |
| `lucide-react` | 1.62.0 | ISC | Icons on extension pages. |
| `tailwindcss` | 4.3.3 | MIT | Build-time CSS only; no Tailwind code ships. |

## Licence texts in the package

`pnpm build` (through `scripts/copy-assets.ts`) puts these files at the root of the built extension,
so the Chrome and Firefox zips carry them:

- `LICENSE.txt`: Old News (MIT).
- `THIRD_PARTY.md`: this file.
- `licenses/`: the licence file of each component above, as published in its npm package
  (`transformers.txt` is the full Apache-2.0 text, which also covers the model and Readability, whose
  own file is the short Apache notice; `newsreader-ofl.txt` and
  `hanken-grotesk-ofl.txt` are the SIL OFL 1.1 texts; `onnxruntime-web.txt` is written by the script
  because that npm package ships no licence file).

The full dependency tree and exact versions are pinned in `pnpm-lock.yaml`. Development tools
(Vite, WXT, Vitest, Playwright, ESLint, Prettier, TypeScript, axe-core) do not ship in the package.
Test fixtures are authored for this repository; see `tests/fixtures/PROVENANCE.md`.
