/** Hashing helpers. Pure; `sha256Hex` uses Web Crypto, which exists in browsers, workers and Node >= 19. */

/** MurmurHash3 finaliser: a fast, well-mixed 32-bit permutation. */
export function fmix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** MurmurHash3 (x86, 32-bit) over the UTF-16 code units of `input`. Deterministic across runtimes. */
export function hash32(input: string, seed = 0): number {
  let h = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const len = input.length;
  let i = 0;
  for (; i + 1 < len; i += 2) {
    let k = (input.charCodeAt(i) & 0xffff) | ((input.charCodeAt(i + 1) & 0xffff) << 16);
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  if (i < len) {
    let k = input.charCodeAt(i) & 0xffff;
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
  }
  h ^= len * 2;
  return fmix32(h);
}

/** Small deterministic PRNG (mulberry32) for reproducible hash-family seeds. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Lower-case hex SHA-256 of the UTF-8 encoding of `input`. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let out = '';
  for (const b of digest) out += HEX[b];
  return out;
}
