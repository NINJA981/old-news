# HANDOFF: Old News

**Last stage:** Stage 1, Architect (2026-10-20)
**Next stage:** Stage 2, Scaffold + core

## What's done

Documents only. **No code exists yet, and nothing builds or runs.**

| File | What it is |
|---|---|
| `SPEC.md` | Problem, users, daily trigger, features F1–F19, the weakness fix (§5: utility and feasibility), non-goals, data model, privacy model and network policy, platform matrix, testable acceptance criteria (AC1.1–AC19.1, AC-D1), fixture corpus summary, 10-second demo script, risks |
| `docs/adr/0001-architecture.md` | Stack pinned to exact versions (checked with `npm view` on 2026-10-20), module layout, runtime architecture, tier decision table, contrast-floor solver, message protocol, testing pyramid and fixture strategy, Stage 2 action items |
| `DESIGN.md` | Google Stitch format. D2 OXIDE + T4 (Newsreader + Hanken Grotesk), claude radius grammar 4/8/12/16. OKLCH tokens for light and dark with measured contrast and brand ΔE. Component specs for the overlay, popup, app, onboarding and landing in every state. The signature moment frame by frame. A CSS-only landing immersive plan. Three "we never" rules. Appendix B ticked. `@google/design.md@0.4.0 lint` result: **0 errors, 0 warnings**. |
| `docs/LANDING.md` | The 5-beat narrative, the "third tab" hero concept, draft copy (measured values left as `{measured: …}` placeholders), README beats |
| `PRODUCT.md` | Product record for the impeccable skill, inferred from picks.json and the council record (labelled as inferred, since no user interview was possible) |
| `.gitignore` | |

## How to run

Nothing to run yet. Stage 2 scaffolds WXT; see the ADR action items. The planned scripts are `dev`, `build`, `test`, `test:e2e`, `lint`, `typecheck`, `eval` and `fetch-model`.

## Decisions Stage 2 must respect

- **Pinned versions:** ADR §1.
  - TypeScript is **6.0.3**, not 7.0.2, because `typescript-eslint` 8.72.0 needs < 6.1.0.
  - `onnxruntime-web` arrives through `@huggingface/transformers` 4.3.1 as `1.31.0-dev.20260914-8d85527a0`. Lock it.
- **The content script and overlay are vanilla TS.** No React, Radix, Motion or Tailwind under `entrypoints/content/**`. The budget is ≤ 45 KB gz in total.
- **`src/engine` is pure.** No `chrome.*`, DOM or transformers.js imports.
- **Zero network:**
  - CSP `connect-src 'self'`;
  - transformers.js `allowRemoteModels = false` with local `wasmPaths`;
  - `fetch` only in `src/net/localAsset.ts`;
  - overlay fonts sent as base64 over messaging.
- **Do nothing if mapping fails.** SPEC §5.2 states the exact thresholds.
- **Fades use the contrast floor** (4.6:1 seen, 7:1 similar), not fixed opacity.
- **Fixture text is authored and uses invented outlets.** No copyrighted news text is committed. Wikinews (CC BY 2.5) is allowed with attribution.

## Known issues and open questions

1. **Package size is not yet measured.** From the npm pack of the pinned ORT build:

   | Runtime build | Size |
   |---|---|
   | WASM-only | 13.6 MB |
   | `jspi` (WebGPU-capable) | 16.0 MB |
   | `asyncify` (WebGPU-capable) | 25.6 MB |
   | `jsep` (WebGPU-capable) | 27.0 MB |

   The int8 model is ≈ 23 MB, so expect a 40–50 MB unpacked package. Stage 2 must measure the real figure, record a baseline, and make sure the README states it.
2. **WebGPU value is uncertain.** Only the int8 model is bundled. Stage 2 runs the WebGPU vs WASM warm-up benchmark (ADR §4.3). If WebGPU gains < 20%, write an ADR-0002 *proposal* to drop it. picks.json names WebGPU, so dropping it needs maintainer sign-off.
3. **Thresholds are starting values** (`J_seen 0.60`, `J_near 0.35`, `C_dup 0.93`, `C_sim 0.82`). They must be tuned on the corpus. CI gates: seen precision ≥ 0.98 and 0 full fades on the changed-meaning split.
4. **The model download at build time** (`scripts/fetch-model.ts`) is a developer-time network call with a pinned SHA-256. The SHA-256 is not yet recorded; Stage 2 fills it in.
5. **The impeccable flow was adapted.** The direction was pinned by the studio brief, so impeccable's `concept-seed` roll and decision page were not run, as a pinned direction overrides the roll. Its finish flow (reviewer and documenter) belongs to the UI stages. PRODUCT.md is inferred because no user interview was possible in this subagent.
6. **Middle-dot strings** appear in exactly two places, because picks.json specifies their copy: the provenance tag ("Fenwick Wire · 6 min ago") and the drift chip. Bible §2 #25 otherwise bans them; DESIGN.md records the exception.
7. **Verify in Stage 2:** Chrome messaging serialises JSON, so overlay fonts travel as base64 strings. Confirm the encoded size (~2 × 40–70 KB latin subsets) is acceptable.
