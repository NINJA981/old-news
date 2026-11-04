# Launch kit: Old News 0.1.0

Everything here comes from the real built extension running fixture stories with invented outlets
(Fenwick Wire, Calder Courier, Morrow Daily, the town of Harrow Ford). No real outlet, brand or logo
appears in any image. Regenerate the images with `pnpm launch-assets` (needs the model and ffmpeg).

## Files

| File | Size | Use |
|---|---|---|
| `dissolve.gif` | 960 px wide | README hero, LinkedIn image fallback |
| `store-1-third-tab-light.png` | 1280 × 800 | Chrome Web Store screenshot 1, LinkedIn image |
| `store-2-hover-card-dark.png` | 1280 × 800 | Store screenshot 2 |
| `store-3-drift-dark.png` | 1280 × 800 | Store screenshot 3 |
| `social-preview-1280x640.png` | 1280 × 640 | GitHub: Settings → Social preview |
| `old-news-0.1.0-chrome.zip`, `-firefox.zip`, `-sources.zip` | about 25 MB each | Attach to the GitHub release `v0.1.0`. Gitignored: they are build output, rebuilt with `pnpm zip && pnpm zip:firefox`. |

The 128 px store icon is `public/icon/128.png` (96 px of art, transparent padding).

## LinkedIn post (draft, about 1,150 characters)

Only post the first line as written if it is true for you. If it is not, use the alternative hook.

> I read three articles on the same story this morning. 19 of the 23 paragraphs in the third one
> were things I'd already read. So I built a browser extension that greys them out and highlights
> the one number that changed.
>
> It's called Old News. It remembers what you read, paragraph by paragraph, across sites. On the
> next article about the same story:
>
> - Paragraphs you already read fade, with a tag saying where you read them.
> - New paragraphs stay in full ink. A pill tells you "Only 4 of 23 paragraphs are new to you".
> - If a paragraph you read has one fact changed (12 injured became 14), it is never faded. The
>   number glows amber and says what it was before.
>
> It all runs on your machine. The sentence model (MiniLM, 23 MB) ships inside the extension, the
> extension pages block every network request, and the test suite fails if anything leaves the
> machine.
>
> On my test corpus it never faded a paragraph whose facts changed (0 of 141), and it flagged 82%
> of them with the "what changed" chip. It is not measured on real news sites yet, and Firefox is
> untested. It is a 25 MB download, mostly the model.
>
> Open source, MIT. Install from the repo: https://github.com/NINJA981/old-news
>
> #opensource #privacy #browserextension

**Alternative hook** (when the anecdote is not literally yours): "Here is what the third article on
a story looks like when your browser remembers the first two."

**Attachment:** `dissolve.gif`, or a short screen recording of the same playground (not made yet).
Alt text below.

**Every claim in the post, and where it comes from:**

| Claim | Source |
|---|---|
| 19 of 23 paragraphs, "Only 4 of 23" | The Harrow Ford fixture story (`tests/fixtures/corpus/stories/harrow-bridge.json`), shown in the GIF |
| 23 MB model inside the extension | `scripts/model-manifest.json` (22,972,370 bytes), `pnpm size` |
| Extension pages block network requests | `connect-src 'self'` in `wxt.config.ts`, checked in the built manifest |
| Test suite fails if anything leaves the machine | `tests/e2e/fixtures.ts` |
| 0 of 141 changed paragraphs faded, 82% flagged | `metrics.json` (`pnpm eval`, 2026-10-27) |
| 25 MB download | `pnpm size`: 24.76 MB zipped, 2026-11-04 |

## Alt text

- **dissolve.gif:** "A news article titled 'Harrow Ford bridge collapse: 14 hurt as investigators
  arrive' from an invented outlet. Paragraphs fade to grey from top to bottom, each tagged 'Fenwick
  Wire', while four stay dark. The figure 14 is highlighted amber under a chip reading '12 → 14 ·
  Calder Courier said 12'. A pill in the corner counts down to 'Only 4 of 23 paragraphs are new to
  you'."
