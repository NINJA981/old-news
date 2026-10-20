# Product

<!-- impeccable:product-schema 1 -->

> **Provenance of this record.** Written during the Stage 1 architect run by a subagent with no way to ask the user questions. Every fact below comes from the studio's `picks.json` entry for `old-news` and the council transcript `council/W2-1-1-old-news.md`. Lines marked *(inferred)* are the architect's reading of those sources, not confirmed answers.

## Platform

web (browser extension: Chrome MV3 first, Firefox build second)

## Stack

Delegated by the studio workflow: WXT browser-extension framework, React for extension pages, vanilla TypeScript for the in-page overlay. See `docs/adr/0001-architecture.md`.

## Users

Desktop readers with a daily news habit who open several outlets on one story, or who follow a developing story across days: aggregator click-throughs, newsletter links, Reddit threads. A secondary group reads long-form blog posts and research tabs that repeat each other, such as health, product and how-to research. Their job: find the two paragraphs that are new to them without re-reading the twenty they already know, and never miss the one figure that changed.

The council was explicit that this audience is real but narrow. Mobile Chrome has no extensions, so phone-first news readers are out of reach.

## Product Purpose

Old News remembers every paragraph you have read, across sites, on your own machine. On the next article about the same story, paragraphs you already read fade and are tagged with where you read them. New paragraphs stay in full ink. A paragraph that matches one you read but carries a different number, date, name or outcome stays lit and glows amber ("12 → 14, Calder Courier said 12, 14 min ago").

Success is the morning moment: the third tab on a story reads "Only 4 of 23 paragraphs are new to you", and the reader trusts that nothing load-bearing was faded.

## Positioning

A paragraph-level, cross-site "seen it" memory with a fact-drift guard and provenance, running fully on-device with zero network requests. Nearby products either work at link or headline level (Fresh News, Nunus), diff a single URL against itself (SiteDelta), search past reading without marking the page (DejaRead), or have an LLM rewrite the page (read smart). Old News never rewrites. It fades, names the source, and refuses to fade anything whose facts differ.

## Operating Context

- Runs passively on article-like pages. There is nothing to start.
- Core loop: the morning routine of 3–5 news tabs. The second article on a story is already mostly faded.
- Return loop: coming back to a story the next day shows a "Previously on" card.
- Cold start: on install, Old News offers to remember the article tabs already open.
- Inspection: the toolbar popup shows the page's breakdown, the story's drift list and the privacy meter.
- Rare moments: the weekly reading receipt, and wiping memory.

## Capabilities and Constraints

- Chrome first, English first, article-like pages only. Long-form blog posts and live blogs count.
- Never runs in incognito. Does nothing on a page whose paragraphs it cannot map back to the live DOM.
- Fades, never hides. Folding old paragraphs to hairlines is opt-in (the N key).
- Three match tiers: wire copy (full fade), similar (lighter fade, labelled "similar to"), and changed (stays lit, amber).
- Stores vectors, MinHash signatures, extracted fact tokens and 140-character snippets in IndexedDB, with a 30-day TTL, one-click wipe and per-site pause.
- Zero network requests at runtime, provable in DevTools. The embedding model is bundled. *(inferred)* That makes the package large, roughly 40–50 MB unpacked, and the README must state the measured figure.
- No accounts, backend or telemetry.

## Brand Commitments

- Name: **Old News**.
- Voice *(inferred from the council record)*: plain, specific and calm. Numbers over adjectives. The product states what it did ("19 paragraphs faded") and never sells it.
- Never puts words in a real outlet's mouth. Demo and fixture content uses invented outlets and is labelled as fixture content.

## Evidence on Hand

- No users, testimonials, ratings, press or benchmarks exist yet. None may be invented.
- Evidence that will exist after Stage 2: the CI fixture corpus metrics (fade precision and changed-meaning recall), the measured package size, and match latency. Only these may be quoted, and only with their measured values.

## Product Principles

1. **Trust beats coverage.** A missed fade costs the reader a few seconds. A false fade on a changed outcome costs their trust for good. When in doubt, leave the paragraph lit.
2. **Fade, never hide.** Old text stays readable at the contrast floor, one hover from its source.
3. **Do nothing rather than do it wrong.** If extraction or DOM mapping is uncertain, the page is left untouched.
4. **Provably local.** Zero network requests is a property you can check, not a promise.
5. **Show the work.** Every fade names where you read it. Every metric we publish comes from the corpus.

## Accessibility & Inclusion

- Faded text never drops below WCAG AA (4.5:1) against the page's own background.
- Every in-page action has a keyboard path (N, J, K) and a visible focus state. Reduced motion turns the dissolve into an instant fade.
