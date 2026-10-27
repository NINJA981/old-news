/**
 * Paints the contrast floor: for each faded paragraph, asks the engine's solver (`solveFade`) for
 * the opacity that lands the text on its tier's target (4.6:1 seen, 7:1 similar; light strength
 * 7:1 and 10:1) against the sheet's own background, from the colours the browser computed.
 */
import type { FadeStrength } from '@engine';
import { FALLBACK_OPACITY, parseCssColor, solveFade } from '@engine';

export function applyFloors(root: HTMLElement, strength: FadeStrength): void {
  const bg = parseCssColor(getComputedStyle(root).backgroundColor);
  for (const p of root.querySelectorAll<HTMLElement>('.on-p[data-a]')) {
    const row = p.closest<HTMLElement>('.on-row');
    const tier = row?.dataset['tier'];
    if (tier !== 'seen' && tier !== 'similar') continue;
    const ink = parseCssColor(getComputedStyle(p).color);
    const a =
      bg && ink && bg.a === 1 ? solveFade(ink, bg, tier, strength).opacity : FALLBACK_OPACITY[tier];
    p.dataset['a'] = String(a);
    p.style.setProperty('--a', String(a));
  }
}
