/**
 * DOM mapping, or nothing (SPEC F2, §5.2). Each extracted paragraph is mapped back to exactly one
 * live element whose normalised text equals it (whitespace- and quote-insensitive). A page is
 * acted on only if all of these hold:
 *   1. there are >= 3 paragraphs of >= 60 characters;
 *   2. >= 80% of them map to exactly one live element;
 *   3. no two paragraphs map to the same element.
 * Otherwise the result is a rejection and the caller must not touch the page.
 */
import { mappingKey, MIN_PARAGRAPH_CHARS, normalizeText } from '../engine/normalize';

export const MIN_PARAGRAPHS = 3;
export const MIN_MAPPED_RATIO = 0.8;

/** Live elements that can carry a paragraph's text. */
const LIVE_SELECTOR =
  'p, li, blockquote, dd, pre, div, section, article, span, td, font, h2, h3, h4, figcaption';

/** Our own overlay host is never a mapping target. */
export const OVERLAY_ATTR = 'data-old-news-overlay';

export interface MappedBlock {
  ordinal: number;
  text: string;
  element: Element;
}

export type RejectReason =
  'too-few-paragraphs' | 'low-mapping' | 'double-mapped' | 'too-little-text';

export type MapResult =
  | { ok: true; blocks: MappedBlock[]; total: number; mapped: number }
  | { ok: false; reason: RejectReason; total: number; mapped: number };

/** Keeps only the deepest elements: drops any element that contains another in the list. */
function deepest(elements: readonly Element[]): Element[] {
  return elements.filter((el) => !elements.some((other) => other !== el && el.contains(other)));
}

/** Index of live elements by mapping key, restricted to keys we are looking for. */
function indexLive(
  root: ParentNode,
  wanted: ReadonlySet<string>,
  maxRawLen: number,
): Map<string, Element[]> {
  const out = new Map<string, Element[]>();
  for (const el of root.querySelectorAll(LIVE_SELECTOR)) {
    if (el.closest(`[${OVERLAY_ATTR}]`)) continue;
    const raw = el.textContent ?? '';
    if (raw.length < MIN_PARAGRAPH_CHARS / 2 || raw.length > maxRawLen) continue;
    const key = mappingKey(raw);
    if (!wanted.has(key)) continue;
    const list = out.get(key);
    if (list) list.push(el);
    else out.set(key, [el]);
  }
  return out;
}

/**
 * Maps paragraph texts (from Readability) to live elements under `root`.
 * Ordinals are positions in the filtered list of paragraphs of >= 60 characters.
 */
export function mapParagraphs(root: ParentNode, paragraphs: readonly string[]): MapResult {
  const texts = paragraphs.map(normalizeText).filter((t) => t.length >= MIN_PARAGRAPH_CHARS);
  const total = texts.length;
  if (total < MIN_PARAGRAPHS) return { ok: false, reason: 'too-few-paragraphs', total, mapped: 0 };

  const keys = texts.map(mappingKey);
  const longest = Math.max(...texts.map((t) => t.length));
  // Raw textContent includes markup whitespace, so allow generous slack before giving up on an element.
  const live = indexLive(root, new Set(keys), longest * 3 + 2000);

  const blocks: MappedBlock[] = [];
  const used = new Set<Element>();
  let doubleMapped = false;
  texts.forEach((text, ordinal) => {
    const candidates = deepest(live.get(keys[ordinal] as string) ?? []);
    if (candidates.length !== 1) return; // missing or ambiguous: unmapped, never touched
    const element = candidates[0] as Element;
    if (used.has(element)) {
      doubleMapped = true;
      return;
    }
    used.add(element);
    blocks.push({ ordinal, text, element });
  });

  const mapped = blocks.length;
  if (doubleMapped) return { ok: false, reason: 'double-mapped', total, mapped };
  if (mapped / total < MIN_MAPPED_RATIO) return { ok: false, reason: 'low-mapping', total, mapped };
  return { ok: true, blocks, total, mapped };
}
