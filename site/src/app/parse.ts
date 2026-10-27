/**
 * Turns what the reader pastes or drops into paragraphs. This is input handling only: which
 * paragraphs are long enough to compare, and everything about matching them, is the engine's
 * (`isSkippable`, `paragraphTexts`, `normalizeText` come from the core entry module).
 */
import { isSkippable, normalizeText } from '@engine';

export const MAX_PARAGRAPHS = 400;
export const MAX_FILE_BYTES = 2_000_000;
/** The engine skips paragraphs shorter than this (src/engine/normalize.ts MIN_PARAGRAPH_CHARS). */
export const MIN_COMPARABLE = 2;

export interface ParsedArticle {
  title: string;
  siteName: string;
  paragraphs: string[];
  /** Paragraphs the engine will actually compare (60+ characters, not boilerplate). */
  comparable: number;
}

function finish(title: string, siteName: string, paragraphs: string[]): ParsedArticle {
  const clean = paragraphs.map((p) => normalizeText(p)).filter((p) => p.length > 0);
  return {
    title,
    siteName,
    paragraphs: clean.slice(0, MAX_PARAGRAPHS),
    comparable: clean.filter((p) => !isSkippable(p)).length,
  };
}

/** A first line that looks like a headline: short, no closing punctuation, and body text follows. */
function looksLikeTitle(line: string, rest: number): boolean {
  return line.length > 0 && line.length <= 140 && !/[.!?:;,]$/.test(line) && rest >= 3;
}

/** Plain text: blank lines separate paragraphs; with none, every line break does. */
export function parsePasted(text: string, siteName = ''): ParsedArticle {
  const src = text.replace(/\r\n?/g, '\n').trim();
  const blocks = (/\n\s*\n/.test(src) ? src.split(/\n\s*\n/) : src.split('\n'))
    .map((b) => b.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  let title = '';
  const first = blocks[0];
  if (first !== undefined && looksLikeTitle(first, blocks.length - 1)) {
    title = first.replace(/^#+\s*/, '');
    blocks.shift();
  } else if (first?.startsWith('#')) {
    title = first.replace(/^#+\s*/, '');
    blocks.shift();
  }
  return finish(title, siteName, blocks);
}

/**
 * A saved HTML page: the engine's own block finder reads the paragraphs. `paragraphTexts` is not
 * re-exported by the core entry module, so it is imported from its source file, lazily (it pulls in
 * Readability, which the paste path never needs).
 */
export async function parseHtml(html: string): Promise<ParsedArticle> {
  const { paragraphTexts } = await import('@extract/readability');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of doc.querySelectorAll(
    'script, style, noscript, nav, header, footer, aside, form',
  )) {
    el.remove();
  }
  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
    doc.querySelector('h1')?.textContent ??
    doc.title ??
    '';
  const site = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? '';
  const root = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body;
  return finish(normalizeText(title), normalizeText(site), paragraphTexts(root));
}

export class ParseError extends Error {}

export async function parseFile(file: File): Promise<ParsedArticle> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ParseError(
      `${file.name} is larger than 2 MB. Old News reads article text, not whole sites.`,
    );
  }
  const text = await file.text();
  const base = file.name.replace(/\.[^.]+$/, '');
  const looksHtml = /\.html?$/i.test(file.name) || /^\s*<(!doctype|html)/i.test(text);
  const parsed = looksHtml ? await parseHtml(text) : parsePasted(text);
  return { ...parsed, title: parsed.title || base };
}

/** Plain-language reason an input cannot be compared, or null when it can. */
export function explainTooShort(p: ParsedArticle): string | null {
  if (p.comparable >= MIN_COMPARABLE) return null;
  const n = p.comparable;
  return (
    `Old News found ${n} ${n === 1 ? 'paragraph' : 'paragraphs'} it can compare. ` +
    `It needs at least ${MIN_COMPARABLE}, each 60 characters or longer. ` +
    `Paste the article body with a blank line between paragraphs.`
  );
}
