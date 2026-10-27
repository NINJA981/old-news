---
version: alpha
name: Old-News-design-system
description: Old News is a calm reading instrument that lives at the edge of other people's pages. The extension pages (popup, app, onboarding, playground) sit on a warm-graphite canvas ({colors.bg-dark}) with one verdigris accent ({colors.accent-dark}) reserved for action and focus. Inside third-party articles it never adds to the page's flow. It lowers old paragraphs to a measured contrast floor, names where you read them in small grotesque tags, and lets exactly one amber ({colors.drift-dark}) mark the fact that changed. Newsreader carries the words of the news (titles, snippets, the reading column); Hanken Grotesk carries the instrument (counts, labels, controls).

colors:
  # Dark is primary (D2 OXIDE). OKLCH sources are listed in the Colors section.
  primary: "#77cfd3"
  on-primary: "#001517"
  bg-dark: "#110e0b"
  surface-dark: "#191512"
  surface-2-dark: "#211d19"
  surface-3-dark: "#2a2621"
  border-dark: "#2d2925"
  border-strong-dark: "#68625c"
  text-dark: "#ece7df"
  text-muted-dark: "#c3bdb4"
  text-subtle-dark: "#a09a93"
  accent-dark: "#77cfd3"
  accent-hover-dark: "#91dde1"
  on-accent-dark: "#001517"
  accent-soft-dark: "#082c2e"
  drift-dark: "#efbe72"
  drift-soft-dark: "#3a270b"
  success-dark: "#6fc884"
  danger-dark: "#fc928a"
  danger-soft-dark: "#421c19"
  info-dark: "#68b7ed"
  # Light (re-derived, not inverted)
  bg: "#f8f6f3"
  surface: "#fefdfc"
  surface-2: "#f0ece8"
  surface-3: "#e6e2dd"
  border: "#dedad4"
  border-strong: "#847f78"
  text: "#1e1a16"
  text-muted: "#5c5751"
  text-subtle: "#76706a"
  accent: "#1d7779"
  accent-hover: "#12676a"
  accent-text: "#12676a"
  on-accent: "#f6fefe"
  accent-soft: "#d5f2f2"
  drift: "#8d5406"
  drift-soft: "#ffeccd"
  success: "#287c42"
  danger: "#c52c2a"
  danger-soft: "#ffe8e6"
  info: "#0d70a4"

typography:
  # UI lane: Hanken Grotesk (compact scale for popup, overlay and app chrome)
  micro:
    fontFamily: Hanken Grotesk Variable
    fontSize: 11px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.01em
  caption:
    fontFamily: Hanken Grotesk Variable
    fontSize: 12px
    fontWeight: 450
    lineHeight: 16px
    letterSpacing: 0.005em
  ui:
    fontFamily: Hanken Grotesk Variable
    fontSize: 13px
    fontWeight: 450
    lineHeight: 20px
    letterSpacing: 0em
  ui-strong:
    fontFamily: Hanken Grotesk Variable
    fontSize: 13px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0em
  button:
    fontFamily: Hanken Grotesk Variable
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: -0.005em
  body:
    fontFamily: Hanken Grotesk Variable
    fontSize: 14px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: -0.005em
  lead:
    fontFamily: Hanken Grotesk Variable
    fontSize: 16px
    fontWeight: 450
    lineHeight: 24px
    letterSpacing: -0.01em
  label-h3:
    fontFamily: Hanken Grotesk Variable
    fontSize: 18px
    fontWeight: 550
    lineHeight: 24px
    letterSpacing: -0.012em
  count:
    fontFamily: Hanken Grotesk Variable
    fontSize: 28px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.02em
  # Reading lane: Newsreader (opsz auto)
  read-title:
    fontFamily: Newsreader Variable
    fontSize: 17px
    fontWeight: 500
    lineHeight: 24px
    letterSpacing: -0.008em
  read-snippet:
    fontFamily: Newsreader Variable
    fontSize: 15px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0em
  read-body:
    fontFamily: Newsreader Variable
    fontSize: 18px
    fontWeight: 400
    lineHeight: 29px
    letterSpacing: -0.003em
  h2:
    fontFamily: Newsreader Variable
    fontSize: 22px
    fontWeight: 500
    lineHeight: 28px
    letterSpacing: -0.015em
  h1:
    fontFamily: Newsreader Variable
    fontSize: 28px
    fontWeight: 500
    lineHeight: 32px
    letterSpacing: -0.02em
  display:
    fontFamily: Newsreader Variable
    fontSize: 44px
    fontWeight: 500
    lineHeight: 46px
    letterSpacing: -0.025em
  hero-display:
    fontFamily: Newsreader Variable
    fontSize: 120px
    fontWeight: 500
    lineHeight: 0.92
    letterSpacing: -0.035em

rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  full: 9999px

spacing:
  0-5: 2px
  1: 4px
  1-5: 6px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  16: 64px
  20: 80px
  24: 96px
  32: 128px

components:
  button-primary:
    backgroundColor: "{colors.accent-dark}"
    textColor: "{colors.on-accent-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 6px 12px
    height: 32px
  button-primary-light:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 6px 12px
    height: 32px
  button-secondary:
    backgroundColor: "{colors.surface-2-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 6px 12px
    height: 32px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.text-muted-dark}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: 6px 10px
    height: 32px
  button-danger:
    backgroundColor: "{colors.danger-soft-dark}"
    textColor: "{colors.danger-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 6px 12px
    height: 32px
  input:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: 6px 10px
    height: 32px
  keycap:
    backgroundColor: "{colors.surface-2-dark}"
    textColor: "{colors.text-muted-dark}"
    typography: "{typography.micro}"
    rounded: "{rounded.xs}"
    padding: 0 5px
    height: 20px
  card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.md}"
    padding: 16px
  status-pill:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.ui}"
    rounded: "{rounded.full}"
    padding: 0 14px 0 12px
    height: 36px
  provenance-tag:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-muted-dark}"
    typography: "{typography.micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
  drift-chip:
    backgroundColor: "{colors.drift-soft-dark}"
    textColor: "{colors.drift-dark}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
  drift-chip-light:
    backgroundColor: "{colors.drift-soft}"
    textColor: "{colors.drift}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
  hover-card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.md}"
    padding: 16px
    width: 320px
  tray:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.lg}"
    padding: 16px
    width: 340px
  popup:
    backgroundColor: "{colors.bg-dark}"
    textColor: "{colors.text-dark}"
    width: 380px
    height: 560px
  tab:
    backgroundColor: transparent
    textColor: "{colors.text-muted-dark}"
    typography: "{typography.ui-strong}"
    padding: 8px 4px
  tab-active:
    backgroundColor: transparent
    textColor: "{colors.text-dark}"
    typography: "{typography.ui-strong}"
    padding: 8px 4px
  sidebar:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-muted-dark}"
    width: 240px
  paper-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.read-body}"
    rounded: "{rounded.lg}"
    padding: 40px
  page-dark:
    backgroundColor: "{colors.bg-dark}"
    textColor: "{colors.text-dark}"
  page-light:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover-dark}"
    textColor: "{colors.on-primary}"
  button-primary-hover-light:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  link-light:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.accent-text}"
    typography: "{typography.ui}"
  link-dark:
    backgroundColor: "{colors.bg-dark}"
    textColor: "{colors.primary}"
    typography: "{typography.ui}"
  selection-dark:
    backgroundColor: "{colors.accent-soft-dark}"
    textColor: "{colors.text-dark}"
  selection-light:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
  divider-dark:
    backgroundColor: "{colors.border-dark}"
    height: 1px
  divider-light:
    backgroundColor: "{colors.border}"
    height: 1px
  input-border-dark:
    backgroundColor: "{colors.border-strong-dark}"
    width: 1px
  input-border-light:
    backgroundColor: "{colors.border-strong}"
    width: 1px
  nav-item-selected:
    backgroundColor: "{colors.surface-3-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.ui-strong}"
    rounded: "{rounded.sm}"
    height: 32px
  nav-item-selected-light:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text}"
    typography: "{typography.ui-strong}"
    rounded: "{rounded.sm}"
    height: 32px
  button-secondary-light:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 6px 12px
    height: 32px
  meta-text-dark:
    backgroundColor: "{colors.bg-dark}"
    textColor: "{colors.text-subtle-dark}"
    typography: "{typography.caption}"
  meta-text-light:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-subtle}"
    typography: "{typography.caption}"
  secondary-text-light:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-muted}"
    typography: "{typography.ui}"
  notice-success-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.success-dark}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  notice-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  notice-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  notice-info-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.info-dark}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  notice-info:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.info}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
