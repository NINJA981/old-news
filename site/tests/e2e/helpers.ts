/** Shared helpers for the site e2e: request recording and the "static assets only" assertion. */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Request } from '@playwright/test';

export const ORIGIN = 'http://localhost:4391';
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');

/** Every file the production build publishes, as URL paths ("/assets/x.js"). */
export function distPaths(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        out.add(
          '/' +
            full
              .slice(DIST.length + 1)
              .split(sep)
              .join('/'),
        );
    }
  };
  if (existsSync(DIST)) walk(DIST);
  return out;
}

export interface Recorded {
  url: string;
  method: string;
  type: string;
  hasBody: boolean;
}

export interface RequestLog {
  all: () => Recorded[];
  /** Requests that are not a GET of one of this build's own static files. */
  violations: () => string[];
  /** Requests for the optional 23 MB model (only allowed after the reader opts in). */
  modelRequests: () => string[];
  sockets: () => number;
}

/** Records every request (including service worker fetches) made by this page's context. */
export function recordRequests(page: Page): RequestLog {
  const files = distPaths();
  const seen: Recorded[] = [];
  let sockets = 0;
  const onRequest = (r: Request): void => {
    seen.push({
      url: r.url(),
      method: r.method(),
      type: r.resourceType(),
      hasBody: r.postData() !== null,
    });
  };
  page.context().on('request', onRequest);
  page.on('websocket', () => sockets++);
  const isStatic = (r: Recorded): boolean => {
    if (/^(data|blob|about):/.test(r.url)) return true;
    const u = new URL(r.url);
    if (u.origin !== ORIGIN) return false;
    if (r.method !== 'GET' || r.hasBody) return false;
    const path = u.pathname.endsWith('/') ? `${u.pathname}index.html` : u.pathname;
    return files.has(path);
  };
  return {
    all: () => seen,
    violations: () => seen.filter((r) => !isStatic(r)).map((r) => `${r.method} ${r.url}`),
    modelRequests: () =>
      seen.filter((r) => /\/(models|ort)\//.test(new URL(r.url).pathname)).map((r) => r.url),
    sockets: () => sockets,
  };
}

/** A paragraph long enough for the engine to compare (60+ characters). */
export const P = (s: string): string =>
  `${s} said officials on Tuesday, in a statement that ran to more than sixty characters.`;

export const ARTICLE_A = [
  P(
    'A fire tore through the Harbour Street warehouse late on Sunday, closing two roads, officials',
  ),
  P('Twelve people were treated for smoke inhalation after the blaze at the warehouse, officials'),
  P(
    'At least forty firefighters were sent to the scene and the fire took six hours to bring under control, crews',
  ),
];

export const ARTICLE_B = [
  P(
    'Council leaders promised a full review of the warehouse licensing rules after the blaze, a spokesperson',
  ),
  P(
    'Fourteen people were treated for smoke inhalation after the blaze at the warehouse, officials',
  ),
  P(
    'At least forty firefighters were sent to the scene and the fire took six hours to bring under control, crews',
  ),
];

export const joinParas = (paras: string[]): string => paras.join('\n\n');

export const asHtml = (title: string, paras: string[]): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>` +
  `<meta property="og:site_name" content="Saved Page"></head><body><nav>Home News Sport</nav>` +
  `<article><h1>${title}</h1>${paras.map((p) => `<p>${p}</p>`).join('')}</article>` +
  `<footer>Contact us</footer></body></html>`;
