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

/**
 * Pill number at time t: counts down from total, one per tick that has passed. Strictly after the
 * tick, so frame 0 always reads "23 of 23" while every paragraph is still in full ink.
 */
export function countAt(t: number, total: number, ticks: readonly number[]): number {
  let n = total;
  for (const s of ticks) if (s < t) n--;
  return n;
}

/**
 * When the pill's number ticks down, one tick per faded paragraph. An animated paragraph ticks as
 * its fade starts. Paragraphs set instantly (below the viewport plus one screen) cannot be seen, so
 * their ticks are spread evenly over the settle window after the last animated start, and the
 * countdown still reaches the real count before "Only" arrives. Deterministic for a given plan.
 */
export function countTicks(steps: readonly DissolveStep[]): number[] {
  const animated = steps.filter((s) => s.animate).map((s) => s.start);
  const instant = steps.length - animated.length;
  const from = Math.max(0, ...animated);
  const to = Math.max(from, DISSOLVE.settle - 20);
  const extra = Array.from(
    { length: instant },
    (_, k) => from + ((k + 1) * (to - from)) / (instant + 1),
  );
  return [...animated, ...extra];
}

// ---- Drift chips ------------------------------------------------------------------------------

/** Drift chip height: caption 12/16 plus 2 px padding, the same 20 px as a provenance tag. */
export const CHIP_H = 20;
/** Gap kept between a chip and the text it must not touch. */
export const CHIP_CLEAR = 3;

export type ChipMode = 'above' | 'right' | 'below' | 'hover';

export interface ChipSpace {
  /** Free px between the token's top and the nearest text above it. */
  above: number;
  /** Free px between the token's bottom and the nearest text below it. */
  below: number;
}

export interface ChipPlacement {
  mode: ChipMode;
  /** Viewport position of each chip, in order. */
  boxes: { x: number; y: number }[];
}

/**
 * Where a paragraph's drift chips go, first that fits, so a chip never covers text:
 *  1. above the token (DESIGN.md: 6 px above it), when the gap to the line above holds a chip;
 *  2. the right gutter, level with the token's line, chips stacked downwards;
 *  3. below the token, when it sits on the last line and the gap below holds a chip;
 *  4. hover: positioned as in 1 but shown only while the paragraph or the chip has hover or focus.
 * `widths` are the measured chip widths; `free(x, w)` says whether the gutter is clear of page content.
 */
export function placeChips(
  token: Box,
  para: Box,
  widths: readonly number[],
  space: ChipSpace,
  viewportWidth: number,
  free: (x: number, width: number) => boolean = () => true,
): ChipPlacement {
  const gap = 6;
  const row = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, widths.length - 1);
  const across = (y: number): { x: number; y: number }[] => {
    let x = clampX(token.left, row, 8, viewportWidth - 8);
    return widths.map((w) => {
      const box = { x, y };
      x += w + gap;
      return box;
    });
  };
  const need = CHIP_H + 2 + CHIP_CLEAR;
  if (space.above >= need && row <= viewportWidth - 16) {
    const lift = Math.min(6, space.above - CHIP_H - CHIP_CLEAR);
    return { mode: 'above', boxes: across(token.top - lift - CHIP_H) };
  }
  const rightX = para.right + TAG_GAP;
  const widest = Math.max(0, ...widths);
  if (viewportWidth - EDGE - rightX >= widest && free(rightX, widest)) {
    const top = token.top + (token.bottom - token.top - CHIP_H) / 2;
    return {
      mode: 'right',
      boxes: widths.map((_, i) => ({ x: rightX, y: top + i * (CHIP_H + gap) })),
    };
  }
  if (space.below >= need && row <= viewportWidth - 16) {
    const drop = Math.min(6, space.below - CHIP_H - CHIP_CLEAR);
    return { mode: 'below', boxes: across(token.bottom + drop) };
  }
  return { mode: 'hover', boxes: across(token.top - 6 - CHIP_H) };
}

/** True when two viewport rectangles overlap (used to hide marks under the pill and tray). */
export function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
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
