/**
 * Infinite scroll (SPEC F3, AC3.2): when a page swaps the URL and appends the next article, that
 * article is analysed as its own article. Readability runs on an inert document holding only the
 * appended subtree, and the paragraphs are mapped back to the live elements under that subtree,
 * with the same strict rules as a whole page (>= 3 paragraphs, >= 80% mapped, none double-mapped).
 */
import { normalizeText } from '../engine/normalize';
import { canonicalizeUrl, hostnameOf } from '../engine/url';
import type { MappedBlock } from './map';
import { mapParagraphs } from './map';
import { extractArticle } from './readability';
import type { PageInfo } from './signals';

export type SubtreeAnalysis =
  | { status: 'none' }
  | { status: 'unmapped'; total: number; mapped: number }
  | { status: 'mapped'; page: PageInfo; blocks: MappedBlock[]; total: number };

const LONG = 60;

/** Number of paragraph-like blocks of at least LONG characters under (or being) `root`. */
export function longParagraphCount(root: Element): number {
  const own = root.matches('p') ? [root] : [];
  let n = 0;
  for (const p of [...own, ...root.querySelectorAll('p')]) {
    if (normalizeText(p.textContent ?? '').length >= LONG) n++;
  }
  return n;
}

export function analyseSubtree(root: Element, url: string, base: PageInfo): SubtreeAnalysis {
  const doc = root.ownerDocument;
  if (longParagraphCount(root) < 3) return { status: 'none' };
  const inert = doc.implementation.createHTMLDocument(doc.title);
  inert.documentElement.lang = doc.documentElement.lang;
  inert.body.append(inert.importNode(root, true));
  const article = extractArticle(inert);
  if (!article) return { status: 'none' };
  const mapped = mapParagraphs(root, article.paragraphs);
  if (!mapped.ok) return { status: 'unmapped', total: mapped.total, mapped: mapped.mapped };
  const heading = root.querySelector('h1, h2')?.textContent ?? '';
  const title = normalizeText(article.title || heading || base.title).slice(0, 1000);
  return {
    status: 'mapped',
    page: {
      url,
      canonicalUrl: canonicalizeUrl(url),
      siteName: base.siteName || hostnameOf(url),
      title,
    },
    blocks: mapped.blocks,
    total: mapped.total,
  };
}
