/**
 * Pure placement maths for the overlay: where a provenance tag goes, and the dissolve schedule.
 * No DOM here, so the rules in DESIGN.md can be tested with plain numbers.
 */

export const EDGE = 16;
export const TAG_GAP = 12;
/** Minimum gutter (px) beside a paragraph before a tag is drawn there. */
export const MIN_GUTTER = 140;

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type TagMode = 'right' | 'left' | 'dot' | 'hover';

export interface TagPlacement {
  mode: TagMode;
  /** Viewport x of the tag (right/left) or of the dot (dot). */
  x: number;
}

/**
 * First that fits (DESIGN.md provenance-tag):
 *  1. right gutter of at least MIN_GUTTER, tag top-aligned to the first line;
 *  2. left gutter, same rule;
 *  3. dot mode: an 8 px dot 12 px outside the paragraph's left edge;
 *  4. no gutter at all: the tag appears on paragraph hover only.
 * `free(x, width)` says whether that horizontal band is clear of other page content.
 */
export function placeTag(
  para: Box,
  tagWidth: number,
  viewportWidth: number,
  free: (x: number, width: number) => boolean = () => true,
): TagPlacement {
  const rightX = para.right + TAG_GAP;
  const rightRoom = viewportWidth - EDGE - rightX;
  if (rightRoom >= Math.max(MIN_GUTTER, tagWidth) && free(rightX, tagWidth)) {
    return { mode: 'right', x: rightX };
  }
  const leftX = para.left - TAG_GAP - tagWidth;
  const leftRoom = para.left - TAG_GAP - EDGE;
  if (leftRoom >= Math.max(MIN_GUTTER, tagWidth) && free(leftX, tagWidth)) {
    return { mode: 'left', x: leftX };
  }
  if (para.left - 12 - 8 >= 4) return { mode: 'dot', x: para.left - 12 - 8 };
  return { mode: 'hover', x: para.left };
}

/** Clamp a floating box's left edge into [min, max]; max wins when the box is wider than the room. */
export function clampX(x: number, width: number, minX: number, maxX: number): number {
  return Math.max(minX, Math.min(x, maxX - width));
}

export interface DissolveItem {
  /** Index among the faded paragraphs, document order. */
  index: number;
  /** True when the paragraph is within the viewport plus one screen (animated). */
  inRange: boolean;
}

export interface DissolveStep {
  index: number;
  /** ms from t=0 when this paragraph's fade starts; 0 for instant ones. */
  start: number;
  animate: boolean;
}

export const DISSOLVE = {
  para: 240,
  spread: 160,
  staggerMax: 16,
  tagLead: 180,
  tagFade: 150,
  settle: 400,
  pulseStart: 420,
  chipStart: 520,
  chipRise: 200,
  pulseEnd: 1620,
  reduced: 150,
} as const;

/** Stagger = min(16, 160 / (n - 1)) ms between starts (DESIGN.md frame table). */
export function stagger(animated: number): number {
  return animated <= 1 ? 0 : Math.min(DISSOLVE.staggerMax, DISSOLVE.spread / (animated - 1));
}

/** Start time of every faded paragraph. Off-screen ones are set instantly at t=0. */
export function planDissolve(items: readonly DissolveItem[]): DissolveStep[] {
  const animated = items.filter((i) => i.inRange).length;
  const gap = stagger(animated);
  let k = 0;
  return items.map((i) =>
    i.inRange
      ? { index: i.index, start: k++ * gap, animate: true }
      : { index: i.index, start: 0, animate: false },
  );
}

/** The dissolve plays only when at least three paragraphs fade within the viewport plus one screen. */
export function shouldDissolve(inRangeFaded: number, enabled: boolean, reduced: boolean): boolean {
  return enabled && !reduced && inRangeFaded >= 3;
}

/** Pill number at time t: counts down from total, one per faded paragraph that has started. */
export function countAt(t: number, total: number, starts: readonly number[]): number {
  let n = total;
  for (const s of starts) if (s <= t) n--;
  return n;
}

/**
 * Keyframes of the drift pulse as [offset, opacity] over DISSOLVE.pulseStart..pulseEnd
 * (rise 0.9, fall to 0.35, rise 0.9, settle to rest).
 */
export function pulseFrames(rest: number): [number, number][] {
  const len = DISSOLVE.pulseEnd - DISSOLVE.pulseStart;
  return [
    [0, 0],
    [180 / len, 0.9],
    [600 / len, 0.35],
    [780 / len, 0.9],
    [1, rest],
  ];
}
