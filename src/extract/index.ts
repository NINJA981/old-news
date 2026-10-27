/**
 * The page pipeline (ADR-0001 §3 flow 1): detect -> extract -> map, or stop. DOM-only; no extension
 * APIs. Used by the content script, install-time ingest (same code via scripting) and tests.
 */
import type { ArticleKind } from '../engine/types';
import { isEnglish } from './english';
import type { MappedBlock, RejectReason } from './map';
import { mapParagraphs } from './map';
import { findLiveBlogPosts } from './liveblog';
import { extractArticle, readerable } from './readability';
import type { PageInfo } from './signals';
import { articleKind, articleSignals, hasArticleSignal, pageInfo } from './signals';

export type PageAnalysis =
  | { status: 'not-article'; reason: 'no-signal' | 'not-readerable' | 'no-content' }
  | { status: 'non-english' }
  | {
      status: 'unmapped';
      reason: RejectReason;
      total: number;
      mapped: number;
      page: PageInfo;
      kind: ArticleKind;
    }
  | { status: 'mapped'; page: PageInfo; kind: ArticleKind; blocks: MappedBlock[]; total: number };

/** Text used for the language check: the first few long paragraphs, else the body. */
function sampleText(doc: Document): string {
  const parts: string[] = [];
  for (const p of doc.querySelectorAll('p')) {
    const t = p.textContent ?? '';
    if (t.length >= 60) parts.push(t);
    if (parts.length >= 8) break;
  }
  return parts.length > 0 ? parts.join(' ') : (doc.body?.textContent ?? '').slice(0, 4000);
}

export function analyseDocument(doc: Document, url: string): PageAnalysis {
  const signals = articleSignals(doc);
  if (!hasArticleSignal(signals)) return { status: 'not-article', reason: 'no-signal' };
  if (!isEnglish(doc.documentElement.getAttribute('lang'), sampleText(doc)))
    return { status: 'non-english' };

  const kind = articleKind(signals);
  const page = pageInfo(doc, url);

  if (kind === 'liveblog') {
    const posts = findLiveBlogPosts(doc);
    if (posts.length >= 3) {
      return {
        status: 'mapped',
        page,
        kind,
        total: posts.length,
        blocks: posts.map((p, ordinal) => ({ ordinal, text: p.text, element: p.element })),
      };
    }
    // Too few recognisable posts: fall through to the article path.
  }

  if (!readerable(doc)) return { status: 'not-article', reason: 'not-readerable' };
  const article = extractArticle(doc);
  if (!article) return { status: 'not-article', reason: 'no-content' };
  const result = mapParagraphs(doc.body, article.paragraphs);
  if (!result.ok) {
    return {
      status: 'unmapped',
      reason: result.reason,
      total: result.total,
      mapped: result.mapped,
      page,
      kind,
    };
  }
  return { status: 'mapped', page, kind, blocks: result.blocks, total: result.total };
}

export { DwellTracker, requiredDwellMs } from './dwell';
export { LiveBlogTracker, findLiveBlogPosts } from './liveblog';
export { mapParagraphs } from './map';
export type { MappedBlock, MapResult, RejectReason } from './map';
export type { PageInfo } from './signals';
export { analyseSubtree, longParagraphCount } from './subtree';
export type { SubtreeAnalysis } from './subtree';
