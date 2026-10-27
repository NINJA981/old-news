/**
 * Article detection signals (ADR-0001 §3 flow 1) and page metadata. Reads the DOM only; no
 * extension APIs, so the same code runs in the content script, the ingest path and tests.
 */
import type { ArticleKind } from '../engine/types';
import { canonicalizeUrl, hostnameOf } from '../engine/url';
import { normalizeText } from '../engine/normalize';

const ARTICLE_TYPES = new Set([
  'article',
  'newsarticle',
  'reportagenewsarticle',
  'analysisnewsarticle',
  'opinionnewsarticle',
  'backgroundnewsarticle',
  'blogposting',
  'socialmediaposting',
  'liveblogposting',
  'techarticle',
  'medicalwebpage',
]);

export interface ArticleSignals {
  ogArticle: boolean;
  /** Lower-cased schema.org @type values found in JSON-LD. */
  jsonLdTypes: Set<string>;
  /** <p> elements with at least 140 characters of text. */
  longParagraphs: number;
}

function collectTypes(node: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectTypes(n, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  if (typeof t === 'string') out.add(t.toLowerCase());
  else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') out.add(x.toLowerCase());
  if (obj['@graph']) collectTypes(obj['@graph'], out, depth + 1);
  if (obj['mainEntity']) collectTypes(obj['mainEntity'], out, depth + 1);
}

/** schema.org types declared in the page's JSON-LD blocks. Malformed blocks are ignored. */
export function jsonLdTypes(doc: Document): Set<string> {
  const out = new Set<string>();
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      collectTypes(JSON.parse(s.textContent ?? ''), out);
    } catch {
      // Malformed JSON-LD is common; it simply contributes no signal.
    }
  }
  return out;
}

function meta(doc: Document, key: string): string {
  const el =
    doc.querySelector(`meta[property="${key}"]`) ?? doc.querySelector(`meta[name="${key}"]`);
  return el?.getAttribute('content')?.trim() ?? '';
}

export function articleSignals(doc: Document): ArticleSignals {
  let longParagraphs = 0;
  for (const p of doc.querySelectorAll('p')) {
    if (normalizeText(p.textContent ?? '').length >= 140) longParagraphs++;
  }
  return {
    ogArticle: meta(doc, 'og:type').toLowerCase() === 'article',
    jsonLdTypes: jsonLdTypes(doc),
    longParagraphs,
  };
}

/** Any of: og:type=article; an article-like JSON-LD type; or >= 5 paragraphs of >= 140 chars. */
export function hasArticleSignal(s: ArticleSignals): boolean {
  if (s.ogArticle) return true;
  for (const t of s.jsonLdTypes) if (ARTICLE_TYPES.has(t)) return true;
  return s.longParagraphs >= 5;
}

export function articleKind(s: ArticleSignals): ArticleKind {
  if (s.jsonLdTypes.has('liveblogposting')) return 'liveblog';
  if (s.jsonLdTypes.has('blogposting')) return 'blog';
  return 'news';
}

export interface PageInfo {
  url: string;
  canonicalUrl: string;
  siteName: string;
  title: string;
}

/** URL, canonical URL, outlet name and title. `url` is the page's location href. */
export function pageInfo(doc: Document, url: string): PageInfo {
  const canonicalHref =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? meta(doc, 'og:url');
  let canonical = url;
  if (canonicalHref) {
    try {
      const abs = new URL(canonicalHref, url);
      // Only trust a canonical on the same site: some CMSs point every page at the home page.
      if (hostnameOf(abs.href) === hostnameOf(url) && abs.pathname.length > 1) canonical = abs.href;
    } catch {
      // Unparseable canonical: keep the location.
    }
  }
  const title = normalizeText(meta(doc, 'og:title') || doc.title || '');
  return {
    url,
    canonicalUrl: canonicalizeUrl(canonical),
    siteName: normalizeText(meta(doc, 'og:site_name')) || hostnameOf(url),
    title: title.slice(0, 1000),
  };
}
