# ADR-0002 (PROPOSAL): drop the WebGPU backend, ship WASM only

**Status:** Proposed. **Not applied.** The product brief names "WebGPU, with WASM fallback", so changing it
needs maintainer sign-off (ADR-0001 §4.3). Nothing in the code has been removed.

## Context

ADR-0001 §4.3 says: run a 32-text warm-up on WebGPU and WASM, use the faster one, and if WebGPU
gains less than 20% over WASM, propose dropping it.

Stage 2 implemented that benchmark (`src/adapters/extensionEngine.ts`, `src/embed/backend.ts`) and
ran it in the e2e suite (`tests/e2e/extension.spec.ts`, output in `test-results/engine-perf.json`).

## Measurements

Machine: AMD Ryzen 9 8940HX (32 logical cores), Windows 11, Playwright Chromium 1248 in **headless**
mode, int8 model, 32 texts, second (warm) pass timed. Each run is the first-use benchmark of a fresh
browser profile in the e2e suite.

| Run | WASM threads | WebGPU | WASM | WebGPU gain |
|---|---|---|---|---|
| A | 1 | 755 ms | 352 ms | -114% |
| B | 4 | 407 ms | 86 ms | -376% |
| C | 4 | 678 ms | 165 ms | -310% |

WebGPU initialised successfully (`ok: true`) but was slower than WASM every time.

## Caveats (why this is a proposal, not a decision)

- The runs were **headless**. Headless Chromium may expose a software WebGPU adapter (SwiftShader),
  which would explain why it is slower. A headed run on a real GPU may differ. This has not been
  measured.
- Only the int8 model is bundled. MiniLM-L6 is small, and int8 kernels on WebGPU may simply not pay
  off at this size, which is what the ADR predicted.
- One machine, three runs, high variance between runs (the machine was not idle).

## Proposal

If a headed run on at least one discrete or integrated GPU also shows a gain below 20%:

1. Remove the JSPI ORT build (`ort-wasm-simd-threaded.jspi.{mjs,wasm}`, 16.9 MB unpacked).
2. Remove `webgpu` from `Backend` and the benchmark; keep `chooseBackend` for future use.
3. State "WASM, multi-threaded" in the README. The unpacked package falls from 56.2 MB to about 39.3 MB.

## Consequences if accepted

- Easier: smaller package, one code path, no first-run benchmark (which adds about 1 s to the very
  first article, once).
- Harder: no headroom if a future, larger model needs a GPU.

## Until a decision

The extension keeps both backends and picks per machine. WebGPU is only attempted where WebAssembly
JSPI exists (Chrome 137 and later); everywhere else it is WASM.
