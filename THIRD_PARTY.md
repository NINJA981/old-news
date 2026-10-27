# Third-party software and assets

Old News is MIT licensed (see `LICENSE`). It bundles the following. Nothing is fetched at runtime.

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
| `tailwindcss` | 4.3.3 | MIT | Build-time CSS. |

The full dependency tree and exact versions are pinned in `pnpm-lock.yaml`. Test fixtures are
authored for this repository; see `tests/fixtures/PROVENANCE.md`.
