/**
 * The ONLY module allowed to call fetch (SPEC §8, ESLint override). It loads bundled assets
 * (model files, ORT wasm, fonts) and refuses anything that is not an extension-origin URL.
 * The web app opts in to its own origin explicitly; it never gets arbitrary remote URLs.
 */

const EXTENSION_PROTOCOLS: ReadonlySet<string> = new Set(['chrome-extension:', 'moz-extension:']);

export interface LocalUrlOptions {
  /**
   * Also allow same-origin http(s) URLs relative to this origin (the static web app serving its
   * own bundled model). Extensions never set this.
   */
  sameOrigin?: string;
}

/** Throws unless `url` is an extension-origin URL (or, when opted in, same-origin). */
export function assertLocalUrl(url: string, opts: LocalUrlOptions = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Refusing to load a non-absolute asset URL.');
  }
  if (EXTENSION_PROTOCOLS.has(parsed.protocol)) return parsed;
  if (opts.sameOrigin !== undefined && parsed.origin === opts.sameOrigin) return parsed;
  throw new Error(`Refusing to load a non-local asset (${parsed.protocol}//${parsed.host}).`);
}

/** Fetches a bundled asset. Network access beyond the extension package is impossible here. */
export async function fetchLocalAsset(url: string, opts: LocalUrlOptions = {}): Promise<Response> {
  const safe = assertLocalUrl(url, opts);
  const res = await fetch(safe.href, { credentials: 'omit', cache: 'force-cache' });
  if (!res.ok) throw new Error(`Bundled asset missing (${res.status}): ${safe.pathname}`);
  return res;
}

export async function fetchLocalBytes(
  url: string,
  opts: LocalUrlOptions = {},
): Promise<Uint8Array> {
  return new Uint8Array(await (await fetchLocalAsset(url, opts)).arrayBuffer());
}

/** base64 of bytes, chunked so large font files do not overflow the argument limit. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
