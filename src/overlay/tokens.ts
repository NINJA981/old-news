/**
 * Overlay palette, mirrored from DESIGN.md (the same values as src/ui/tokens.css). The overlay
 * lives in a closed Shadow DOM inside someone else's page, so it cannot read our stylesheet and
 * picks light or dark from the page's own background, never from the OS (DESIGN.md "Colors").
 * tests/unit/overlay/tokens.test.ts fails when these drift from DESIGN.md.
 */
export interface OverlayPalette {
  surface: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  accent: string;
  onAccent: string;
  drift: string;
  driftSoft: string;
  danger: string;
  surface2: string;
  /** Shadow for everything that floats over the page (DESIGN.md `e-overlay`). */
  shadow: string;
  /** `drift-mark`: the highlight behind a changed token. */
  driftMark: string;
}

export const LIGHT: Readonly<OverlayPalette> = {
  surface: '#fefdfc',
  surface2: '#f0ece8',
  border: '#dedad4',
  borderStrong: '#847f78',
  text: '#1e1a16',
  textMuted: '#5c5751',
  textSubtle: '#76706a',
  accent: '#1d7779',
  onAccent: '#f6fefe',
  drift: '#8d5406',
  driftSoft: '#ffeccd',
  danger: '#c52c2a',
  shadow:
    '0 0 0 1px oklch(0.25 0.02 70 / 0.10), 0 2px 4px -1px oklch(0.25 0.02 70 / 0.08), 0 12px 24px -6px oklch(0.25 0.02 70 / 0.18)',
  driftMark: 'oklch(0.88 0.11 85 / 0.55)',
};

export const DARK: Readonly<OverlayPalette> = {
  surface: '#191512',
  surface2: '#211d19',
  border: '#2d2925',
  borderStrong: '#68625c',
  text: '#ece7df',
  textMuted: '#c3bdb4',
  textSubtle: '#a09a93',
  accent: '#77cfd3',
  onAccent: '#001517',
  drift: '#efbe72',
  driftSoft: '#3a270b',
  danger: '#fc928a',
  shadow: '0 0 0 1px oklch(1 0 0 / 0.08), 0 12px 28px -6px rgb(0 0 0 / 0.55)',
  driftMark: 'oklch(0.83 0.11 78 / 0.24)',
};

export type OverlayTheme = 'light' | 'dark';

export const paletteFor = (theme: OverlayTheme): Readonly<OverlayPalette> =>
  theme === 'dark' ? DARK : LIGHT;
