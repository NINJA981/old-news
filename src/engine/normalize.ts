/**
 * Text normalisation shared by matching, mapping and fact extraction.
 * Pure: no DOM, no chrome.*, no I/O (ADR-0001 §2).
 */

const SINGLE_QUOTES = /[‘’‚‛′`´]/g;
const DOUBLE_QUOTES = /[“”„‟″«»]/g;
const DASHES = /[‐‑‒–—―−]/g;
const SPACES = /[\s\u00a0\u2000-\u200b\u202f\u205f\u3000\ufeff]+/g;
const ZERO_WIDTH = /\u200c|\u200d|\u2060|\u00ad/g;

/** NFKC, unified quotes and dashes, collapsed whitespace, trimmed. Case is kept. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, '-')
    .replace(SPACES, ' ')
    .trim();
}

const WORD = /[\p{L}\p{N}]+(?:['.,-][\p{L}\p{N}]+)*/gu;

/** Lower-cased word tokens. Keeps "4.5", "1,200", "don't" and "co-op" as single tokens. */
export function tokenize(input: string): string[] {
  return normalizeText(input).toLowerCase().match(WORD) ?? [];
}

/** Word count used for dwell time and the reading receipt. */
export function wordCount(input: string): number {
  return tokenize(input).length;
}

const MAPPING_STRIP = /["'\s]/g;

/**
 * Comparison key for DOM mapping (SPEC §5.2): whitespace- and quote-insensitive.
 * Two strings that differ only in spacing, line breaks or quote style map to the same key.
 */
export function mappingKey(input: string): string {
  return normalizeText(input).replace(MAPPING_STRIP, '');
}

/** First `max` characters on a word boundary, with an ellipsis when truncated. */
export function snippet(input: string, max = 140): string {
  const text = normalizeText(input);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s,;:.-]+$/u, '')}…`;
}

/** Paragraphs shorter than this are never matched or faded (ADR §5). */
export const MIN_PARAGRAPH_CHARS = 60;

const BOILERPLATE = [
  /^(advertisement|sponsored|related:|read more|sign up|subscribe|share this|follow us)/i,
  /^(click here|newsletter|all rights reserved|copyright ©|© \d{4})/i,
  /(sign up for our|subscribe to our|get the latest .* in your inbox)/i,
];

/** True for short or boilerplate paragraphs that the engine skips. */
export function isSkippable(input: string): boolean {
  const text = normalizeText(input);
  if (text.length < MIN_PARAGRAPH_CHARS) return true;
  return BOILERPLATE.some((re) => re.test(text));
}
