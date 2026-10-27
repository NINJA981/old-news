# Fixture provenance

Every fixture here was **authored for this repository** (2026-10-20 to 2026-10-27, by the build
workflow) and is released as **CC0-1.0**. No news text from any real outlet is committed. Every
place, person, company and outlet in the fixtures is invented, and every URL uses the reserved
`.example` domain.

| Path | What it is | Used by |
|---|---|---|
| `corpus/stories/*.json` | Four invented stories (`port-alder-fire`, `kessel-valley-rail`, `sleep-blogs`, `harrow-bridge`): 12 articles, 118 paragraphs. `harrow-bridge` is the long one (23 paragraphs on its last tab: 19 seen, 1 changed figure `12 -> 14`, 3 new) that the playground and the screenshots use, so the signature moment counts down 23 to 4. Each has a wire original by the invented "Fenwick Wire", republications by invented outlets (re-ordered, re-headlined, copy-edited, paraphrased), and day-2 updates. Every paragraph carries a hand-written label: `new`, `seen`, `similar` or `changed`, plus a variant (`verbatim`, `edit`, `paraphrase`) and the expected drift kinds. | `tests/fixture/stories.test.ts`, `scripts/eval-corpus.ts`, e2e |
| `corpus/changed-meaning.jsonl` | 166 minimal pairs: 141 where a load-bearing fact changed (number 26, date 20, money 15, entity 15, negation 20, modal 15, outcome 30) and 25 paraphrased-but-unchanged controls. Each line is `{id, kind, expect, a, b}`. | `tests/fixture/changed-meaning.test.ts`, `scripts/eval-corpus.ts` |
| `layouts/*.html` | Fifteen authored pages that imitate CMS markup patterns: WordPress-like, Arc-like nested wrappers, Ghost-style blog (JSON-LD `BlogPosting`), Medium-like (pull quote and figcaption), AMP, a live blog, a paywall teaser, text split by ad slots, canvas-rendered text, and five non-article pages (search results, webmail, product listing, docs index, social feed) plus a French article. | `tests/fixture/layouts.test.ts`, e2e |
| `layouts/expectations.json` | The expected outcome of the page pipeline for each layout (`mapped` with kind and paragraph count, `reject`, `not-article`, `non-english`). | `tests/fixture/layouts.test.ts` |

## Honest limits

- The corpus is **small** (4 stories, 118 labelled paragraphs, 0 negatives). ADR-0001 §8 asks for
  12 stories and 30 Wikinews negatives. Metrics computed on it are published as measured, not as
  evidence of general accuracy. The paraphrase tier has only 2 labelled paragraphs.
- Labels were written by the same process that wrote the engine, not by an independent annotator.
- The layout fixtures are templates of common patterns, not captures of real sites. A real-site
  smoke list is still to be written (ADR §8, `docs/smoke-sites.md`).
- One accepted limitation found while authoring: an ad slot whose class name is not on
  Readability's "unlikely candidate" list stays inside the paragraph element, so the ad text
  becomes part of that paragraph (it can then add noise to the drift guard). The `ad-split.html`
  fixture uses the common `ad-break` class and is rejected as intended.
