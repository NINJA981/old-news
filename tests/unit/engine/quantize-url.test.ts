import { describe, expect, it } from 'vitest';
import { fakeEmbed } from '../../../src/engine/fakeEmbedder';
import { mulberry32 } from '../../../src/engine/hash';
import {
  centroid,
  cosine,
  cosine8,
  dequantize,
  normSq8,
  quantize,
} from '../../../src/engine/quantize';
import { canonicalizeUrl, hostnameOf, originOf } from '../../../src/engine/url';

function randomUnit(seed: number, dim = 384): Float32Array {
  const r = mulberry32(seed);
  const v = new Float32Array(dim);
  let n = 0;
  for (let i = 0; i < dim; i++) {
    // Box-Muller gaussian
    const g = Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    v[i] = g;
    n += g * g;
  }
  n = Math.sqrt(n);
  for (let i = 0; i < dim; i++) v[i] = (v[i] as number) / n;
  return v;
}

describe('int8 quantisation', () => {
  it('round-trips with small error', () => {
    const v = randomUnit(1);
    const back = dequantize(quantize(v));
    let maxErr = 0;
    for (let i = 0; i < v.length; i++)
      maxErr = Math.max(maxErr, Math.abs((v[i] as number) - (back[i] as number)));
    expect(maxErr).toBeLessThan(quantize(v).scale);
  });
  it('keeps cosine drift <= 0.01 (ADR §8), over 200 random pairs', () => {
    let worst = 0;
    for (let s = 0; s < 200; s++) {
      const a = randomUnit(s * 2 + 1);
      // Mix towards a so the pairs cover a range of similarities.
      const b0 = randomUnit(s * 2 + 2);
      const mix = (s % 10) / 10;
      const b = new Float32Array(384).map(
        (_, i) => mix * (a[i] as number) + (1 - mix) * (b0[i] as number),
      );
      const exact = cosine(a, b);
      const approx = cosine8(quantize(a).q, quantize(b).q);
      worst = Math.max(worst, Math.abs(exact - approx));
    }
    expect(worst).toBeLessThanOrEqual(0.01);
  });
  it('handles zero vectors', () => {
    const z = quantize(new Float32Array(4));
    expect(z.scale).toBe(0);
    expect(normSq8(z.q)).toBe(0);
    expect(cosine8(z.q, z.q)).toBe(0);
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });
  it('computes a normalised centroid', () => {
    const c = centroid([fakeEmbed('fire at the port'), fakeEmbed('fire in the warehouse')]);
    expect(c).not.toBeNull();
    let n = 0;
    for (const x of c!) n += x * x;
    expect(Math.sqrt(n)).toBeCloseTo(1, 5);
    expect(centroid([])).toBeNull();
  });
});

describe('canonicalizeUrl', () => {
  it('drops fragments, tracking params, www and trailing slashes', () => {
    expect(
      canonicalizeUrl(
        'https://WWW.Calder-Courier.example/news/fire/?utm_source=x&b=2&a=1&fbclid=z#top',
      ),
    ).toBe('https://calder-courier.example/news/fire?a=1&b=2');
  });
  it('folds AMP variants onto the article URL', () => {
    expect(canonicalizeUrl('https://amp.morrow-daily.example/story/fire/amp/')).toBe(
      'https://morrow-daily.example/story/fire',
    );
    expect(canonicalizeUrl('https://morrow-daily.example/story/fire.amp.html')).toBe(
      'https://morrow-daily.example/story/fire.html',
    );
  });
  it('keeps the root path and non-http URLs unchanged', () => {
    expect(canonicalizeUrl('https://fenwick-wire.example/')).toBe('https://fenwick-wire.example/');
    expect(canonicalizeUrl('chrome://extensions')).toBe('chrome://extensions');
    expect(canonicalizeUrl('not a url')).toBe('not a url');
  });
  it('extracts hostnames and origins', () => {
    expect(hostnameOf('https://www.fenwick-wire.example/a')).toBe('fenwick-wire.example');
    expect(hostnameOf('nope')).toBe('');
    expect(originOf('https://fenwick-wire.example:8443/a')).toBe(
      'https://fenwick-wire.example:8443',
    );
    expect(originOf('nope')).toBe('');
  });
});