---

# Old News: design system

> Assigned direction **D2 OXIDE** (verdigris on warm graphite, dark-first) and pairing **T4** (Newsreader + Hanken Grotesk). These are fixed by the studio so the five projects stay distinct. The brand blend is **notion + apple + claude (radius only)**, per DESIGN_BIBLE §10. Every value below is a token; components consume role tokens only.

## Overview

Old News has two homes, and the design is built around the difference.

1. **Someone else's page.** This is where the product does its work. We own nothing there: not the type, the colours or the layout. So we touch it in exactly three ways:
   - **ink level:** paragraph opacity solved to a contrast floor;
   - **one amber highlight** on a changed fact;
   - **one floating layer** for tags, chips, the pill and the tray, isolated in a closed Shadow DOM.

   Nothing is inserted into the page's flow, so the page never shifts.
2. **Our own pages.** These are the popup, app, onboarding, playground and landing page. Here the identity speaks: a warm-graphite canvas, Newsreader for anything that is news, Hanken Grotesk for anything that is instrument, and verdigris only where you can act.

**The one memorable idea, spent once:** *the dissolve.* Tab 3 of a story settles from full ink to pencil-grey, top to bottom, in about 400 ms. Four paragraphs stay lit, and one fact pulses amber. Everything else is quiet.

**Key characteristics:**

- Dark-first warm graphite (`{colors.bg-dark}` `#110e0b`), never pure black. The light theme is a re-derivation on warm stone (`{colors.bg}` `#f8f6f3`).
- **Two type lanes, never mixed:**
  - Newsreader carries the words of the news: article titles, snippets, the reading column, page titles and landing display.
  - Hanken Grotesk carries the instrument: counts, labels, tags, controls.
- **Verdigris is a signal, not paint.** It appears on the primary action, the focus ring, links and the J/K reading marker. Nowhere else.
- **Amber means "a fact changed"** and nothing else. It is the only status hue on article pages.
- **Ink level is the tier language:** full ink means new; 7:1 means similar; 4.6:1 means seen.
- **Rectangular sober geometry** with the claude-derived radius grammar of 4 / 8 / 12 / 16. CTAs are rectangles (8 px). Only the in-page status pill is a capsule, because it is a status, not an action.
- **Elevation from surface steps and hairlines** on our pages. Shadows only on things that float over third-party content.

### Blend notes (bible §10.2: borrow mechanisms, not surfaces)

| From | We took | We rejected | Our version differs by |
|---|---|---|---|
| **notion** | Sober rectangular geometry: 8 px rectangle buttons and 12 px cards, not pills. Underline-style segmented tabs (2 px bottom indicator). Generous reading leading (≈ 1.55–1.6) for snippets. Real product UI as the hero rather than illustration. | The purple CTA, navy hero band, pastel feature-card tints, sticky-note dots and mesh wires, centred hero layout, and an Inter-based single family | Our tab indicator is verdigris, not ink. Our "real UI" hero is a live DOM reproduction of the dissolve, not a screenshot card. |
| **apple** | A single accent for everything interactive. Reading pace from a larger body (Apple 17 px → our reading column 18/29 Newsreader). Press feedback by scale. **Exactly one shadow philosophy**: shadow only where an object floats over something it doesn't own. Colour change as section divider on the landing page (graphite band ↔ paper band). | Pill CTAs, SF Pro, Action Blue, frosted-glass sub-nav, photography-first tiles, and weight 300 | Our accent is verdigris (ΔE_OK 0.152 from Apple blue). Press scale is 0.97 (0.95 only on 24 px icon buttons). The floating-shadow rule is applied to the in-page overlay, not product photos. |
| **claude** (radius only) | The hierarchical radius grammar: 4 for tags, badges and keycaps; 8 for buttons, inputs and chips-as-controls; 12 for cards, popovers and the hover card; 16 for the tray, dialogs and hero containers. | Everything else: cream canvas, coral accent, serif-plus-coral pairing, spike mark, illustrations | Our canvas is warm graphite and our accent is verdigris. The serif is used as reading type, not as a brand flourish. |

**Deviation from D2 recorded (bible: "a project may deviate only by writing down the reason"):**

- D2's default radius personality is *Sharp* (2/3/4/6). The assigned blend explicitly takes claude's radius grammar, and Old News is a calm consumer reading tool (archetype A2/A9), not a dev tool. So the radius scale is **4 / 8 / 12 / 16**.
- Distinctness check across the studio: no other project uses this exact scale *together with* rect CTAs and a dark default.

## Colors

Strategy: **Restrained**, with tinted warm neutrals, one action accent (verdigris), and one semantic signal (amber drift). Physical scene: a desktop reader at 7:40 a.m., coffee, three tabs; often a dark OS theme, and news pages that are mostly white. So our pages are dark-first, and the overlay adopts *the page's* brightness, not the OS's.

All values were computed from OKLCH to sRGB hex and checked with culori 4.0.2 and apca-w3 0.1.9 on 2026-10-20.

### Dark (primary)

| Role token | OKLCH | Hex | On bg (WCAG / APCA Lc) |
|---|---|---|---|
| `bg` | `oklch(0.165 0.008 70)` | `#110e0b` | — |
| `surface` | `oklch(0.20 0.009 70)` | `#191512` | — |
| `surface-2` | `oklch(0.235 0.01 70)` | `#211d19` | — |
| `surface-3` | `oklch(0.27 0.011 70)` | `#2a2621` | — |
| `border` | `oklch(0.285 0.01 70)` | `#2d2925` | decorative |
| `border-strong` | `oklch(0.50 0.012 70)` | `#68625c` | 3.20 (non-text ≥ 3) |
| `text` | `oklch(0.93 0.012 80)` | `#ece7df` | 15.63 / 92 |
| `text-muted` | `oklch(0.80 0.014 75)` | `#c3bdb4` | 10.31 / 67 |
| `text-subtle` | `oklch(0.69 0.012 75)` | `#a09a93` | 6.91 / 48 (meta labels and ≥ 18 px only) |
| `accent` | `oklch(0.80 0.085 200)` | `#77cfd3` | 10.67 / 69 |
| `accent-hover` | `oklch(0.85 0.075 200)` | `#91dde1` | — |
| `on-accent` | `oklch(0.18 0.03 200)` | `#001517` | 10.41 on accent / Lc 70 |
| `accent-soft` | `oklch(0.27 0.04 200)` | `#082c2e` | text on it 12.10 |
| `drift` | `oklch(0.83 0.11 78)` | `#efbe72` | 11.25; 8.32 on `drift-soft` |
| `drift-soft` | `oklch(0.29 0.05 75)` | `#3a270b` | — |
| `drift-mark` (in-page highlight) | `oklch(0.83 0.11 78 / 0.32)` | over `#121212` → `#584a31` | page ink `#e8e8e8` on it 7.0:1, `#d0d0d0` 5.6:1. Raised from 0.24 (QA r1: read as grey-brown on dark pages); the dark underline is 2 px at 85% `drift`. |
| `success` / `danger` / `info` | `oklch(0.76 0.13 150)` / `oklch(0.77 0.13 25)` / `oklch(0.75 0.11 240)` | `#6fc884` / `#fc928a` / `#68b7ed` | 9.41 / 8.81 / 8.78 |
| `danger-soft` | `oklch(0.28 0.06 25)` | `#421c19` | — |

