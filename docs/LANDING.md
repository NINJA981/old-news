# Old News: landing narrative

**Surface:** `site/` (Stage 3b). **Mode:** Persuade. The visitor should understand in one viewport what Old News does, believe it is private, and either add it to Chrome or try the playground.

**Structure:** five beats, in ≤ 7 viewports at 1440 × 900. Visual rules come from `DESIGN.md` (landing components and the CSS-only immersive plan).

**Content rules:**

- **Every number on this page is measured or comes from the reader's own data.** Corpus metrics, package size and latency are written as `{measured: …}` placeholders. Stage 3b or Stage 6 fills them from `metrics.json` and the build report. If a value isn't available, the line is cut; it is never estimated. (This file is the brief, so the placeholders stay. The shipped page reads every number from `site/src/generated/measured.json`, and `site/tests/unit/freshness.test.ts` fails when that file drifts from `metrics.json` or the size baseline.)
- No testimonials, star counts or "trusted by" rows. There are none yet.
- Fixture articles use invented outlets ("Fenwick Wire", "Calder Courier", "Morrow Daily") and an invented town ("Port Alder"), labelled "Fixture story".

---

## Hero concept: "The third tab"

**The sentence the hero says:** *old paragraphs turn to pencil; the new line stays in ink.* The hero is that sentence happening, in real DOM.

### Composition (1440)

- **Left (5 of 12 columns):** the H1 in `hero-display` Newsreader, the sub-line in `lead`, then the primary **Add to Chrome** (rect 8 px, verdigris) with a secondary text link, **Try it without installing**, that scrolls to the playground.
- **Right (7 columns):** the **sheet stack**. Three light `paper-sheet`s in CSS perspective (`rotateY(-14deg) rotateX(6deg)`, −48 px `translateZ` per sheet), each with a 28 px tab label in Hanken: *Fenwick Wire*, *Calder Courier*, *Morrow Daily*. The front sheet is the third tab: a real fixture article in `read-body`.
- **On load** (once, after `load` + idle):
  1. The stack settles: 750 ms, `--ease-scene`.
  2. 120 ms later, the front sheet **dissolves**: 19 paragraphs drop to pencil, the tags fade in, the pill counts down 23 → 4, and the "12 → 14" chip pulses amber twice.
  3. A ghost **Replay** button sits under the stack.
- **Reduced motion or no JS:** the stack is static at its final frame, with a **Play** button (reduced motion only).
- **LCP** is the H1. The stack sits in a fixed `aspect-ratio` box, so CLS is 0.

### Mobile (375)

H1 (clamped to 56 px), sub-line, CTA, then a two-sheet stack with no tilt. The dissolve still plays.

### Draft copy

- **H1:** You've read this before.
- **Sub-line:** Old News remembers every paragraph you read, on your own computer. On the next article about the same story, it fades what you already know, tells you where you read it, and lights up the one number that changed.
- **Primary CTA:** Add to Chrome
- **Secondary:** Try it without installing
- **Under-CTA meta** (label/value, `caption`):

  | Label | Value |
  |---|---|
  | Network requests | 0 |
  | Runs on | your computer |
  | Package | {measured: packed MB} |

### H1 alternates for review

- "Only 4 of 23 paragraphs are new to you."
- "Read the news once."

---

## Beat 1: Hook (viewport 1)

The hero above. The CTA is visible without scrolling at 1440 × 900 and at 375 × 812.

## Beat 2: The real product in motion (viewport 2, light paper band)

The colour change from graphite to paper is the section divider. A wide, uncropped capture of the real overlay on the fixture article (the T18 loop rendered from the same DOM timeline; MP4 + WebM, `muted playsinline loop preload="none"`, poster = frame 0, Pause button) shows three moments:

1. Tags in the margin.
2. The hover card ("Open original", "Not old news").
3. Pressing **N**: old paragraphs fold to hairlines, and **J** jumps between the new ones.

- **Heading (h2, Newsreader):** It fades. It never hides.
- **Body:** Paragraphs you've read drop to a pencil grey that is still readable. That's a contrast floor of 4.6:1, measured against the page's own background. Hover any of them to see where you read it. Press N to fold them away, J and K to jump between what's new.

## Beat 3: Three proof moments (viewports 3–5, one per viewport, alternating bands)

Each is a 4–6 s loop with one line of copy. No 3D.

### 3a: Fact drift (graphite band)

- **Loop:** a day-2 update. One paragraph stays lit; "14" glows; the chip rises: "12 → 14 · Calder Courier said 12, 16 min ago".
- **Heading:** The one number that changed.
- **Body:** When a paragraph matches one you've read but a number, date, name or outcome is different ("fled" became "arrested"), Old News refuses to fade it and marks what changed. Everything it compares stays on your machine.
- **Proof line:** the corpus metric, written as `{measured: changed-meaning recall}` of changed paragraphs caught, and `{measured: 0}` changed paragraphs fully faded, in {measured: N} test pairs. Links to `metrics.json` in the repo.

