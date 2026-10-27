/**
 * Readability extraction on a document clone (SPEC F1). Returns the article's paragraph texts in
 * reading order. Captions, figures, asides and pull quotes are excluded (ADR §8 layout fixtures).
 * The live document is never modified.
 */
import { isProbablyReaderable, Readability } from '@mozilla/readability';
import { mappingKey, MIN_PARAGRAPH_CHARS, normalizeText } from '../engine/normalize';

export const BLOCK_SELECTOR = 'p, li, blockquote, dd, pre';
const EXCLUDED_ANCESTORS = 'figure, figcaption, aside, nav, footer, [role="complementary"]';

export interface ExtractedArticle {
  title: string;
  /** Normalised paragraph texts, each >= MIN_PARAGRAPH_CHARS, in reading order. */
  paragraphs: string[];
}

export function readerable(doc: Document): boolean {
  return isProbablyReaderable(doc, { minContentLength: 140, minScore: 20 });
}

function parseInert(doc: Document, html: string): Document {
  // An inert document: scripts never run and images never load.
  const inert = doc.implementation.createHTMLDocument('');
  inert.body.innerHTML = html;
  return inert;
}

/** Leaf blocks: matching elements that contain no other matching element. */
export function leafBlocks(root: ParentNode): Element[] {
  const out: Element[] = [];
  for (const el of root.querySelectorAll(BLOCK_SELECTOR)) {
    if (el.querySelector(BLOCK_SELECTOR)) continue;
    if (el.closest(EXCLUDED_ANCESTORS)) continue;
    out.push(el);
  }
  return out;
}

/** Lower-case letters and digits only. */
function looseKey(text: string): string {
  return mappingKey(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Drops pull quotes: a block whose text appears inside another, longer block is a repeat
 * set in display type, not a paragraph of its own.
 */
export function dropPullQuotes(texts: readonly string[]): string[] {
  // Punctuation-insensitive: a pull quote usually ends its sentence ("begins.") where the
  // paragraph it repeats carries on ("begins, when ...").
  const keys = texts.map(looseKey);
  return texts.filter((_, i) => {
    const k = keys[i] as string;
    return !keys.some((other, j) => j !== i && other.length > k.length && other.includes(k));
  });
}

export function paragraphTexts(root: ParentNode): string[] {
  const texts = leafBlocks(root)
    .map((el) => normalizeText(el.textContent ?? ''))
    .filter((t) => t.length >= MIN_PARAGRAPH_CHARS);
  return dropPullQuotes(texts);
}

/** Runs Readability on a clone of `doc`. Returns null when Readability finds no article. */
export function extractArticle(doc: Document): ExtractedArticle | null {
  const clone = doc.cloneNode(true) as Document;
  const parsed = new Readability(clone, { charThreshold: 300, keepClasses: false }).parse();
  if (!parsed?.content) return null;
  const content = parseInert(doc, parsed.content);
  return { title: normalizeText(parsed.title ?? ''), paragraphs: paragraphTexts(content.body) };
}