### Light

| Role token | OKLCH | Hex | On bg (WCAG / APCA Lc) |
|---|---|---|---|
| `bg` | `oklch(0.975 0.005 80)` | `#f8f6f3` | — |
| `surface` | `oklch(0.995 0.002 80)` | `#fefdfc` | — |
| `surface-2` | `oklch(0.945 0.007 75)` | `#f0ece8` | — |
| `surface-3` | `oklch(0.915 0.008 75)` | `#e6e2dd` | — |
| `border` | `oklch(0.89 0.009 75)` | `#dedad4` | decorative |
| `border-strong` | `oklch(0.60 0.012 75)` | `#847f78` | 3.68 |
| `text` | `oklch(0.22 0.01 70)` | `#1e1a16` | 16.03 / 99 |
| `text-muted` | `oklch(0.46 0.012 70)` | `#5c5751` | 6.63 / 80 |
| `text-subtle` | `oklch(0.55 0.012 70)` | `#76706a` | 4.53 / 69. **Only on `bg` and `surface`**: on `surface-2` it is 4.16, so use `text-muted` there. |
| `accent` (fills) | `oklch(0.52 0.08 198)` | `#1d7779` | 4.91 / 71; on `surface-2` 4.50 |
| `accent-hover` / `accent-text` | `oklch(0.47 0.075 198)` | `#12676a` | 6.13 / 77 (use for accent-coloured text) |
| `on-accent` | `oklch(0.99 0.008 198)` | `#f6fefe` | 5.17 on accent |
| `accent-soft` | `oklch(0.94 0.03 198)` | `#d5f2f2` | text on it 14.67 |
| `drift` | `oklch(0.50 0.11 65)` | `#8d5406` | 5.72 / 75; 5.33 on `drift-soft` |
| `drift-soft` | `oklch(0.95 0.045 80)` | `#ffeccd` | text on it 14.93 |
| `drift-mark` (in-page highlight) | `oklch(0.88 0.11 85 / 0.55)` | over `#ffffff` → `#fce6b9` | page ink `#121212` on it 15.3 |
| `success` / `danger` / `info` | `oklch(0.52 0.12 150)` / `oklch(0.54 0.19 27)` / `oklch(0.52 0.115 240)` | `#287c42` / `#c52c2a` / `#0d70a4` | 4.80 / 5.17 / 5.03 |
| `danger-soft` | `oklch(0.95 0.026 25)` | `#ffe8e6` | — |

### Brand-distance check (bible §4.4, ΔE_OK ≥ 0.06)

| Colour | Hex | Nearest brand | ΔE_OK |
|---|---|---|---|
| accent dark | `#77cfd3` | Mintlify | 0.096 |
| accent light | `#1d7779` | Apple | 0.152 |
| drift dark | `#efbe72` | PostHog | 0.074 |
| drift light | `#8d5406` | Oura gold | 0.110 |

The bible's stock warning-dark `oklch(0.82 0.13 80)` measured **0.054** from PostHog `#f7a501`, so drift-dark was moved to `oklch(0.83 0.11 78)`.

### Tier ink (in-page, computed per paragraph, not a fixed colour)

| Tier | Paint | Target against the page's own background |
|---|---|---|
| **new** | untouched | native contrast |
| **changed** | untouched + `drift-mark` highlight on the changed tokens | native |
| **similar** | `opacity: α` | **7.0:1** (light fade strength: 10.0:1) |
| **seen** | `opacity: α` | **4.6:1** (light fade strength: 7.0:1) |

- Worked example: `#121212` ink on white gives α 0.70 → `#5a5a5a` (similar) and α 0.58 → `#767676` (seen).
- Fallback on non-solid backgrounds: α 0.78 / 0.62, plus a 1 px `border-strong` gutter rule from the overlay.
- **Overlay theme selection:** the overlay reads the article container's resolved background. Relative luminance < 0.4 uses the dark tokens; otherwise light. It never follows the OS.

### Tailwind v4 wiring (extension pages)

```css
@import "tailwindcss";
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
:root { color-scheme: light; --bg: oklch(0.975 0.005 80); /* …light roles… */ }
:root[data-theme="dark"] { color-scheme: dark; --bg: oklch(0.165 0.008 70); /* …dark roles… */ }
@theme inline {
  --color-bg: var(--bg); --color-surface: var(--surface); --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3); --color-border: var(--border); --color-border-strong: var(--border-strong);
  --color-fg: var(--text); --color-fg-muted: var(--text-muted); --color-fg-subtle: var(--text-subtle);
  --color-accent: var(--accent); --color-accent-hover: var(--accent-hover); --color-accent-text: var(--accent-text);
  --color-on-accent: var(--on-accent); --color-accent-soft: var(--accent-soft);
  --color-drift: var(--drift); --color-drift-soft: var(--drift-soft);
  --color-success: var(--success); --color-danger: var(--danger); --color-danger-soft: var(--danger-soft); --color-info: var(--info);
  --font-read: "Newsreader Variable", "Iowan Old Style", Georgia, serif;
  --font-ui: "Hanken Grotesk Variable", ui-sans-serif, system-ui, sans-serif;
}
```

- Raw palette utilities (`bg-white`, `text-gray-600`, …) are banned. CI greps for them.
- The theme is set before first paint from `chrome.storage.local` via a tiny inline module (System / Light / Dark).
- `::selection` uses `accent-soft` with `text`.
- Scrollbars use `scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent`.

## Typography

**Pairing T4:** Newsreader Variable (opsz 6–72, wght 200–800, italic) and Hanken Grotesk Variable (wght 100–900). Both are OFL-1.1 and self-hosted from `@fontsource-variable/*`, latin subset.

- On extension pages, fonts load from the package with the critical file preloaded.
- In the overlay, fonts arrive as base64 over extension messaging and are registered with `FontFace` under private family names (`ON Newsreader`, `ON Hanken`). So the article's Network panel shows **0 requests**, and page CSS can never match our family names.

**Lane rule (the identity):**

- **Newsreader** sets words that came from the news: article titles, snippets, the playground reading column, story labels, page h1/h2, the receipt sentence and landing display.
- **Hanken Grotesk** sets everything the instrument says: counts, tags, chips, labels, buttons, tabs, keycaps and table headers.
- A screen uses the display face in ≤ 3 places.

**Settings:**

