/**
 * Reads a paragraph's resolved ink and the background it sits on, then asks the contrast-floor
 * solver for the opacity that lands the faded text exactly on its tier target (SPEC F8).
 */
import type { FadeSolution, FadeStrength, FadeTier, Rgba } from '../paint/contrastFloor';
import {
  FALLBACK_OPACITY,
  flattenBackgrounds,
  isDarkBackground,
  parseCssColor,
  solveFade,
} from '../paint/contrastFloor';

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

export interface Surface {
  /** Flattened, opaque background colour. */
  bg: Rgba;
  /** True when an image or gradient sits behind the text, so the colour is only a guess. */
  solid: boolean;
}

function backgroundsAbove(el: Element, view: Window): { layers: Rgba[]; solid: boolean } {
  const layers: Rgba[] = [];
  let solid = true;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const cs = view.getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') solid = false;
    const c = parseCssColor(cs.backgroundColor);
    if (c && c.a > 0) {
      layers.push(c);
      if (c.a >= 1) return { layers, solid };
    }
  }
  const canvas = parseCssColor(
    view.getComputedStyle(el.ownerDocument.documentElement).backgroundColor,
  );
  if (canvas && canvas.a > 0) layers.push(canvas);
  return { layers, solid };
}

export function surfaceOf(el: Element): Surface {
  const view = el.ownerDocument.defaultView as Window;
  const { layers, solid } = backgroundsAbove(el, view);
  return { bg: flattenBackgrounds(layers, WHITE), solid };
}

export function inkOf(el: Element): Rgba {
  const view = el.ownerDocument.defaultView as Window;
  return parseCssColor(view.getComputedStyle(el).color) ?? { r: 0, g: 0, b: 0, a: 1 };
}

/** The opacity for a faded paragraph; `fallback` is true on non-solid backgrounds. */
export function fadeFor(
  el: Element,
  tier: FadeTier,
  strength: FadeStrength,
): FadeSolution & { fallback: boolean } {
  const { bg, solid } = surfaceOf(el);
  const solved = solveFade(inkOf(el), bg, tier, strength);
  if (solid) return { ...solved, fallback: false };
  const opacity = FALLBACK_OPACITY[tier];
  return { ...solved, opacity, faded: true, fallback: true };
}

/** Light or dark overlay tokens, chosen from the article's own background. */
export function themeOf(el: Element): 'light' | 'dark' {
  return isDarkBackground(surfaceOf(el).bg) ? 'dark' : 'light';
}
