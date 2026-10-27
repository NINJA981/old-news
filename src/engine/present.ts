/**
 * Copy that the product states as facts (SPEC F9-F11, F16, §8): provenance tags, drift chips, the
 * pill, the badge, the privacy meter and the receipt sentence. Pure string functions so the
 * extension, the web app and the tests all say exactly the same thing.
 *
 * Numbers and units are joined with a no-break space (DESIGN.md: "14 min"), exported as NBSP.
 * Callers that compare text replace NBSP with a plain space first.
 */
import type { DriftFinding } from './guard';
import type { WeeklyReceipt } from './receipt';
import type { Tier } from './tiers';

export const NBSP = ' ';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole local calendar days between two instants (0 = same day). */
export function calendarDaysBetween(then: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(then)) / DAY);
}

/** "just now", "6 min ago", "3 hr ago", "yesterday", "4 days ago", "2 weeks ago". */
export function relativeTime(then: number, now: number): string {
  const diff = Math.max(0, now - then);
  if (diff < MIN) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}${NBSP}min ago`;
  const days = calendarDaysBetween(then, now);
  if (days === 0) return `${Math.floor(diff / HOUR)}${NBSP}hr ago`;
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}${NBSP}days ago`;
  return `${Math.floor(days / 7)}${NBSP}weeks ago`;
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Hover-card line: "Read today, 7:32", "Read yesterday, 18:04", "Read 3 days ago". */
export function readWhen(then: number, now: number): string {
  const days = calendarDaysBetween(then, now);
  if (days === 0) return `Read today, ${clock(then)}`;
  if (days === 1) return `Read yesterday, ${clock(then)}`;
  return `Read ${relativeTime(then, now)}`;
}

/** The provenance tag text for a faded paragraph; null for tiers that carry no tag. */
export function provenanceLabel(
  tier: Tier,
  siteName: string,
  readAt: number,
  now: number,
): string | null {
  if (tier === 'seen') return `${siteName} · ${relativeTime(readAt, now)}`;
  if (tier === 'similar') return `Similar to ${siteName} · ${relativeTime(readAt, now)}`;
  return null;
}

/** One line for the drift chip: "12 → 14 · Calder Courier said 12, 14 min ago". */
export function driftChipText(
  finding: Pick<DriftFinding, 'before' | 'after'>,
  siteName: string,
  readAt: number,
  now: number,
): string {
  const before = finding.before || 'not mentioned';
  const after = finding.after || 'not mentioned';
  return `${before} → ${after} · ${siteName} said ${before}, ${relativeTime(readAt, now)}`;
}

/** Paragraphs that stay lit: new plus changed. */
export function litCount(s: { new: number; changed: number }): number {
  return s.new + s.changed;
}

/** Toolbar badge text: the lit count, "99+" above 99, empty when nothing was matched. */
export function badgeText(s: {
  total: number;
  new: number;
  changed: number;
  seen: number;
  similar: number;
}): string {
  if (s.seen + s.similar + s.changed === 0) return '';
  const n = litCount(s);
  return n > 99 ? '99+' : String(n);
}

/** The in-page pill. Hidden (null) when nothing matched. */
export function pillText(s: {
  total: number;
  new: number;
  changed: number;
  seen: number;
  similar: number;
}): string | null {
  if (s.seen + s.similar + s.changed === 0) return null;
  const n = litCount(s);
  if (n === 0) return `Nothing new here. All ${s.total} paragraphs are old news.`;
  return `Only ${n} of ${s.total} paragraphs are new to you`;
}

/** 3412 -> "3,412". Locale-independent so the output is the same everywhere. */
export function formatCount(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The popup footer: "0 requests sent · 3,412 paragraphs remembered · oldest 29 days." */
export function privacyMeterText(
  stats: { paragraphs: number; oldestReadAt: number | null },
  now: number,
): string {
  const head = '0 requests sent';
  if (stats.paragraphs === 0) return `${head} · nothing remembered yet.`;
  const noun = stats.paragraphs === 1 ? 'paragraph' : 'paragraphs';
  const oldest =
    stats.oldestReadAt === null ? 0 : Math.max(0, calendarDaysBetween(stats.oldestReadAt, now));
  const age = oldest === 0 ? 'today' : `${oldest} ${oldest === 1 ? 'day' : 'days'}`;
  return `${head} · ${formatCount(stats.paragraphs)} ${noun} remembered · oldest ${age}.`;
}

/** The two receipt sentences (F16). Derived from the reader's own counters only. */
export function receiptSentence(r: Pick<WeeklyReceipt, 'words' | 'knownPercent'>): string {
  return `You read ${formatCount(r.words)} words this week. ${r.knownPercent}% was stuff you'd already read.`;
}
