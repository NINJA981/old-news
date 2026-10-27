/**
 * Load-bearing fact tokens (ADR-0001 §5 "The guard"). Deterministic and lexicon-based:
 * numbers, dates, money, named entities, negation, modals and outcome verbs.
 *
 * Offsets are into `normalizeText(text)`, which is what the engine sees.
 */
import { normalizeText } from './normalize';

export type FactKind = 'number' | 'date' | 'money' | 'entity' | 'negation' | 'modal' | 'outcome';

export const FACT_KINDS: readonly FactKind[] = [
  'number',
  'date',
  'money',
  'entity',
  'negation',
  'modal',
  'outcome',
];

export interface Fact {
  kind: FactKind;
  /** Canonical value used for comparison ("12", "EUR:4500000", "wd:tuesday", "arrest"). */
  norm: string;
  /** The text as it appeared. */
  raw: string;
  /** Offset into the normalised paragraph text. */
  offset: number;
  /** Up to 3 lower-cased words before the token, space-joined. Used to align facts. */
  ctx: string;
  /** For numbers: the word right after ("people", "%", "km"). Empty when none. */
  unit: string;
}

/** Facts stored per paragraph (SPEC §7). Load-bearing kinds are kept first. */
export const MAX_STORED_FACTS = 24;

// ---------------------------------------------------------------------------------------------
// Lexicons
// ---------------------------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  dozen: 12,
};

/** Vague quantities compare as themselves ("dozens" vs "hundreds" fires; "dozens" vs "dozens" does not). */
const VAGUE_QUANTITIES = new Set(['dozens', 'hundreds', 'thousands', 'scores', 'millions']);

const MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  bn: 1e9,
  billion: 1e9,
  tn: 1e12,
  trillion: 1e12,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
};

const CURRENCY_WORDS: Record<string, string> = {
  dollar: 'USD',
  dollars: 'USD',
  euro: 'EUR',
  euros: 'EUR',
  pound: 'GBP',
  pounds: 'GBP',
  yen: 'JPY',
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const NEGATIONS = new Set([
  'not',
  'no',
  'never',
  'without',
  'nobody',
  'nothing',
  'none',
  'neither',
  'nor',
  'cannot',
  'refused',
  'refuses',
  'refuse',
  'refusing',
]);

/** Modal -> comparison group. Reported-speech backshift (will/would) is not a change. */
const MODALS: Record<string, string> = {
  may: 'possible',
  might: 'possible',
  could: 'possible',
  will: 'will',
  would: 'will',
  "'ll": 'will',
  should: 'should',
  must: 'must',
};

const MODAL_PHRASES: [RegExp, string][] = [
  [/\b(?:plans?|planned|planning|intends?|intended) to\b/gi, 'plan'],
  [/\b(?:expected|expects?|expecting) to\b/gi, 'expect'],
];

/**
 * Outcome verbs and their comparison lemma. Near-synonyms share a lemma
 * (hurt/injured, dead/died) so paraphrase does not fire.
 */
const OUTCOMES: Record<string, string> = {};
function addOutcome(lemma: string, forms: string[]): void {
  for (const f of forms) OUTCOMES[f] = lemma;
}
addOutcome('arrest', ['arrest', 'arrested', 'arrests', 'arresting']);
addOutcome('flee', ['flee', 'fled', 'flees', 'fleeing']);
addOutcome('charge', ['charged']);
addOutcome('release', ['released', 'releases', 'releasing']);
addOutcome('die', ['died', 'dies', 'dead', 'dying']);
addOutcome('kill', ['killed', 'kills', 'killing']);
addOutcome('injure', ['injured', 'injuring', 'injuries', 'injury', 'hurt', 'wounded']);
addOutcome('deny', ['denied', 'denies', 'deny', 'denying']);
addOutcome('confirm', ['confirmed', 'confirms', 'confirm', 'confirming']);
addOutcome('resign', ['resigned', 'resigns', 'resign', 'resigning', 'resignation']);
addOutcome('delay', ['delayed', 'delays', 'delaying']);
addOutcome('cancel', ['cancelled', 'canceled', 'cancels', 'cancelling', 'cancellation']);
addOutcome('postpone', ['postponed', 'postpones', 'postponing']);
addOutcome('approve', ['approved', 'approves', 'approving', 'approval']);
addOutcome('reject', ['rejected', 'rejects', 'rejecting', 'rejection']);
addOutcome('win', ['won', 'wins', 'winning']);
addOutcome('lose', ['lost', 'loses', 'losing']);
addOutcome('close', ['closed', 'closes', 'closing', 'closure']);
addOutcome('reopen', ['reopened', 'reopens', 'reopening']);
addOutcome('evacuate', ['evacuated', 'evacuates', 'evacuating', 'evacuation']);
addOutcome('find', ['found']);
addOutcome('missing', ['missing']);
addOutcome('recover', ['recovered', 'recovers']);
addOutcome('sentence', ['sentenced']);
addOutcome('acquit', ['acquitted', 'acquits']);
addOutcome('convict', ['convicted', 'convicts']);
addOutcome('detain', ['detained', 'detains']);
addOutcome('rescue', ['rescued', 'rescues']);
addOutcome('suspend', ['suspended', 'suspends', 'suspension']);

const TITLES = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sir',
  'dame',
  'gov',
  'sen',
  'rep',
  'chief',
  'mayor',
  'judge',
  'president',
  'minister',
  'officer',
  'inspector',
  'captain',
  'councillor',
  'councilor',
]);