- `font-optical-sizing: auto` on Newsreader.
- `font-synthesis: none`.
- `font-variant-numeric: tabular-nums` on every count, chip number, time and table number. Hanken has `tnum`. Newsreader numerals appear only in prose.
- `text-wrap: balance` on headings; `text-wrap: pretty` on paragraphs.
- Curly quotes, `…`, and `&nbsp;` between a number and its unit ("14 min").

**Scale:**

| Token | Face | Size / LH | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `micro` | Hanken | 11/16 | +0.01em | 500 | Keycaps, provenance tags, badges |
| `caption` | Hanken | 12/16 | +0.005em | 450 (600 for chip numbers) | Meta, times, drift chip |
| `ui` | Hanken | **13/20** | 0 | 450 | Default UI text (popup, app chrome, pill) |
| `ui-strong` | Hanken | 13/20 | 0 | 600 | Tabs, labels, nav items |
| `button` | Hanken | 14/20 | −0.005em | 600 | All button labels (bible §4.3: dark filled buttons ≥ 14/600; on-accent on accent measures Lc 70) |
| `body` | Hanken | 14/22 | −0.005em | 400 | Help text, settings descriptions (≤ 56ch) |
| `lead` | Hanken | 16/24 | −0.01em | 450 | Onboarding intros |
| `label-h3` | Hanken | 18/24 | −0.012em | 550 | Panel titles |
| `count` | Hanken | 28/32 | −0.02em | 600 | Popup "4 of 23" |
| `read-title` | Newsreader | 17/24 | −0.008em | 500 | Article and story titles in lists, hover card title (15/20 there) |
| `read-snippet` | Newsreader | 15/24 | 0 | 400 | Snippets, quoted text |
| `read-body` | Newsreader | 18/29 | −0.003em | 400 | Playground reading column, measure 64ch |
| `h2` | Newsreader | 22/28 | −0.015em | 500 | Page titles (app) |
| `h1` | Newsreader | 28/32 | −0.02em | 500 | Onboarding headline |
| `display` | Newsreader | 44/46 | −0.025em | 500 | Receipt card sentence, README |
| `hero-display` | Newsreader | `clamp(3.5rem, 2rem + 6vw, 7.5rem)` / 0.92 | −0.035em | 500 | Landing H1 only (3D_INSPIRATION §3.3) |

Overlay type is set in **px inside the shadow root**, so it is immune to the host page's root font size.

## Layout

**4 px base.** Spacing tokens: `0-5`=2, `1`=4, `1-5`=6, `2`=8, `3`=12, `4`=16, `5`=20, `6`=24, `8`=32, `10`=40, `12`=48, `16`=64, `20`=80, `24`=96, `32`=128.

| Surface | Density | Key measures |
|---|---|---|
| Popup | Compact | 380 × 560 (max 600). Padding 12–16. Control height 32. List rows 44 (two-line). Hairline separators. No vertical scroll for the primary status; only the tab panel scrolls. |
| Overlay | Compact | Pill height 36. Tags 20 tall. Hover card 320 wide. Tray 340 wide. All offsets 16 from the viewport edge. |
| App page | Compact chrome, comfortable reading | Sidebar 240 (desktop) → icon rail 56 (768) → top bar + sheet (375). Content max-width 960. Reading 64–68ch. Gutters 32 / 24 / 16. |
| Onboarding | Comfortable | Single column, max-width 560, left-aligned. Steps are a real sequence (numbered 1–3). |
| Landing | Marketing | Sections 96 desktop / 64 mobile. Content max 1200. Gutters per bible §8.1. |

Alignment is **left-aligned everywhere**. Nothing is centred except the popup's empty-state glyph.

## Elevation & Depth

| Level | Light | Dark | Use |
|---|---|---|---|
| `e0` | none | none | Page, inline content |
| `e1` ring | `0 0 0 1px var(--border), 0 1px 2px oklch(0.25 0.02 70 / .04)` | `0 0 0 1px var(--border)` + `inset 0 1px 0 oklch(1 0 0 / .05)` on `surface` | Cards, inputs |
| `e2` raised | `0 0 0 1px oklch(0.25 0.02 70/.06), 0 1px 1px oklch(0.25 0.02 70/.02), 0 2px 4px -1px oklch(0.25 0.02 70/.06)` | `surface-2` + border | Sticky header |
| `e3` float | `0 0 0 1px oklch(0.25 0.02 70/.06), 0 2px 4px -1px oklch(0.25 0.02 70/.06), 0 8px 16px -4px oklch(0.25 0.02 70/.10)` | `surface-2` + border + inset highlight (no shadow) | Menus, tooltips, toasts on our pages |
| `e4` modal | `…, 0 24px 48px -12px oklch(0.25 0.02 70/.20)` | `0 0 0 1px oklch(1 0 0/.06), 0 24px 48px -12px rgb(0 0 0/.6)` | Dialogs, ⌘K palette |
| **`e-overlay`** | `0 0 0 1px oklch(0.25 0.02 70/.10), 0 2px 4px -1px oklch(0.25 0.02 70/.08), 0 12px 24px -6px oklch(0.25 0.02 70/.18)` | `0 0 0 1px oklch(1 0 0/.08), 0 12px 28px -6px rgb(0 0 0/.55)` | **Everything Old News floats over a third-party page** (pill, tray, hover card, chip, tags) |

`e-overlay` is the one deliberate exception to "no shadows on dark". Our layer floats over pages we don't control, and without separation it would read as part of the article.

Z-index: our pages follow bible §5.4. The overlay host is `2147483647` inside a closed shadow root.

## Shapes

| Token | Value | Roles |
|---|---|---|
| `rounded.xs` | 4 px | Provenance tags, drift chips, keycaps, badges, the tier bar ends |
| `rounded.sm` | 8 px | Buttons, inputs, selects, segmented controls, list-row hover fills |
| `rounded.md` | 12 px | Cards, hover card, popovers, menus, the popup's status card |
| `rounded.lg` | 16 px | Tray, dialogs, the ⌘K palette, onboarding panel, landing paper sheets, receipt card |
| `rounded.full` | 9999 px | The in-page status pill, switch tracks, avatar-less dots |

- **Concentric rule:** inner = outer − padding. For example, a 4 px tag inside a 12 px card with 8 px padding.
- **CTA grammar:** rectangle (8 px). Never a pill CTA.
- The only capsule is the status pill, which is a status readout, not an action.
- Toolbars, table cells and full-bleed landing bands use radius 0.

**Iconography:**

- Lucide at 16 px and 1.5 px stroke on extension pages. The overlay inlines 5 SVGs from the same set: external-link, x, chevron-up, eye, pause.
- The **product glyph** is bespoke and monoline: three horizontal strokes, the top two at 40% ink and the bottom one at full ink. It reads as "old lines faded, the new line in ink". It is used as the toolbar icon (16/32/48/128), the pill's leading mark, and the empty-state motif (≤ 96 px, `text-subtle`).

## Components

> States covered per component: rest · hover · focus-visible · pressed · disabled · loading · empty · error · success. The focus ring is `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible` only. Inputs get the `border-strong`→`accent` border plus a `0 0 0 3px oklch(from var(--accent) l c h / .25)` ring.

### Shared controls (extension pages)

- **`button-primary`.** `accent` fill, `on-accent` label at `button` (14/600), 32 px tall, 6 × 12 padding, radius 8. At most one per view.
  - Hover: `accent-hover`. Press: `scale(.97)` 100 ms.
  - Loading: keeps its label, prepends a 14 px spinner, sets `aria-busy`, and locks its width.
  - Disabled: never used for validation. Opacity .5 with a tooltip explaining why.
