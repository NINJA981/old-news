/**
 * English-only gate (SPEC §6, AC1.2). Pure: works on strings, so the web app and Node can use it.
 * A page is treated as English when its declared language (if any) is English and its text has
 * an English stopword ratio typical of running prose.
 */
import { tokenize } from '../engine/normalize';

const EN_STOPWORDS = new Set(
  (
    'the of and to a in is that for it on was with as he she by at from his her they be this have ' +
    'are not but had has were which or an their been its would who will there said after more than ' +
    'when about also we our them into some could can over what only other new two first last'
  ).split(' '),
);

/** Minimum share of English stopwords among word tokens. English news prose measures ~0.35–0.5. */
export const MIN_STOPWORD_RATIO = 0.2;
/** Number of tokens sampled; enough for a stable ratio without scanning a whole long page. */
const SAMPLE_TOKENS = 600;

/** True when a `lang` attribute is absent or declares English ("en", "en-GB", "EN_us"). */
export function isEnglishLangTag(lang: string | null | undefined): boolean {
  const tag = (lang ?? '').trim().toLowerCase();
  if (tag === '') return true;
  return tag === 'en' || tag.startsWith('en-') || tag.startsWith('en_');
}

export function stopwordRatio(text: string): number {
  const tokens = tokenize(text).slice(0, SAMPLE_TOKENS);
  const words = tokens.filter((t) => /\p{L}/u.test(t));
  if (words.length === 0) return 0;
  let hits = 0;
  for (const w of words) if (EN_STOPWORDS.has(w)) hits++;
  return hits / words.length;
}

/** True when the text reads as English prose (needs at least 30 words to decide). */
export function isEnglishText(text: string): boolean {
  const words = tokenize(text).filter((t) => /\p{L}/u.test(t));
  if (words.length < 30) return false;
  return stopwordRatio(text) >= MIN_STOPWORD_RATIO;
}

export function isEnglish(lang: string | null | undefined, sampleText: string): boolean {
  return isEnglishLangTag(lang) && isEnglishText(sampleText);
}