const ENTITY_STOP = new Set([
  'i',
  'a',
  'an',
  'the',
  'this',
  'that',
  'these',
  'those',
  'it',
  'he',
  'she',
  'they',
  'we',
  'you',
  'his',
  'her',
  'their',
  'our',
  'but',
  'and',
  'or',
  'if',
  'in',
  'on',
  'at',
  'for',
  'as',
  'by',
  'of',
  'to',
  'after',
  'before',
  'when',
  'while',
  'update',
  'updated',
  'breaking',
  'live',
  'advertisement',
  ...Object.keys(MONTHS),
  ...WEEKDAYS,
]);

const ENTITY_CONNECTORS = new Set([
  'of',
  'de',
  'del',
  'van',
  'von',
  'der',
  'al',
  'la',
  'du',
  'and',
]);

// ---------------------------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------------------------

interface Span {
  start: number;
  end: number;
}

class Claims {
  private readonly spans: Span[] = [];
  overlaps(start: number, end: number): boolean {
    return this.spans.some((s) => start < s.end && end > s.start);
  }
  claim(start: number, end: number): void {
    this.spans.push({ start, end });
  }
}

const WORD_BEFORE = /[\p{L}\p{N}][\p{L}\p{N}'.-]*/gu;

function contextBefore(text: string, offset: number, n = 3): string {
  const before = text.slice(Math.max(0, offset - 80), offset).toLowerCase();
  const words = before.match(WORD_BEFORE) ?? [];
  return words
    .slice(-n)
    .map((w) => w.replace(/[.'-]+$/u, ''))
    .join(' ');
}

function wordAfter(text: string, end: number): string {
  const m = /^\s*(%|per ?cent\b|[\p{L}][\p{L}-]*)/u.exec(text.slice(end, end + 40));
  if (!m) return '';
  const w = (m[1] ?? '').toLowerCase();
  if (w === '%' || w.startsWith('per')) return '%';
  return w;
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

function fmt(n: number): string {
  // Avoid float noise: 4.5 * 1e6 = 4500000, 0.1 + 0.2 issues are irrelevant at this scale.
  return String(Math.round(n * 1000) / 1000);
}

function pushFact(
  out: Fact[],
  claims: Claims,
  text: string,
  kind: FactKind,
  start: number,
  raw: string,
  norm: string,
  unit = '',
): void {
  const end = start + raw.length;
  if (claims.overlaps(start, end)) return;
  claims.claim(start, end);
  out.push({ kind, norm, raw, offset: start, ctx: contextBefore(text, start), unit });
}

const MONEY_SYMBOL =
  /(?:\b(USD|EUR|GBP|JPY|CHF|CAD|AUD)\s?|(?:\b(?:US|A|C|NZ|HK))?([$€£¥])\s?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(bn|billion|mn|million|m|k|thousand|tn|trillion)\b)?/gi;
const MONEY_WORD =
  /\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(bn|billion|million|m|thousand|k))?\s(dollars?|euros?|pounds?|yen)\b/gi;

function extractMoney(text: string, out: Fact[], claims: Claims): void {
  for (const m of text.matchAll(MONEY_SYMBOL)) {
    const code = (m[1] ?? CURRENCY_SYMBOLS[m[2] ?? ''] ?? 'XXX').toUpperCase();
    const value = parseNumber(m[3] ?? '0') * (MULTIPLIERS[(m[4] ?? '').toLowerCase()] ?? 1);
    pushFact(out, claims, text, 'money', m.index, m[0], `${code}:${fmt(value)}`);
  }
  for (const m of text.matchAll(MONEY_WORD)) {
    const code = CURRENCY_WORDS[(m[3] ?? '').toLowerCase()] ?? 'XXX';
    const value = parseNumber(m[1] ?? '0') * (MULTIPLIERS[(m[2] ?? '').toLowerCase()] ?? 1);
    pushFact(out, claims, text, 'money', m.index, m[0], `${code}:${fmt(value)}`);
  }
}

const MONTH_ALT =
  'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const MONTH_DAY = new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'g');
const DAY_MONTH = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})\\b\\.?`,
  'g',
);
const MONTH_ALONE =
  /\b(January|February|March|April|June|July|August|September|October|November|December)\b/g;
const MAY_MONTH =
  /\b(?:[Ii]n|[Ss]ince|[Uu]ntil|[Bb]y|[Ll]ast|[Nn]ext|[Ee]arly|[Ll]ate|[Mm]id-|[Ff]rom|[Tt]hrough|[Oo]f) (May)\b/g;
const WEEKDAY = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/g;
const RELATIVE_DAY =
  /\b(yesterday|today|tonight|tomorrow|last night|this morning|this afternoon|this evening|last week|this week|next week|last month|next month)\b/gi;
const TIME_OF_DAY = /\b(\d{1,2}):(\d{2})(?:\s?([ap])\.?m\.?)?/gi;
const YEAR = /\b(19\d{2}|20\d{2})\b/g;

function extractDates(text: string, out: Fact[], claims: Claims): void {
  for (const m of text.matchAll(ISO_DATE)) {
    pushFact(out, claims, text, 'date', m.index, m[0], `md:${Number(m[2])}-${Number(m[3])}`);
  }
  for (const m of text.matchAll(MONTH_DAY)) {
    const month = MONTHS[(m[1] ?? '').toLowerCase()] ?? 0;
    pushFact(out, claims, text, 'date', m.index, m[0], `md:${month}-${Number(m[2])}`);
  }
  for (const m of text.matchAll(DAY_MONTH)) {
    const month = MONTHS[(m[2] ?? '').toLowerCase()] ?? 0;
    pushFact(out, claims, text, 'date', m.index, m[0], `md:${month}-${Number(m[1])}`);
  }
  for (const m of text.matchAll(MAY_MONTH)) {
    const start = m.index + m[0].length - 3;
    pushFact(out, claims, text, 'date', start, 'May', 'month:5');
  }
  for (const m of text.matchAll(MONTH_ALONE)) {
    const month = MONTHS[(m[1] ?? '').toLowerCase()] ?? 0;
    pushFact(out, claims, text, 'date', m.index, m[0], `month:${month}`);
  }
  for (const m of text.matchAll(WEEKDAY)) {
    pushFact(out, claims, text, 'date', m.index, m[0], `wd:${(m[1] ?? '').toLowerCase()}`);
  }
  for (const m of text.matchAll(RELATIVE_DAY)) {
    pushFact(out, claims, text, 'date', m.index, m[0], `rel:${m[0].toLowerCase()}`);
  }
  for (const m of text.matchAll(TIME_OF_DAY)) {
    let h = Number(m[1]);
    const ampm = (m[3] ?? '').toLowerCase();
    if (ampm === 'p' && h < 12) h += 12;
    if (ampm === 'a' && h === 12) h = 0;
    pushFact(out, claims, text, 'date', m.index, m[0], `time:${h}:${m[2]}`);
  }
  for (const m of text.matchAll(YEAR)) {
    pushFact(out, claims, text, 'date', m.index, m[0], `year:${m[1]}`);
  }
}

const DIGIT_NUMBER =
  /(?<![\p{L}\p{N}.,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(million|billion|thousand))?(%|(?:km|kg|mph|kmh|ft|cm|mm|mw|gw|ha)\b)?(?![\p{L}\p{N}])/gu;
const WORD_NUMBER = new RegExp(
  `\\b(${[...Object.keys(NUMBER_WORDS), ...VAGUE_QUANTITIES].join('|')})\\b`,
  'gi',
);
const NOT_A_NUMBER_AFTER_ONE = /^\s+(of|another|day|time|way|more|by)\b/i;

function extractNumbers(text: string, out: Fact[], claims: Claims): void {
  for (const m of text.matchAll(DIGIT_NUMBER)) {
    const mult = MULTIPLIERS[(m[2] ?? '').toLowerCase()] ?? 1;
    const value = parseNumber(m[1] ?? '0') * mult;
    const attachedUnit = (m[3] ?? '').toLowerCase();
    const unit = attachedUnit || wordAfter(text, m.index + m[0].length);
    pushFact(out, claims, text, 'number', m.index, m[0], fmt(value), unit);
  }
  for (const m of text.matchAll(WORD_NUMBER)) {
    const word = (m[1] ?? '').toLowerCase();
    const end = m.index + m[0].length;
    if (word === 'one') {
      const prev = text.slice(Math.max(0, m.index - 3), m.index).toLowerCase();
      if (prev.endsWith('no ') || NOT_A_NUMBER_AFTER_ONE.test(text.slice(end))) continue;
    }
    const norm = VAGUE_QUANTITIES.has(word) ? word : fmt(NUMBER_WORDS[word] ?? 0);
    pushFact(out, claims, text, 'number', m.index, m[0], norm, wordAfter(text, end));
  }
}

const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;

function extractWords(text: string, out: Fact[], claims: Claims): void {
  const lower = text.toLowerCase();
  // n't contractions: "didn't" -> negation; "won't" -> modal will + negation.
  for (const m of text.matchAll(/\b([\p{L}]+)n't\b/giu)) {
    const stem = (m[1] ?? '').toLowerCase();
    const negStart = m.index + m[0].length - 3;
    if (claims.overlaps(m.index, m.index + m[0].length)) continue;
    if (stem === 'wo') {
      // "won't" = will + not. Both facts point at the whole contraction.
      out.push({
        kind: 'modal',
        norm: 'will',
        raw: m[0],
        offset: m.index,
        ctx: contextBefore(text, m.index),
        unit: '',
      });
    } else if (stem === 'could' || stem === 'would' || stem === 'should' || stem === 'must') {
      pushFact(out, claims, text, 'modal', m.index, m[0].slice(0, -3), MODALS[stem] ?? stem);
    }
    pushFact(out, claims, text, 'negation', negStart, "n't", 'neg');
    claims.claim(m.index, m.index + m[0].length);
  }
  for (const [re, group] of MODAL_PHRASES) {
    for (const m of text.matchAll(re)) pushFact(out, claims, text, 'modal', m.index, m[0], group);
  }
  for (const m of lower.matchAll(TOKEN)) {
    const word = m[0];
    const raw = text.slice(m.index, m.index + word.length);
    if (word === "'ll") continue;
    if (NEGATIONS.has(word)) {
      pushFact(out, claims, text, 'negation', m.index, raw, 'neg');
      continue;
    }
    const modal = MODALS[word];
    if (modal) {
      // "May" capitalised mid-sentence is the month; dates claim "May 14" first.
      if (raw === 'May' && !isSentenceStart(text, m.index)) continue;
      pushFact(out, claims, text, 'modal', m.index, raw, modal);
      continue;
    }
    const outcome = OUTCOMES[word];
    if (outcome) pushFact(out, claims, text, 'outcome', m.index, raw, outcome);
  }
  for (const m of text.matchAll(/\b(\p{L}+)'ll\b/gu)) {
    pushFact(out, claims, text, 'modal', m.index + (m[1] ?? '').length, "'ll", 'will');
  }
}

function isSentenceStart(text: string, offset: number): boolean {
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i] as string;
    if (ch === ' ') continue;
    return /[.!?:"'(—-]/.test(ch);
  }
  return true;
}

function isCapitalised(word: string): boolean {
  const first = word[0] ?? '';
  return first !== first.toLowerCase() && first === first.toUpperCase();
}

function isAcronym(word: string): boolean {
  return /^[A-Z]{2,6}s?$/.test(word) && word !== 'I';
}

function extractEntities(text: string, out: Fact[], claims: Claims): void {
  const tokens = [...text.matchAll(TOKEN)].map((m) => ({
    word: m[0].replace(/'s$/u, ''),
    start: m.index,
    end: m.index + m[0].length,
  }));
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (!t || !isCapitalised(t.word) || claims.overlaps(t.start, t.end)) {
      i++;
      continue;
    }
    // Grow a span of capitalised words, allowing lower-case connectors between them.
    let j = i;
    let last = i;
    while (j + 1 < tokens.length) {
      const next = tokens[j + 1];
      const prev = tokens[j];
      if (!next || !prev) break;
      const gap = text.slice(prev.end, next.start);
      if (!/^[ ]+$/.test(gap)) break;
      if (claims.overlaps(next.start, next.end)) break;
      if (isCapitalised(next.word)) {
        j++;
        last = j;
        continue;
      }
      if (ENTITY_CONNECTORS.has(next.word.toLowerCase())) {
        const after = tokens[j + 2];
        if (
          after &&
          isCapitalised(after.word) &&
          /^[ ]+$/.test(text.slice(next.end, after.start))
        ) {
          j += 2;
          last = j;
          continue;
        }
      }
      break;
    }
    let span = tokens.slice(i, last + 1);
    const first = span[0];
    if (first && isSentenceStart(text, first.start) && !isAcronym(first.word)) span = span.slice(1);
    while (span.length > 0) {
      const head = span[0];
      if (!head) break;
      const lw = head.word.toLowerCase().replace(/\.$/u, '');
      if (TITLES.has(lw) || ENTITY_STOP.has(lw) || ENTITY_CONNECTORS.has(lw)) span = span.slice(1);
      else break;
    }
    while (span.length > 0) {
      const tail = span[span.length - 1];
      if (tail && ENTITY_CONNECTORS.has(tail.word.toLowerCase())) span = span.slice(0, -1);
      else break;
    }
    if (span.length > 0) {
      const s = span[0] as (typeof span)[number];
      const e = span[span.length - 1] as (typeof span)[number];
      const raw = text.slice(s.start, e.end).replace(/'s$/u, '');
      const norm = raw.toLowerCase().replace(/\s+/g, ' ');
      if (!(span.length === 1 && ENTITY_STOP.has(norm))) {
        pushFact(out, claims, text, 'entity', s.start, raw, norm);
      }
    }
    i = last + 1;
  }
}

const KIND_PRIORITY: Record<FactKind, number> = {
  outcome: 0,
  negation: 1,
  modal: 2,
  money: 3,
  number: 4,
  date: 5,
  entity: 6,
};

/** All fact tokens in a paragraph, in text order. */
export function extractFacts(input: string): Fact[] {
  const text = normalizeText(input);
  const out: Fact[] = [];
  const claims = new Claims();
  extractMoney(text, out, claims);
  extractDates(text, out, claims);
  extractNumbers(text, out, claims);
  extractWords(text, out, claims);
  extractEntities(text, out, claims);
  return out.sort((a, b) => a.offset - b.offset);
}

/** At most MAX_STORED_FACTS facts, keeping load-bearing kinds first, returned in text order. */
export function capFacts(facts: readonly Fact[], max = MAX_STORED_FACTS): Fact[] {
  if (facts.length <= max) return [...facts];
  return [...facts]
    .sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.offset - b.offset)
    .slice(0, max)
    .sort((a, b) => a.offset - b.offset);
}