- **`button-secondary`.** `surface-2` fill with `text`. Hover `surface-3`.
- **`button-ghost`.** Transparent with `text-muted`. Hover `surface-2` + `text`.
- **`button-danger`** (Forget everything). `danger-soft` + `danger`. Two-step inline confirm.
- **Switch** (Radix). Track 32 × 20 on `full` radius: `border-strong` when off, `accent` when on. Thumb transform 150 ms, `SPRING.snappy`. The label sits to its left at `ui`.
- **Segmented control** (Fade strength, Theme). Rect 8 px group with a 2 px inner padding and a selected fill of `surface-3`; the indicator slides with `layoutId`.
- **Tabs** (notion-style underline). `ui-strong` labels: `text-muted` at rest, `text` when active, with a 2 px `accent` bottom indicator (`layoutId`, `SPRING.snappy`). Keyboard switching is instant.
- **Keycap.** 20 px tall, min-width 20, padding 0 5, radius 4, `micro`, `surface-2` with a 1 px `border` and `inset 0 -1px 0 var(--border)`.
- **Tooltip.** `e3`, `caption`, 500 ms first delay with instant siblings, showing label plus shortcut ("Pause this site  P").
- **Toast** (Sonner). Bottom-right, `e3`, 4 s, or 6 s with Undo. Uses the same verb as the action ("Paused on calder-courier.example · Undo").
- **Tier bar.** A 6 px horizontal stacked bar, radius 4 at its outer ends only, segments in order:

  | Segment | Fill |
  |---|---|
  | new | `text` |
  | changed | `drift` |
  | similar | `text-subtle` |
  | seen | `border-strong` |

  Under it, a legend of label/value rows (`caption` + `ui-strong` tnum). The bar is never the only carrier of meaning.

### Surface 1: in-page overlay (closed Shadow DOM, vanilla TS)

**Paragraph fades** are page elements with inline `opacity` only (tier ink, see Colors).

- `transition: opacity 240ms var(--ease-out-soft)` during the dissolve, removed afterwards.
- Hover, focus-within or J/K focus restores α = 1 in 100 ms.
- The previous inline `opacity` and `transition` values are stored and restored on teardown.

**`provenance-tag`.**

- Content: `micro` text, "Fenwick Wire · 6 min ago" or "Similar to Calder Courier · yesterday". This is the one sanctioned middle-dot string in the system, because picks.json specifies it.
- Style: `surface` at 96% opacity, 1 px `border`, radius 4, padding 2 × 6, `text-muted`, `e-overlay` without the drop layers (ring only).
- Placement, first that fits:
  1. Right gutter: ≥ 140 px between the paragraph's right edge and the container or viewport edge. Top-aligned to the first line box.
  2. Left gutter, same rule.
  3. **Dot mode:** an 8 px `border-strong` dot 12 px outside the paragraph's left edge. The tag appears on hover or focus of the dot or paragraph.
  4. No gutter at all: the tag appears on paragraph hover only, floating 6 px above its top-left.
- States:

  | State | Treatment |
  |---|---|
  | Rest | As above |
  | Hover | `text` colour |
  | Focus-visible | Accent ring. Tags are focusable buttons in reading order; Tab reaches them. |
  | Pressed | Opens the hover card |

**`hover-card`.**

- Size: 320 wide, radius 12, padding 16, `e-overlay`.
- Enter: `opacity 0→1, scale .96→1` over 160 ms `--ease-out`, origin at the tag. Exit 120 ms.
- Opens after 300 ms hover, instantly on focus or click. Esc closes it and returns focus to the tag.
- Content, top to bottom:
  1. outlet (`caption` 600 `text`) and when read (`caption` `text-muted`, e.g. "Read today, 7:32");
  2. the article title (Newsreader 15/20 500, 2-line clamp);
  3. the snippet (`read-snippet` 14/22 `text-muted` in curly quotes, ending with "…" if truncated);
  4. a match line (`caption`): "Same wording as a paragraph you read", or "Similar meaning, different wording";
  5. actions: **Open original** (ghost button with a 12 px external-link icon; opens a new tab) and **Not old news** (ghost button). After it is pressed: the paragraph returns to full ink, the button morphs to "Marked as new" (150 ms crossfade), and the card closes after 1.2 s.
- Error state: if the stored URL is missing (an ingest edge case), **Open original** is replaced by the outlet's hostname as plain text.

**`drift-chip` + highlight.**

- The highlight is `::highlight(on-drift)` with a `drift-mark` background on the changed token(s) only, plus an underline in `drift`: 1 px at 60% on light pages, 2 px at 85% on dark pages (where a 1 px line at 60% disappears).
- The chip is anchored up to 6 px above the token's first rect, max-width 360, 20 px tall like a tag (padding 2 × 8; was 4 × 8 and 24 px, which did not fit the usual paragraph gap), radius 4, background `drift-soft`, a 1 px border in `drift` at 35%.
- **A chip never covers text** (QA r1). Placement, first that fits (`geometry.placeChips`, measured from the text boxes around the token):
  1. above the token, when the gap to the line above holds the 20 px chip plus 3 px clear (lifted 2–6 px);
  2. the right gutter, level with the token's line (chips stack downwards, 6 px apart);
  3. below the token, when it is on the last line and the gap below holds the chip;
  4. hover-only: the highlight carries the change at rest, and the chip appears while the paragraph or the chip has hover or focus (it stays in the Tab order).
- Tags, dots and chips that would sit under the fixed pill or tray fade out (opacity only) while they are covered.
- Chip text: `12 → 14` (`caption` 600 tnum, `drift`), then " · Calder Courier said 12, 14 min ago" (`caption` 450, `text` at 90%).
- For non-numeric kinds:
  - "fled → arrested · Fenwick Wire said fled, yesterday"
  - "will → will not · …"
- Focusable. Enter opens the hover card for the *old* paragraph.
- Multiple drifts in one paragraph stack their chips horizontally (gap 6), up to 2, then "+1".
- Rest: highlight plus chip. Hover: chip gains the `e-overlay` drop layers.

**`status-pill`** (bottom-right, 16 px inset).

- Capsule, 36 tall, `surface`, `e-overlay`.
- Content: the 16 px product glyph, then text at `ui`. Numbers are `ui-strong` tnum.
- Close button: 24 px icon button "Hide for this page", reachable by keyboard.
- Hover or focus-within extends a second row under the text with keycaps `N` Fold old · `J` `K` Next/previous new. These are also shown in the tray, so hover is never the only path.

| State | Copy | Notes |
|---|---|---|
| Hidden | — | No matches, page not acted on, paused, or unmapped |
| Analysing (model cold, > 400 ms) | "Checking 23 paragraphs…" | Glyph shimmer 1 s cycle, off under reduced motion. Shown only after a 300 ms delay, and kept ≥ 400 ms. |
| Result | "Only **4** of **23** paragraphs are new to you" | The count rolls during the dissolve (see Signature moment) |
| All old | "Nothing new here. All **23** paragraphs are old news." | |
| Engine error | "Old News couldn't check this page." **Retry** | `danger` icon + text |
| Degraded (no model) | Result copy plus a `caption` second line: "Similar-wording matching is off" | |

**`tray`** ("Previously on" and help). Expands upward from the pill and resizes to its content (height animates via measured `grid-template-rows` 0fr→1fr, 250 ms `SPRING.ui`). Width 340, radius 16, `e-overlay`.

