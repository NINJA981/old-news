/** URL helpers for article identity. Pure (uses the WHATWG URL class, available everywhere). */

const TRACKING_PARAMS =
  /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref|ref_src|cmpid|ito|smid|s_cid|ncid|ocid|taid|share|sharesource|output)$/i;

/**
 * Canonical form of an article URL: lower-case host, no fragment, no default port,
 * no tracking parameters, remaining parameters sorted, no trailing slash on non-root paths.
 * Returns the input unchanged when it is not a valid http(s) URL.
 */
export function canonicalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return input;
  url.hash = '';
  url.hostname = url.hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/^amp\./, '');
  const keep = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [k, v] of keep) url.searchParams.append(k, v);
  let path = url.pathname.replace(/\/amp\/?$/, '/').replace(/\.amp(\.html)?$/, '$1');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  url.pathname = path;
  return url.toString();
}

/** "calder-courier.example" from a URL, without "www.". Empty string for invalid input. */
export function hostnameOf(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Origin of a URL ("https://calder-courier.example"), or "" for invalid input. */
export function originOf(input: string): string {
  try {
    return new URL(input).origin;
  } catch {
    return '';
  }
}
