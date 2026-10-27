/**
 * Daily counters and the weekly reading receipt (SPEC F16). Numbers come only from the
 * reader's own `daily` records; with no data there is no receipt (never zeros dressed as results).
 */
import { DAILY_TTL_DAYS, DAY_MS } from './thresholds';
import type { DailyRecord } from './types';

/** Local calendar day "YYYY-MM-DD". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO-8601 week label, e.g. "2026-W43", for the receipt file name. */
export function isoWeek(ms: number): string {
  const d = new Date(ms);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type DailyDelta = Partial<Omit<DailyRecord, 'day' | 'expiresAt'>>;

export function emptyDaily(day: string, now: number): DailyRecord {
  return {
    day,
    words: 0,
    wordsKnown: 0,
    wordsFolded: 0,
    articles: 0,
    pNew: 0,
    pSeen: 0,
    pSimilar: 0,
    pChanged: 0,
    expiresAt: now + DAILY_TTL_DAYS * DAY_MS,
  };
}

/** Adds a delta to a day's counters. Returns a new record. */
export function bumpDaily(rec: DailyRecord, delta: DailyDelta, now: number): DailyRecord {
  return {
    day: rec.day,
    words: rec.words + (delta.words ?? 0),
    wordsKnown: rec.wordsKnown + (delta.wordsKnown ?? 0),
    wordsFolded: rec.wordsFolded + (delta.wordsFolded ?? 0),
    articles: rec.articles + (delta.articles ?? 0),
    pNew: rec.pNew + (delta.pNew ?? 0),
    pSeen: rec.pSeen + (delta.pSeen ?? 0),
    pSimilar: rec.pSimilar + (delta.pSimilar ?? 0),
    pChanged: rec.pChanged + (delta.pChanged ?? 0),
    expiresAt: now + DAILY_TTL_DAYS * DAY_MS,
  };
}

export interface WeeklyReceipt {
  week: string;
  /** First and last day keys covered (inclusive). */
  from: string;
  to: string;
  daysWithReading: number;
  words: number;
  wordsKnown: number;
  /** Rounded percentage of words that were already known. */
  knownPercent: number;
  articles: number;
  paragraphs: { new: number; seen: number; similar: number; changed: number };
}

/** The 7 local day keys ending with `now`'s day, oldest first. */
export function lastSevenDays(now: number): string[] {
  const d = new Date(now);
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    keys.push(dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime()));
  }
  return keys;
}

/**
 * Receipt over the 7 days ending today. Returns null when none of those days has any words,
 * so the UI shows its empty state.
 */
export function weeklyReceipt(records: readonly DailyRecord[], now: number): WeeklyReceipt | null {
  const days = lastSevenDays(now);
  const set = new Set(days);
  const inWeek = records.filter((r) => set.has(r.day) && r.words > 0);
  if (inWeek.length === 0) return null;
  const sum = (f: (r: DailyRecord) => number): number => inWeek.reduce((a, r) => a + f(r), 0);
  const words = sum((r) => r.words);
  const wordsKnown = sum((r) => r.wordsKnown);
  return {
    week: isoWeek(now),
    from: days[0] as string,
    to: days[6] as string,
    daysWithReading: inWeek.length,
    words,
    wordsKnown,
    knownPercent: words === 0 ? 0 : Math.round((wordsKnown / words) * 100),
    articles: sum((r) => r.articles),
    paragraphs: {
      new: sum((r) => r.pNew),
      seen: sum((r) => r.pSeen),
      similar: sum((r) => r.pSimilar),
      changed: sum((r) => r.pChanged),
    },
  };
}
