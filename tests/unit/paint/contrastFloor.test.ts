import { describe, expect, it } from 'vitest';
import {
  blend,
  compositeOver,
  contrastRatio,
  flattenBackgrounds,
  isDarkBackground,
  parseCssColor,
  relativeLuminance,
  solveFade,
  solveOpacity,
} from '../../../src/paint/contrastFloor';
import type { Rgba } from '../../../src/paint/contrastFloor';

const hex = (h: string): Rgba => parseCssColor(h) as Rgba;
const WHITE = hex('#ffffff');
const BLACK = hex('#000000');

describe('parseCssColor', () => {
  it('parses computed-style rgb and rgba in both syntaxes', () => {
    expect(parseCssColor('rgb(18, 18, 18)')).toEqual({ r: 18, g: 18, b: 18, a: 1 });
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor('rgb(18 18 18 / 50%)')).toEqual({ r: 18, g: 18, b: 18, a: 0.5 });
  });

  it('parses hex, transparent and color(srgb)', () => {
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor('#11223380')?.a).toBeCloseTo(128 / 255, 5);
    expect(parseCssColor('transparent')?.a).toBe(0);
    expect(parseCssColor('color(srgb 1 0.5 0 / 0.25)')).toEqual({
      r: 255,
      g: 127.5,
      b: 0,
      a: 0.25,
    });
  });

  it('returns null for what it cannot read', () => {
    expect(parseCssColor('oklch(0.5 0.1 200)')).toBeNull();
    expect(parseCssColor('red')).toBeNull();
    expect(parseCssColor('#12')).toBeNull();
    expect(parseCssColor('rgb(1, 2)')).toBeNull();
    expect(parseCssColor('color(display-p3 1 0 0)')).toBeNull();
  });
});

describe('contrast maths', () => {
  it('black on white is 21:1 and identical colours are 1:1', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    const a = hex('#767676');
    expect(contrastRatio(a, WHITE)).toBeCloseTo(contrastRatio(WHITE, a), 10);
  });

  it('matches the published value for #767676 on white (4.54)', () => {
    expect(contrastRatio(hex('#767676'), WHITE)).toBeCloseTo(4.54, 2);
  });

  it('relative luminance spans 0..1', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
  });
});

describe('compositing', () => {
  it('composites a translucent colour over an opaque one', () => {
    const out = compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE);
    expect(out.r).toBeCloseTo(127.5, 5);
    expect(out.a).toBe(1);
  });

  it('flattens a background stack nearest-first down to the canvas', () => {
    const flat = flattenBackgrounds(
      [
        { r: 0, g: 0, b: 0, a: 0 },
        { r: 0, g: 0, b: 0, a: 0.5 },
      ],
      WHITE,
    );
    expect(flat.r).toBeCloseTo(127.5, 5);
    expect(flat.a).toBe(1);
  });

  it('an empty stack is the canvas', () => {
    expect(flattenBackgrounds([], hex('#112233'))).toEqual({ r: 17, g: 34, b: 51, a: 1 });
  });

  it('blend at alpha 1 is the ink and at 0 is the background', () => {
    expect(blend(BLACK, WHITE, 1).r).toBe(0);
    expect(blend(BLACK, WHITE, 0).r).toBe(255);
  });
});

describe('solveFade (AC8.1)', () => {
  const themes: [string, string, string][] = [
    ['light page', '#121212', '#ffffff'],
    ['dark page', '#e8e8e8', '#121212'],
    ['sepia tint', '#2b2118', '#f4ecd8'],
    ['mid blue tint', '#0a1a33', '#cfe0ff'],
    ['dark tint', '#f2efe6', '#1b2a22'],
  ];

  it.each(themes)('seen lands at 4.6:1 (+-0.2) on a %s', (_n, ink, bg) => {
    const s = solveFade(hex(ink), hex(bg), 'seen');
    expect(s.faded).toBe(true);
    expect(s.result).toBeGreaterThanOrEqual(4.5);
    expect(s.result).toBeGreaterThan(4.6 - 0.2);
    expect(s.result).toBeLessThan(4.6 + 0.2);
  });

  it.each(themes)('similar lands at 7:1 (+-0.3) on a %s', (_n, ink, bg) => {
    const s = solveFade(hex(ink), hex(bg), 'similar');
    expect(s.result).toBeGreaterThan(7 - 0.3);
    expect(s.result).toBeLessThan(7 + 0.3);
  });

  it('light strength uses 7:1 for seen and 10:1 for similar', () => {
    const seen = solveFade(BLACK, WHITE, 'seen', 'light');
    const similar = solveFade(BLACK, WHITE, 'similar', 'light');
    expect(seen.result).toBeGreaterThan(6.8);
    expect(seen.result).toBeLessThan(7.2);
    expect(similar.result).toBeGreaterThan(9.7);
    expect(similar.result).toBeLessThan(10.3);
  });

  it('never fades below 4.5:1, whatever the colours', () => {
    for (const [, ink, bg] of themes) {
      expect(solveFade(hex(ink), hex(bg), 'seen').result).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('matches the ADR worked values for #121212 on white', () => {
    const seen = solveFade(hex('#121212'), WHITE, 'seen');
    const similar = solveFade(hex('#121212'), WHITE, 'similar');
    expect(seen.native).toBeGreaterThan(18);
    expect(seen.opacity).toBeGreaterThan(0.55);
    expect(seen.opacity).toBeLessThan(0.62);
    expect(similar.opacity).toBeGreaterThan(0.66);
    expect(similar.opacity).toBeLessThan(0.74);
    expect(similar.opacity).toBeGreaterThan(seen.opacity);
  });

  it('applies no fade when the native contrast is already at or below the target', () => {
    const s = solveOpacity(hex('#777777'), WHITE, 4.6);
    expect(s.native).toBeLessThan(4.6);
    expect(s.faded).toBe(false);
    expect(s.opacity).toBe(1);
  });

  it('composites translucent ink over the background before solving', () => {
    const s = solveFade({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE, 'seen');
    expect(s.native).toBeCloseTo(contrastRatio({ r: 127.5, g: 127.5, b: 127.5 }, WHITE), 6);
    expect(s.faded).toBe(false);
  });

  it('ink equal to the background is never faded', () => {
    expect(solveFade(WHITE, WHITE, 'seen').faded).toBe(false);
  });
});

describe('overlay theme selection', () => {
  it('uses dark tokens under luminance 0.4', () => {
    expect(isDarkBackground(hex('#110e0b'))).toBe(true);
    expect(isDarkBackground(hex('#ffffff'))).toBe(false);
    expect(isDarkBackground(hex('#808080'))).toBe(true); // luminance 0.216
    expect(isDarkBackground(hex('#c0c0c0'))).toBe(false); // luminance 0.527
  });
});
