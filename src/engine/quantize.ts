/**
 * Symmetric int8 quantisation for 384-d unit vectors (SPEC §7: `vec` Int8Array + `vecScale`).
 * Cosine on int8 vectors is computed exactly from the integer dot product and norms,
 * so the per-vector scale cancels out and matching never needs to dequantise.
 */

export interface QuantizedVector {
  q: Int8Array;
  scale: number;
}

export function quantize(v: ArrayLike<number>): QuantizedVector {
  let maxAbs = 0;
  for (let i = 0; i < v.length; i++) maxAbs = Math.max(maxAbs, Math.abs(v[i] as number));
  const q = new Int8Array(v.length);
  if (maxAbs === 0) return { q, scale: 0 };
  const scale = maxAbs / 127;
  for (let i = 0; i < v.length; i++) {
    q[i] = Math.max(-127, Math.min(127, Math.round((v[i] as number) / scale)));
  }
  return { q, scale };
}

export function dequantize({ q, scale }: QuantizedVector): Float32Array {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = (q[i] as number) * scale;
  return out;
}

/** Squared L2 norm of an int8 vector, as an integer. */
export function normSq8(q: Int8Array): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] as number;
    s += x * x;
  }
  return s;
}

/** Cosine of two int8 vectors. Pass precomputed squared norms when scanning many vectors. */
export function cosine8(
  a: Int8Array,
  b: Int8Array,
  aNormSq = normSq8(a),
  bNormSq = normSq8(b),
): number {
  if (aNormSq === 0 || bNormSq === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] as number) * (b[i] as number);
  return dot / Math.sqrt(aNormSq * bNormSq);
}

/** Cosine of two float vectors. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** L2-normalised mean of vectors: the article centroid. Returns null for an empty list. */
export function centroid(vectors: readonly ArrayLike<number>[]): Float32Array | null {
  const first = vectors[0];
  if (!first) return null;
  const out = new Float32Array(first.length);
  for (const v of vectors)
    for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) + (v[i] as number);
  let n = 0;
  for (let i = 0; i < out.length; i++) n += (out[i] as number) ** 2;
  n = Math.sqrt(n);
  if (n === 0) return out;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) / n;
  return out;
}