- Collapsed by default to a **chip above the pill**: "Previously on this story: 3 articles, 2 figures changed". `caption`, radius 4, `surface`.
- Expanded content:
  - The prior articles as rows: outlet (`caption` 600), title (Newsreader 15/20), read time. Each row links to the original.
  - A **What changed** list: drift rows as label/value ("Treated for smoke inhalation: 12 → 14").
  - Footer: "Open Drift list" (opens the app page).
- Dismiss: per story, with "Hide for this story" and Undo.
- Empty never renders: no story means no chip.

**Fold hairlines (N).** Applied instantly (0 ms).

- Each run of consecutive seen or similar paragraphs collapses. The first element of the run becomes a 1 px rule (inline style: `height:1px; overflow:hidden; margin-block:14px; background: <seen ink>`); the rest of the run is `display:none`.
- The overlay places a transparent 24 px-tall button over each rule, labelled "Show 5 old paragraphs". It is focusable and shows a `caption` label on hover or focus.
- N again restores everything.

**J/K reading marker.** A 2 px `accent` vertical rule, 8 px left of the focused new or changed paragraph and spanning its height. The paragraph receives programmatic focus (`tabindex=-1`) with no page outline change. The scroll uses `scrollIntoView({block:'center'})` with instant behaviour (P1).

### Surface 2: toolbar popup (380 × 560, React)

**Structure** (top → bottom):

1. **Header** (48): the product glyph, "Old News" in Newsreader 17/24 500, and on the right an icon button that opens the app page (`Open Old News  O`).
2. **Status card** (radius 12, `surface`, padding 16):
   - `count` "4 of 23" (tnum) with "paragraphs are new to you" at `ui` `text-muted`;
   - the tier bar and legend;
   - a site row: favicon-less hostname at `ui`, and a switch **On for this site** (P toggles it).
3. **Tabs:** *This story* | *Drift*. The panel scrolls; everything above it stays fixed.
   - This story: "Previously on" rows (outlet / title / when).
   - Drift: rows with the context label (`caption` `text-muted`), `before → after` (`ui-strong` tnum, `drift`), and both sources and times.
4. **Privacy footer** (44, `surface`, top hairline): three label/value cells.

   | Label | Value |
   |---|---|
   | Requests sent | **0** |
   | Remembered | **3,412** |
   | Oldest | **29 days** |

Paints from `chrome.storage.session` within 100 ms. No spinner on open.

| State | What shows |
|---|---|
| **First run, empty memory** | Glyph (64 px, `text-subtle`), "Nothing remembered yet." and "Read an article for a few seconds and Old News will recognise it next time." Primary **Remember open tabs** (opens onboarding step 2). |
| **Not an article** | Status card replaced by "This page isn't an article, so Old News is staying out of it." `ui` `text-muted`; the tabs still show the last story. |
| **Unmapped** | "Old News couldn't line up this page's paragraphs, so it left the page alone." Plus a `caption` reason ("Text is split across ad slots") and a link: "Why this happens". |
| **Paused (site)** | Switch off; card text "Paused on calder-courier.example. Nothing here is read or remembered." Toast with Undo when toggled. |
| **Paused (everywhere)** | The header shows a `caption` badge "Paused" in `text-muted` with a pause icon, and the card offers **Resume**. |
| **Loading model** (first use) | Status card skeleton mirroring the final layout (count, bar, legend), after a 150 ms delay, plus the line "Loading the on-device model (23 MB). First time only." |
| **Engine error** | `danger` icon + "The matching engine stopped: {reason}." **Retry** (primary) and **Copy error details** (ghost). |
| **Success, all new** | "All 23 paragraphs are new to you." Tier bar fully `text`. |
| **Success, mixed** | As in the structure above. |
| **Degraded** | `caption` notice in `info` with an icon: "Similar-wording matching is off: the model didn't load. Exact matches still work." |

**Keyboard:** P pause site, S / D switch tabs, O open the app, Esc closes. The popup has no text input, so nothing autofocuses; the first focusable control is the site switch.

### Surface 3: app page (`app.html`, React; Stories / Drift / Receipt / Memory / Settings / Playground)

- **Shell:**
  - Desktop: sidebar 240 (`surface`, right hairline), with the glyph + "Old News" at the top, nav items (rows of 32, radius 8, `ui`; selected `surface-3` + `text` + 2 px `accent` left indicator) and the privacy meter at the bottom.
  - 768: icon rail 56 with tooltips.
  - 375: top bar + sheet menu.
- **⌘K / Ctrl+K palette** (cmdk, `e4`, radius 16, 640 wide at 20vh, instant open). See the command list below.
- The current section, selected story and filters live in the URL hash (`#/drift?story=…`).

| Screen | Content | Empty | Loading | Error | Success |
|---|---|---|---|---|---|
| **Stories** | Grouped by day (Today / Yesterday / date). Each story row: label in `read-title`; a meta row with articles, outlets and last read (label/value); drift count as a `drift` text badge with a delta icon. Expanding a row shows its articles, each with a tier bar. | "No stories yet. Stories appear when two articles you read share paragraphs." **Remember open tabs** · or try the Playground | Skeleton rows (3) mirroring row height 64 after 150 ms | Panel error boundary: "Couldn't read your memory: {reason}." **Retry**, **Copy error details** | — |
| **Drift** | Table: Figure (context) · Earlier → Now · Earlier source, when · Now source, when · Story. tnum, right-aligned numbers. Sorted newest first. At 375 it becomes stacked rows. | "No changed figures in the last 30 days. When a number, date, name or outcome differs from something you read, it's listed here." | Skeleton table rows | Same boundary | — |
| **Receipt** | Week selector, then the **receipt card** (radius 16, 1200×630 ratio, `paper-sheet` light surface even in dark theme). The sentence is in `display` Newsreader: "You read 41,200 words this week. 63% was stuff you'd already read." A grid of 4 label/value stats (tnum). **Save image** (primary), **Copy text** (secondary). | "Your first receipt arrives after a week of reading. So far: {n} articles." (real count) | Card skeleton | Save failure: inline `danger` "Couldn't create the image: {reason}." **Retry** | "Saved old-news-receipt-2026-W43.png" toast |
| **Memory** | Label/value list: paragraphs remembered, articles, stories, drift records, approximate size, oldest record, "Deleted automatically after 30 days". Paused sites list with **Resume**. **Forget everything** (danger). | "Memory is empty." | Skeleton values | Boundary | After a wipe: "Forgot 3,412 paragraphs." No Undo, since it is irreversible; the confirm step said so. |
| **Settings** | Fade strength (Standard / Light), Dissolve animation (switch), In-page keys N/J/K (switch), Theme (System / Light / Dark), and a read-only engine line: "WASM · model 23.1 MB · loaded on demand". | — | — | — | "Saved" inline status with a timestamp (no toast) |
| **Playground** | A tab strip of 3 fixture articles (invented outlets, marked "Fixture story"). The reading column is a `paper-sheet` in `read-body`. **Read tab 1** (auto-scrolls at reading pace), then **Open tab 3** plays the signature moment. Side panel: a per-paragraph tier table and the engine timing. **Reset**. | — | Engine warm-up line with a determinate count "Embedding 23 / 69 paragraphs" | "The model didn't load: {reason}. MinHash and the fact guard still run." | The dissolve plays |

**Forget everything confirm** (inline, not a modal): the button expands to "Forget 3,412 paragraphs, 211 articles and 14 drift records? This can't be undone." with **Forget everything** (danger) and **Cancel**. Focus moves to Cancel.