- **store-1-third-tab-light.png:** "An article page with most paragraphs in light grey, each tagged
  with the invented outlet where it was first read. One paragraph stays dark with the number 14
  highlighted and a chip '12 → 14 · Calder Courier said 12'. A pill reads 'Only 4 of 23 paragraphs
  are new to you'."
- **store-2-hover-card-dark.png:** "The same article on a dark page. A card over a faded paragraph
  names the outlet and article it was read in, shows the snippet, and offers Open original and Not
  old news."
- **store-3-drift-dark.png:** "The Old News app page, Drift screen: a list of figures that changed
  between articles on the same story, such as 12 → 14, with the outlet that reported each one."
- **social-preview-1280x640.png:** "Old News. Fades what you already read. Lights up what changed.
  Beside it, an article with faded paragraphs and one amber number."

## Chrome Web Store listing (draft)

- **Name:** Old News
- **Summary (≤ 132 characters):** Fades the paragraphs you've already read, across sites, and lights
  up the number that changed. On-device, no network.
- **Category:** Productivity (alternatively News & Weather)
- **Description:**

  Old News remembers what you read, paragraph by paragraph, across news sites. On the next article
  about the same story, paragraphs you already read fade and name where you read them, new
  paragraphs stay in full ink, and a paragraph whose number, date, name or outcome changed is never
  faded: it glows amber and says what it was before.

  Press N to fold old paragraphs, J and K to jump between new ones. The app page lists every figure
  that changed on a story, what you have remembered, and a weekly reading receipt.

  Everything runs on your computer. The sentence model ships inside the extension, nothing is
  uploaded, there is no account and no telemetry. Memory keeps short fingerprints and 140-character
  snippets for 30 days, never full articles, and Forget everything clears it.

  English article pages only. Open source (MIT): https://github.com/NINJA981/old-news

- **Single purpose:** Marks which paragraphs of a news article the reader has already read on other
  sites, and which facts changed.
- **Permission justifications:**
  - Host access (optional, requested on the onboarding page): read article text on pages the reader
    visits, to compare it with what they read before and paint the fades.
  - `scripting`: register the content script after the reader grants site access, and read the
    article tabs that are already open when the reader asks for that on the onboarding page.
  - `activeTab`: the popup reads the current tab's address (site name, per-site pause) before site
    access is granted.
  - No `tabs` permission: open tabs are listed through the granted host access.
  - `storage`, `unlimitedStorage`: settings, and the local paragraph memory (vectors and snippets)
    in IndexedDB.
  - `alarms`: the 30-day expiry sweep and unloading the model after 5 minutes idle.
  - `offscreen`: run the on-device model in an offscreen document.
  - Remote code: none. All code and the model are in the package.
- **Data use disclosure:** the extension handles "website content" (article text) on the device
  only. It is not collected, transmitted, sold or used for anything else. A privacy policy URL is
  required for this: the README "Privacy" section can serve once it is published at a stable URL.

## Firefox Add-ons (draft)

- Same name, summary and description.
- Upload `old-news-0.1.0-firefox.zip` and `old-news-0.1.0-sources.zip` (the code is bundled, so AMO
  asks for sources). Build instructions for the reviewer: Node 22, pnpm 10, `pnpm install`,
  `pnpm fetch-model`, `pnpm zip:firefox`.
- **Do not submit before the build has been run in Firefox.** It has not been, so far.

## Before posting

- [ ] Decide on the git history (author and AI-attribution trailers in the first eight commits).
- [ ] Push, create the GitHub release `v0.1.0`, attach the three zips.
- [ ] Set the repo description ("Fades the paragraphs you've already read and lights up what
      changed. On-device, no network.") and topics (`browser-extension`, `chrome-extension`,
      `privacy`, `local-first`, `news`, `on-device-ai`).
- [ ] Upload `social-preview-1280x640.png` in the repo settings.
- [ ] Check that CI is green on GitHub, so the badge in the README is.
- [ ] Re-read the post against the claims table above.
