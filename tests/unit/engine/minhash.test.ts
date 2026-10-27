import { describe, expect, it } from 'vitest';
import { fmix32, hash32, mulberry32, sha256Hex } from '../../../src/engine/hash';
import { BANDS, BandIndex, bandKeys, candidateProbability, ROWS } from '../../../src/engine/lsh';
import { jaccardEstimate, minhash, NUM_PERM } from '../../../src/engine/minhash';
import { exactJaccard, shingleHashes, shingles } from '../../../src/engine/shingle';

describe('hash32', () => {
  it('is deterministic and seed-dependent', () => {
    expect(hash32('port alder')).toBe(hash32('port alder'));
    expect(hash32('port alder', 1)).not.toBe(hash32('port alder', 2));
    expect(hash32('a')).not.toBe(hash32('b'));
  });
  it('returns unsigned 32-bit integers', () => {
    for (const s of ['', 'x', 'warehouse fire', '€4.5m']) {
      const h = hash32(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
    expect(fmix32(-1)).toBeGreaterThanOrEqual(0);
  });
  it('mulberry32 is reproducible', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('sha256Hex matches the known vector for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('shingles', () => {
  it('produces 5-word shingles', () => {
    expect(shingles('one two three four five six')).toEqual([
      'one two three four five',
      'two three four five six',
    ]);
  });
  it('yields one shingle for short text and none for empty text', () => {
    expect(shingles('just three words')).toEqual(['just three words']);
    expect(shingles('')).toEqual([]);
  });
  it('is case- and punctuation-insensitive', () => {
    expect([...shingleHashes('The Fire, at the PORT!')]).toEqual([
      ...shingleHashes('the fire at the port'),
    ]);
  });
});

/** Two word lists with a controlled overlap, for estimate-error checks. */
function pair(seed: number, total: number, shared: number): [string, string] {
  const rand = mulberry32(seed);
  const word = () => `w${Math.floor(rand() * 1e9).toString(36)}`;
  const common = Array.from({ length: shared }, word);
  const a = [...common, ...Array.from({ length: total - shared }, word)];
  const b = [...common, ...Array.from({ length: total - shared }, word)];
  return [a.join(' '), b.join(' ')];
}

describe('minhash', () => {
  it(`has ${NUM_PERM} slots and is deterministic`, () => {
    const s = minhash(shingleHashes('the warehouse fire burned for six hours on tuesday night'));
    expect(s).toHaveLength(NUM_PERM);
    expect([...s]).toEqual([
      ...minhash(shingleHashes('the warehouse fire burned for six hours on tuesday night')),
    ]);
  });
  it('gives 1 for identical text and ~0 for unrelated text', () => {
    const a = minhash(
      shingleHashes('firefighters battled the blaze at the port alder warehouse for six hours'),
    );
    const b = minhash(
      shingleHashes('the city council voted to approve the new budget after a long debate tonight'),
    );
    expect(jaccardEstimate(a, a)).toBe(1);
    expect(jaccardEstimate(a, b)).toBeLessThan(0.05);
  });
  it('treats empty signatures as non-matching', () => {
    const e = minhash(new Uint32Array());
    expect(jaccardEstimate(e, e)).toBe(0);
  });
  // At 128 permutations the estimator's standard deviation is sqrt(J(1-J)/128) <= 0.044, so an
  // error bound of 0.1 is about 2.3 sigma. Measured over 2,000 pairs: mean 0.029, p95 0.076,
  // normalised variance 0.99 (i.e. the hash family behaves like ideal random permutations).
  it('estimates Jaccard within 0.1 for >= 95% of pairs, mean error <= 0.05 (property test, 300 pairs)', () => {
    const errors: number[] = [];
    for (let seed = 1; seed <= 300; seed++) {
      const shared = 10 + ((seed * 7) % 50);
      const [ta, tb] = pair(seed, 60, shared);
      const ha = shingleHashes(ta);
      const hb = shingleHashes(tb);
      errors.push(Math.abs(exactJaccard(ha, hb) - jaccardEstimate(minhash(ha), minhash(hb))));
    }
    errors.sort((a, b) => a - b);
    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    expect(mean).toBeLessThanOrEqual(0.05);
    expect(errors[Math.floor(errors.length * 0.95)]).toBeLessThanOrEqual(0.1);
    expect(errors[errors.length - 1]).toBeLessThan(0.2);
  });
});

describe('LSH', () => {
  it(`uses ${BANDS} bands of ${ROWS} rows`, () => {
    expect(BANDS * ROWS).toBe(NUM_PERM);
    const keys = bandKeys(minhash(shingleHashes('a b c d e f g h')));
    expect(keys).toHaveLength(BANDS);
    expect(new Set(keys).size).toBe(BANDS);
  });
  it('candidate probability is high at J=0.6 and modest at J=0.35', () => {
    expect(candidateProbability(0.6)).toBeGreaterThan(0.98);
    expect(candidateProbability(0.35)).toBeLessThan(0.5);
    expect(candidateProbability(0.1)).toBeLessThan(0.01);
  });
  it('finds a lightly edited copy and not an unrelated paragraph', () => {
    const idx = new BandIndex();
    const original =
      'Firefighters battled the blaze at the Port Alder warehouse for six hours on Tuesday before bringing it under control, the fire service said.';
    const edited =
      'Firefighters battled the blaze at the Port Alder warehouse for six hours on Tuesday before bringing it under control, fire officials said.';
    const other =
      'The council approved a revised budget that adds two new bus routes and closes a library branch.';
    idx.add('orig', bandKeys(minhash(shingleHashes(original))));
    idx.add('other', bandKeys(minhash(shingleHashes(other))));
    const hits = idx.candidates(bandKeys(minhash(shingleHashes(edited))));
    expect(hits.has('orig')).toBe(true);
    expect(hits.has('other')).toBe(false);
  });
  it('removes ids and empties buckets', () => {
    const idx = new BandIndex();
    const keys = bandKeys(minhash(shingleHashes('one two three four five six seven')));
    idx.add('x', keys);
    expect(idx.bucketCount).toBe(BANDS);
    idx.remove('x', keys);
    expect(idx.bucketCount).toBe(0);
    expect(idx.candidates(keys).size).toBe(0);
  });
});