### Surface 4: onboarding (`onboarding.html`, opened on install)

Single column, max 560, three real steps shown as `1 · 2 · 3` with the current step in `text` and the others in `text-subtle`.

1. **Let Old News read article pages.**
   - Body (`lead`): "Old News needs to see article text to recognise it later. It stores short fingerprints and 140-character snippets on this computer, never full pages, and sends nothing anywhere."
   - Primary **Allow on article pages** (`permissions.request`), plus a `caption` note about the size: "The matching model is bundled (23 MB) so it never downloads anything."
   - Denied state: "Without access, Old News only works when you click its icon on a page." **Try again** / **Continue without**.
2. **Remember the articles you have open?**
   - Checklist of detected article tabs: favicon-less outlet name, title in `read-title`, all checked.
   - Primary **Remember these 6 tabs**, secondary **Skip**. The copy states "Old News will treat these as read."
   - Empty: "No article tabs are open right now. That's fine. Old News starts learning from the next one you read."
   - Loading: rows with a per-tab status ("Reading…", "Remembered 24 paragraphs", "Couldn't line up this page, skipped").
   - Error per row in `danger`, with the reason.
3. **Done.**
   - Shortcut keycaps (N, J, K) with one line each.
   - A privacy summary as three label/value rows.
   - **Open the playground** (secondary). Close-tab hint.

### Surface 5: landing page (`site/`, Stage 3b)

See `docs/LANDING.md` for the narrative and copy.

**Components:**

- **Top bar:** 56 tall, `bg-dark`, the glyph + wordmark, links (How it works, Privacy, GitHub), and a primary **Add to Chrome** (rect, 8 px).
- **Hero:** left column with the H1 at `hero-display` and a sub-line at `lead`. On the right, the **sheet stack**:
  - three `paper-sheet`s (light surface, radius 16) in CSS perspective (`perspective: 1400px`, `rotateY(-14deg) rotateX(6deg)`, `translateZ` −48 px per sheet);
  - the front sheet is a live DOM reproduction of the overlay on a fixture article;
  - the dissolve plays once when the hero enters view; a **Replay** ghost button sits under it.
- **Proof bands** alternate `bg-dark` and `bg` (light) bands. The colour change is the divider.
- **Privacy diagram:** inline SVG, 1 px `border-strong` strokes. Labels are DOM.
- **Install block:** a store button, a copyable `pnpm build` snippet, the platform list, and the measured package size.
- **States:**
  - The hero is static under reduced motion: the final frame, with a **Play** button.
  - No JS: the final frame, which is server HTML.
  - Copy buttons show "Copied" with a check morph.

## Signature moment: the dissolve (frame by frame)

**Trigger (rationed per P7):** the first paint of a matched article in a tab session, when ≥ 3 paragraphs fade within the viewport plus one screen. Otherwise fades apply with one 150 ms opacity transition. The setting "Dissolve animation" turns it off.

| t (ms) | Frame |
|---|---|
| −∞ … 0 | The page is in full ink. The engine has answered. |
| 0 | The pill enters (opacity 0→1, y 8→0, 200 ms `--ease-out`) reading "23 of 23 paragraphs are new to you", numbers tnum. |
| 0 → 160 | Faded paragraphs **start** in document order. Stagger = `min(16, 160/(n−1))` ms (19 paragraphs → ≈ 8.9 ms), so the first paragraph starts at 0 and the last at 160. Off-screen paragraphs below the viewport plus one screen are set instantly. |
| each start + 0 → 240 | That paragraph's opacity 1 → α (its solved floor), 240 ms `--ease-out-soft`. The pill's first number decrements by one at each start (text swap, tnum). The result reads as a countdown 23 → 4. |
| each start + 180 → 330 | That paragraph's provenance tag fades in (opacity 0→1, 150 ms). |
| ≈ 400 | The last paragraph settles. "Only" fades into the pill (150 ms). The badge updates to `4`. |
| 420 → 600 | **Drift pulse 1:** the overlay rect over the changed token goes 0 → 0.9 (180 ms `--ease-out`). |
| 600 → 1020 | Rect 0.9 → 0.35 (420 ms `--ease-in-out`). |
| 520 → 720 | The drift chip rises: opacity 0→1, y 4→0, 200 ms `--ease-out`, origin bottom-centre at the token. |
| 1020 → 1200 | **Pulse 2:** 0.35 → 0.9. |
| 1200 → 1620 | 0.9 → rest. The rect is removed and `::highlight(on-drift)` carries the steady state. |
| > 1620 | Stillness. No loops. |

- Two pulses in 1.2 s is 1.7 flashes per second, under WCAG 2.3.1.
- Any scroll, key or click during the sequence **finishes it instantly**: every animation jumps to its end state, so input always wins (P6).
- **Reduced motion:** all faded paragraphs transition together in 150 ms. Tags appear with them. There is no pulse; the highlight and chip appear with a 150 ms fade. The pill shows the final copy immediately.
- **Capture:** the sequence is a WAAPI timeline. `?capture` on the playground and landing exposes `window.__frame(i, fps)`, which sets every animation's `currentTime`. Frames are deterministic for the README GIF and LinkedIn MP4 (bible §11.7).

## Motion tokens

```css
--dur-0: 0ms;     /* N fold, J/K, keyboard tab switches, ⌘K open */
--dur-1: 100ms;   /* hover colour, press, un-fade on hover */
--dur-2: 150ms;   /* tooltip, tag fade, reduced-motion fades */
--dur-3: 200ms;   /* popover/menu enter, pill enter, chip rise */
--dur-4: 250ms;   /* tray resize, dialog enter */
--dur-5: 300ms;   /* ceiling for UI */
--dissolve-para: 240ms;  --dissolve-spread: 160ms;  --dissolve-stagger-max: 16ms;
--pulse-rise: 180ms;  --pulse-fall: 420ms;
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-out-soft: cubic-bezier(0.25, 1, 0.5, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-scene: cubic-bezier(0.65, 0.05, 0, 1);  /* landing sheet-stack settle only */
```

- Springs on extension pages: `SPRING.snappy` (tabs, switches, segmented control) and `SPRING.ui` (tray, popovers), from bible §5.5.
- Exits run at about 75% of the enter duration.
- Transitions are CSS, never `transition: all`.
- Only `opacity` and `transform` animate, plus the tray's `grid-template-rows`.

## Shortcut map

| Where | Key | Action |
|---|---|---|
| Browser | Alt+Shift+O (`_execute_action`) | Open the popup |
| Article page | N | Fold or unfold old paragraphs |
| Article page | J / K | Next / previous new or changed paragraph |
| Article page | Esc | Close the hover card or tray |
| Popup | P · S · D · O · Esc | Pause site · This story tab · Drift tab · Open app · Close |
| App | ⌘K / Ctrl+K | Command palette |
| App | G then S / D / R / M | Go to Stories / Drift / Receipt / Memory |
| App | / | Search stories |

In-page keys are active only when no input or contenteditable has focus, only on pages Old News acted on, and they can be disabled in Settings.

**⌘K commands:**

- **Navigation:** Go to Stories, Drift, Receipt, Memory, Settings, Playground.
- **Actions:**
  - Pause on a site…
  - Resume a paused site…
  - Pause everywhere / Resume everywhere
  - Remember open tabs
  - Save this week's receipt
  - Run the playground
- **Settings:** Fade strength: Standard / Light; Dissolve animation on/off; In-page keys on/off; Theme: System / Light / Dark.
- **Danger:** Forget everything… (opens the inline confirm).