### 3b: Previously on (paper band)

- **Loop:** the next morning. The tray chip "Previously on this story: 3 articles, 2 figures changed" expands to list them.
- **Heading:** Come back tomorrow. Start where you left off.
- **Body:** Return to a story and Old News lists what you've already read and which figures moved since.

### 3c: Starts on day one (graphite band)

- **Loop:** onboarding step 2. Open tabs are listed and remembered ("Remembered 24 paragraphs").
- **Heading:** Useful from the first minute.
- **Body:** On install, Old News offers to remember the article tabs you already have open, so your next article on the same story is already sorted. It reads the tabs you choose and fetches nothing.

## Beat 4: The how (viewport 6, paper band)

An inline SVG diagram drawn with 1 px `border-strong` strokes. All labels are DOM text. The diagram shows: *article page → paragraphs → [ fingerprints (MinHash) · meaning (MiniLM, on-device) · fact guard ] → IndexedDB on your computer*. A crossed-out cloud with the label "Nothing leaves this box" sits outside the boundary.

Told in three steps, with a number in each step:

1. **The decision.** Remember paragraphs, not pages, and never send them anywhere.
2. **The naive version.** One similarity score fades "police said the suspect fled" when the new article says "was arrested". The two sentences are near-identical to an embedding model.
3. **The trick.**
   - Three tiers: exact wire copy fades fully, and similar wording fades less.
   - A deterministic fact guard keeps anything with a changed number, name, negation or outcome in full ink.
   - Thresholds are tuned on a published test corpus: `{measured: precision}` full-fade precision.
4. **How it degrades.**
   - If the page's paragraphs can't be lined up exactly, Old News does nothing.
   - If the model can't load, exact matching still works.
   - Reduced motion skips the animation.
5. **Stack and licence.** WXT, transformers.js with all-MiniLM-L6-v2 (int8), IndexedDB, MIT. The model is bundled, which is why the download is `{measured: packed MB}`. It loads only when you open an article.

**Privacy proof box** (label/value table):

| What | Where | How long |
|---|---|---|
| Paragraph fingerprints, 140-character snippets, article titles and links | This browser (IndexedDB) | 30 days, then deleted |
| Full article text | Never stored | — |
| Incognito windows | Never processed | — |
| Network requests | 0. Enforced by the extension's content security policy and tested in CI. | — |

The box ends with a **Forget everything** caption that explains the one-click wipe.

## Beat 5: Install (viewport 7, graphite)

- **Heading:** Read the news once.
- **Primary:** Add to Chrome.
- **Secondary:** a copyable build snippet in a code block:

  ```
  git clone https://github.com/{owner}/old-news && cd old-news && pnpm install && pnpm build
  ```

- **Platform list:**

  | Platform | Status |
  |---|---|
  | Chrome | Supported |
  | Firefox | Second build |
  | Edge and Brave | Should work, untested |
  | Mobile browsers | Not supported. Mobile Chrome has no extensions. |
  | Languages | English pages only, for now |

- **Honest limits line:** "Works on articles and long-form blog posts. Some sites lay out text in ways Old News can't line up, and there it stays out of the way."
- **Footer:** GitHub, licence (MIT), "Built in the open", and a privacy statement link. No stars badge until there are stars to show.

---

## README (same beats, in text)

1. **One line:** Old News fades the paragraphs you've already read, on any news site, and lights up the one number that changed. On-device, zero network requests.
2. **Hero GIF:** the deterministic capture of the hero timeline (≤ 3 MB, 800–960 px, ≤ 6 s).
3. **Why (3 bullets):**
   - Most of a follow-up article is background you read yesterday.
   - The same wire story runs on a dozen sites.
   - The detail that changed is the one you'd miss.
4. **How it feels:** 2–3 short loops (fold and jump, Previously on, drift).
5. **Install:** store link plus a build from source, with **the measured package size and what makes it that big**.
6. **How it works:** the diagram, the tier table and the **published corpus metrics table**, generated from `metrics.json`.
7. **Privacy:** the storage table and the network policy.
8. **Credits and licence:**
   - MiniLM (Apache-2.0)
   - Newsreader and Hanken Grotesk (OFL-1.1)
   - Readability (Apache-2.0)
   - Wikinews fixtures (CC BY 2.5)

## LinkedIn hook

> I read three articles on the same story this morning. 19 of the 23 paragraphs in the third one were things I'd already read. So I built a browser extension that greys them out and highlights the one number that changed.

This is the author's anecdote and must stay true. Stage 6 records the real moment, or reframes it ("Here's what that looks like on three articles"). The video is the 1:1 and 4:5 MP4 from the same capture. Its first frame is the poster: full-ink tab 3 with the pill hidden.
