/**
 * Contrast-floor solver (ADR-0001 §6, SPEC F8). Pure maths on sRGB colours: no DOM, no
 * extension APIs. The content script reads each paragraph's computed ink and background and
 * asks for the opacity that lands the faded text exactly on the tier's contrast target.
 *
 * Fades never go below the WCAG AA floor: seen paragraphs land at 4.6:1, similar at 7:1
 * (light fade strength: 7:1 and 10:1). If the native contrast is already at or below the
 * target there is nothing to fade; only the tag is drawn.
 */

export interface Rgba {
  /** 0..255 */
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

export type FadeStrength = 'standard' | 'light';
export type FadeTier = 'seen' | 'similar';

/** Contrast targets by tier and strength (DESIGN.md "Tier ink"). */
export const CONTRAST_TARGETS: Readonly<Record<FadeStrength, Readonly<Record<FadeTier, number>>>> =
  {
    standard: { seen: 4.6, similar: 7.0 },
    light: { seen: 7.0, similar: 10.0 },
  };

/** Fallback opacities for non-solid backgrounds (images, gradients), ADR §4.5. */
export const FALLBACK_OPACITY: Readonly<Record<FadeTier, number>> = { seen: 0.62, similar: 0.78 };

/** Relative luminance below which the overlay uses the dark tokens (DESIGN.md "Overlay theme selection"). */
export const DARK_LUMINANCE_THRESHOLD = 0.4;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Parses a CSS colour as returned by getComputedStyle: `rgb()`, `rgba()` (comma or space
 * syntax), `color(srgb r g b / a)` and `#rgb[a]` / `#rrggbb[aa]`. Returns null otherwise.
 */
export function parseCssColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith('#')) return parseHex(s.slice(1));
  const fn = /^(rgba?|color)\(([^)]*)\)$/.exec(s);
  if (!fn) return null;
  const isColorFn = fn[1] === 'color';
  let body = (fn[2] ?? '').trim();
  if (isColorFn) {
    if (!body.startsWith('srgb')) return null;
    body = body.slice(4).trim();
  }
  const [chan = '', alpha] = body.split('/').map((x) => x.trim());
  const parts = chan.split(/[\s,]+/).filter(Boolean);
  let alphaStr = alpha;
  if (alphaStr === undefined && !body.includes('/') && parts.length === 4) {
    alphaStr = parts.pop();
  }
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => parseChannel(p, isColorFn));
  if (nums.some((n) => n === null)) return null;
  const a = alphaStr === undefined ? 1 : parseAlpha(alphaStr);
  if (a === null) return null;
  const [r, g, b] = nums as [number, number, number];
  return { r, g, b, a };
}

function parseChannel(p: string, unit: boolean): number | null {
  if (p.endsWith('%')) {
    const v = Number.parseFloat(p);
    return Number.isFinite(v) ? clamp((v / 100) * 255, 0, 255) : null;
  }
  const v = Number.parseFloat(p);
  if (!Number.isFinite(v)) return null;
  return clamp(unit ? v * 255 : v, 0, 255);
}

function parseAlpha(p: string): number | null {
  const v = Number.parseFloat(p);
  if (!Number.isFinite(v)) return null;
  return clamp(p.endsWith('%') ? v / 100 : v, 0, 1);
}

function parseHex(h: string): Rgba | null {
  if (!/^[0-9a-f]+$/.test(h)) return null;
  const full =
    h.length === 3 || h.length === 4
      ? [...h].map((c) => c + c).join('')
      : h.length === 6 || h.length === 8
        ? h
        : null;
  if (full === null) return null;
  const n = (i: number): number => Number.parseInt(full.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
}

/** `top` composited over `bottom` (standard "over" operator). */
export function compositeOver(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number): number => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

/**
 * Flattens a stack of backgrounds (nearest ancestor first) down to the canvas.
 * `canvas` is the colour behind everything (white for browsers' default).
 */
export function flattenBackgrounds(
  nearestFirst: readonly Rgba[],
  canvas: Rgba = { r: 255, g: 255, b: 255, a: 1 },
): Rgba {
  let acc: Rgba = canvas;
  for (let i = nearestFirst.length - 1; i >= 0; i--) {
    acc = compositeOver(nearestFirst[i] as Rgba, acc);
  }
  return { ...acc, a: 1 };
}

function lin(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0..1. */
export function relativeLuminance(c: Pick<Rgba, 'r' | 'g' | 'b'>): number {
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio, 1..21, of two opaque colours. */
export function contrastRatio(
  a: Pick<Rgba, 'r' | 'g' | 'b'>,
  b: Pick<Rgba, 'r' | 'g' | 'b'>,
): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Ink at opacity `alpha` over `bg`. */
export function blend(ink: Rgba, bg: Rgba, alpha: number): Rgba {
  const mix = (i: number, b: number): number => i * alpha + b * (1 - alpha);
  return { r: mix(ink.r, bg.r), g: mix(ink.g, bg.g), b: mix(ink.b, bg.b), a: 1 };
}

export interface FadeSolution {
  /** Opacity to set on the paragraph element (1 = untouched). */
  opacity: number;
  /** Native contrast of ink on background. */
  native: number;
  /** Contrast after the fade. */
  result: number;
  /** The target that was asked for. */
  target: number;
  /** False when the paragraph is already at or below the target and must not be faded. */
  faded: boolean;
}

/**
 * Binary-searches the opacity α ∈ [0, 1] so that `contrast(blend(ink, bg, α), bg) = target`.
 * `ink` may carry alpha (it is composited over `bg` first). `bg` must be opaque.
 */
export function solveOpacity(ink: Rgba, bg: Rgba, target: number): FadeSolution {
  const solidInk = ink.a < 1 ? compositeOver(ink, { ...bg, a: 1 }) : ink;
  const native = contrastRatio(solidInk, bg);
  if (native <= target) {
    return { opacity: 1, native, result: native, target, faded: false };
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const c = contrastRatio(blend(solidInk, bg, mid), bg);
    if (c >= target) hi = mid;
    else lo = mid;
  }
  const opacity = Math.round(hi * 1000) / 1000;
  return {
    opacity,
    native,
    result: contrastRatio(blend(solidInk, bg, opacity), bg),
    target,
    faded: true,
  };
}

export function contrastTarget(tier: FadeTier, strength: FadeStrength): number {
  return CONTRAST_TARGETS[strength][tier];
}

/** Solves the fade for a tier and strength. */
export function solveFade(
  ink: Rgba,
  bg: Rgba,
  tier: FadeTier,
  strength: FadeStrength = 'standard',
): FadeSolution {
  return solveOpacity(ink, bg, contrastTarget(tier, strength));
}

/** True when the page area is dark enough that the overlay should use its dark tokens. */
export function isDarkBackground(bg: Rgba): boolean {
  return relativeLuminance(bg) < DARK_LUMINANCE_THRESHOLD;
}