## Landing 3D / immersive plan (bible §11): a reasoned CSS/SVG-only choice

**Decision: no WebGL.** Bible §11.2(1) asks for the sentence the 3D says. Ours would be "old pages turn translucent and the new line stays in ink", and that is *typography*, which the DOM renders exactly and accessibly.

- A WebGL scene would put the product's own words inside a canvas (banned X18) or duplicate them.
- It would cost ≈ 242 KB gz (R3F path) for no explanatory gain (3P2).
- The live product moment already is the hero.

**What we use instead:**

- **T21, CSS version:** three real `paper-sheet`s in perspective (≤ 5 cards, CSS preferred by the catalogue). The sheets settle into the stack once on load over 750 ms `--ease-scene`, with copy arriving 120 ms later. Then the front sheet plays the dissolve.
- **T1 poster-first:** the hero *is* server-rendered DOM at its final frame, so the H1 is the LCP element. JS only replays the animation.
- **T18 pre-rendered loop:** a deterministic capture of the hero timeline produces the README GIF (≤ 3 MB, 800–960 px, ≤ 6 s) and LinkedIn MP4s (1:1 and 4:5). It is also used as the tier-0 fallback in non-reduced-motion contexts only if the live DOM animation is disabled.
- **T23 grain, optional:** inline SVG `feTurbulence` at 3% on dark bands only. It is dropped if it reads as texture-for-its-own-sake in review.
- **Budget:** initial JS ≤ 120 KB gz. No 3D chunk. LCP ≤ 2.0 s with the H1. CLS 0 (sheet stack in a fixed `aspect-ratio` box).
- **Reduced motion:** no settle and no dissolve; the final frame plus **Play**.

## Do's and Don'ts

### We never (bible P8: three explicit constraints)

1. **We never fade through the floor.** Old text stays ≥ 4.5:1 against the page's own background. "Fade, never hide" is measurable.
2. **We never put anything into a page's flow.** Every Old News mark is opacity, a highlight, or a floating layer. No inserted elements and no layout shift, except the reader's own N fold.
3. **We never encode a tier in hue.** Verdigris means *you can act here*. Amber means *a fact changed*. New, similar and seen are told apart by ink level alone, never by a rainbow of tier colours. Semantic success, danger and info appear only on our own pages, always with an icon and words. On our dark pages, depth comes from surface steps; the only drop shadow there is `e4` for dialogs and the ⌘K palette.

### Do

- Let the engine's numbers be the copy: "Only 4 of 23 paragraphs are new to you."
- Keep tags small, muted and in the margin. The article stays the subject.
- Use Newsreader for the news and Hanken for the instrument.
- Show the measured model size and the measured corpus metrics. Never round them in our favour.

### Don't

- Don't put real outlets' names on fixture text. Fixtures use invented outlets ("Fenwick Wire", "Calder Courier", "Morrow Daily") and say "Fixture story".
- Don't use emoji, `→` on buttons (the arrow appears only inside drift data, "12 → 14"), all-caps eyebrows, gradients, glass, or numbered markers on non-sequences.
- Don't use more than one filled verdigris button per view.
- Don't use middle-dot meta strings outside the two spec-mandated strings (the provenance tag and drift chip). Everywhere else, use label/value structure.

## Responsive Behavior

| Surface | 375 | 768 | 1440 |
|---|---|---|---|
| Popup | n/a (fixed 380 × 560; designed and screenshot at real size) | — | — |
| Overlay | Article pages are desktop-only (extensions). Tags fall to dot mode below a 140 px gutter; the tray becomes full-width minus 32 when the viewport is < 480. | Same rules | Right-gutter tags typical |
| App | Top bar + sheet nav; Drift table → stacked rows; receipt card scales to width | Icon rail 56; tables hide the Story column (`data-priority`) | Sidebar 240 + content ≤ 960 |
| Onboarding | Full width, 16 gutter, 44 px targets | Centred column 560 | Same |
| Landing | Sheet stack below the H1, two sheets only, no perspective tilt; display clamps to 56 px | Stack beside a narrower H1 | Full composition |

No horizontal scroll at 375. Hit targets are ≥ 24 px on desktop (extended with `::after`) and 44 px on touch layouts.

## Iteration Guide

1. Tokens live in `src/ui/tokens.css` and are mirrored into `overlay.css`. `scripts/check-tokens.ts` fails CI on drift, contrast regressions or brand ΔE < 0.06.
2. Run `npx @google/design.md lint DESIGN.md` after edits.
3. Every new component gets all nine states before it ships, screenshotted in light and dark.
4. Treat the signature moment's timings as a contract. Change them here first.

## Appendix B pre-flight checklist (bible), ticked

- [x] **Archetype and blend notes, with what was rejected:** A2 calm consumer daily-use, with the A9 reading lens and A6 for the popup. Blend notes for notion, apple and claude (radius only) are in Overview.
- [x] **Direction with adjustments, re-checked against §4.4:**
  - D2 OXIDE as assigned.
  - Added `surface-3`, `drift`/`drift-soft`/`drift-mark`, `accent-text` (light) and `danger-soft`.
  - Moved drift-dark off the bible's stock warning colour (ΔE 0.054 → 0.074 from PostHog).
  - Radius deviation recorded.
- [x] **Pairing, scale and font features:** T4 (Newsreader + Hanken Grotesk). Compact scale for UI, comfortable reading tokens. Lane rule. `opsz` auto, `tnum`, `font-synthesis: none`.
- [x] **Radius, CTA grammar and theme default:** radius 4/8/12/16 (claude grammar); rect CTAs; dark default (System-follow with dark as the designed primary). The overlay follows the page.
- [x] **Three "we never" constraints:** see Do's and Don'ts.
- [x] **Signature moments and their events:** one, the dissolve, on the first paint of a matched article per tab session, specified frame by frame.
- [x] **Shortcut map and cmdk command list:** see Shortcut map.
- [x] **Empty, loading, error and success copy for every primary screen:** see Components (overlay, popup, app, onboarding, landing).
- [x] **Target platforms and §8 constraints:**
  - Chrome MV3 popup at 380 × 560 with instant paint from session storage.
  - Content UI in a closed Shadow DOM at z-index 2147483647.
  - Fonts bundled (and messaged to the overlay, never fetched by the page).
  - Badge ≤ 4 characters.
  - Firefox second.

**§11.10 additions:**

- [x] **The one sentence the 3D says, and the T-patterns used:** "Old pages turn to pencil; the new line stays in ink." Patterns T21 (CSS) + T1 + T18. WebGL was declined with reasons.
- [x] **Poster, loop and OG card from one source:** the same DOM timeline via the `?capture` stepper and Playwright, then ffmpeg (Stage 6 renders the files).
- [x] **`size-limit` entries:** landing initial ≤ 120 KB gz; no 3D chunk (0 KB).
- [x] **Tier 0 / reduced motion / no WebGL:** reduced-motion and no-JS states are specified. Captures are due in Stage 3b QA. They are ticked here as *planned* and verified later.

## Known Gaps

- Newsreader's support for `tnum` has not been verified. Numbers are set in Hanken by rule, so nothing depends on it.
- The exact model size (≈ 23 MB) is a pre-measurement figure. The UI copy must read the real value from the build manifest (`meta.modelInfo`), never a hard-coded string.
- Overlay theme detection on pages with background images falls back to the light tokens plus a ring. It will be tuned against the smoke-site list.
