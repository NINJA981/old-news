# Changelog

All notable changes to Old News are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-04

First public release. Chrome (Manifest V3) is the tested target; a Firefox build is produced but has
not been run.

### Added

- **Paragraph memory across sites.** Each paragraph you dwell on is kept as a MinHash signature, an
  int8 sentence vector (all-MiniLM-L6-v2, on-device) and a 140-character snippet in IndexedDB, for
  30 days. Full paragraph text is never stored.
- **Three tiers on the next article about the same story.** Wire copy and re-pastes fade to a
  measured 4.6:1 contrast with a tag naming where you read them. Close paraphrases fade less
  (7:1) and say "Similar to". New paragraphs stay in full ink.
- **Fact-drift guard.** A paragraph that matches one you read but changes a number, date, amount,
  name, negation, modal or outcome verb is never faded. The changed token is highlighted and a chip
  says what it was, for example "12 → 14 · Calder Courier said 12, 16 min ago".
- **The dissolve**, a status pill ("Only 4 of 23 paragraphs are new to you"), a "Previously on"
  tray, hover cards with **Open original** and **Not old news**, N to fold old paragraphs, J and K
  to jump between new ones.
- **Toolbar popup** for every page state (first run, analysing, result, all new, nothing new, not
  an article, not English, could not line up the paragraphs, paused, degraded, error).
- **App page:** Stories, Drift, a weekly reading Receipt (saved as a PNG on-device), Memory,
  Settings (per-site pause, Forget everything), a Playground and a command palette.
- **Onboarding** that asks for site access and offers to remember the article tabs already open.
- **Landing page and phone-friendly web app** in `site/`, running the same engine on pasted text.
- Fixture corpus with invented outlets and `pnpm eval`, which publishes precision and
  changed-meaning recall to `metrics.json`.
- Licence texts of every redistributed component inside the package (`licenses/`).
- Toolbar and store icons.
- CI workflow, contributing guide, code of conduct, security policy, issue and PR templates.

### Known limitations

See "Limitations" in `README.md`. In short: changed-meaning recall is 0.82 on a small authored
corpus (target 0.85), the package is 56.7 MB unpacked, Firefox is untested, and accuracy on real
news sites has not been measured.

[0.1.0]: https://github.com/NINJA981/old-news/releases/tag/v0.1.0
