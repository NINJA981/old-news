import { describe, expect, it } from 'vitest';
import {
  badgeText,
  calendarDaysBetween,
  driftChipText,
  formatCount,
  litCount,
  NBSP,
  pillText,
  privacyMeterText,
  provenanceLabel,
  readWhen,
  receiptSentence,
  relativeTime,
} from '../../../src/engine/present';

const plain = (s: string | null): string => (s ?? '').replaceAll(NBSP, ' ');
const at = (y: number, mo: number, d: number, h = 12, mi = 0): number =>
  new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 20, 14, 0);

describe('relativeTime', () => {
  it('says just now under a minute', () => {
    expect(relativeTime(NOW - 20_000, NOW)).toBe('just now');
    expect(relativeTime(NOW + 5_000, NOW)).toBe('just now');
  });

  it('counts minutes with a no-break space', () => {
    expect(relativeTime(NOW - 6 * 60_000, NOW)).toBe(`6${NBSP}min ago`);
    expect(plain(relativeTime(NOW - 14 * 60_000, NOW))).toBe('14 min ago');
    expect(plain(relativeTime(NOW - 59 * 60_000, NOW))).toBe('59 min ago');
  });

  it('counts hours on the same calendar day', () => {
    expect(plain(relativeTime(at(2026, 10, 20, 9, 0), NOW))).toBe('5 hr ago');
  });

  it('keeps minutes across midnight, then says yesterday for the previous calendar day', () => {
    expect(plain(relativeTime(at(2026, 10, 19, 23, 30), at(2026, 10, 20, 0, 10)))).toBe(
      '40 min ago',
    );
    expect(relativeTime(at(2026, 10, 19, 20, 0), at(2026, 10, 20, 7, 0))).toBe('yesterday');
    expect(relativeTime(at(2026, 10, 19, 8, 0), NOW)).toBe('yesterday');
  });

  it('counts days then weeks', () => {
    expect(plain(relativeTime(at(2026, 10, 17), NOW))).toBe('3 days ago');
    expect(plain(relativeTime(at(2026, 10, 6), NOW))).toBe('2 weeks ago');
    expect(plain(relativeTime(at(2026, 9, 25), NOW))).toBe('3 weeks ago');
  });
});

describe('calendarDaysBetween / readWhen', () => {
  it('uses local calendar days', () => {
    expect(calendarDaysBetween(at(2026, 10, 20, 0, 5), at(2026, 10, 20, 23, 55))).toBe(0);
    expect(calendarDaysBetween(at(2026, 10, 19, 23, 55), at(2026, 10, 20, 0, 5))).toBe(1);
  });

  it('formats the hover-card line', () => {
    expect(readWhen(at(2026, 10, 20, 7, 32), NOW)).toBe('Read today, 7:32');
    expect(readWhen(at(2026, 10, 19, 18, 4), NOW)).toBe('Read yesterday, 18:04');
    expect(readWhen(at(2026, 10, 17, 18, 4), NOW)).toBe(`Read 3${NBSP}days ago`);
  });
});

describe('provenanceLabel', () => {
  it('names the outlet and time for seen paragraphs', () => {
    expect(plain(provenanceLabel('seen', 'Fenwick Wire', NOW - 6 * 60_000, NOW))).toBe(
      'Fenwick Wire · 6 min ago',
    );
  });

  it('prefixes similar paragraphs with "Similar to"', () => {
    expect(plain(provenanceLabel('similar', 'Calder Courier', at(2026, 10, 19), NOW))).toBe(
      'Similar to Calder Courier · yesterday',
    );
  });

  it('has no tag for new or changed paragraphs', () => {
    expect(provenanceLabel('new', 'X', NOW, NOW)).toBeNull();
    expect(provenanceLabel('changed', 'X', NOW, NOW)).toBeNull();
  });
});

describe('driftChipText (AC10.1)', () => {
  it('matches "{before} -> {after} · {outlet} said {before}, {relative time}"', () => {
    const text = driftChipText(
      { before: '12', after: '14' },
      'Calder Courier',
      NOW - 14 * 60_000,
      NOW,
    );
    expect(plain(text)).toBe('12 → 14 · Calder Courier said 12, 14 min ago');
  });

  it('names a token that appeared or disappeared', () => {
    expect(plain(driftChipText({ before: '', after: 'fled' }, 'A', NOW, NOW))).toBe(
      'not mentioned → fled · A said not mentioned, just now',
    );
  });
});

describe('badge and pill (AC11.1, AC11.2)', () => {
  const s = (o: Partial<Record<'total' | 'new' | 'seen' | 'similar' | 'changed', number>>) => ({
    total: 0,
    new: 0,
    seen: 0,
    similar: 0,
    changed: 0,
    ...o,
  });

  it('counts new plus changed as lit', () => {
    expect(litCount(s({ new: 3, changed: 1 }))).toBe(4);
  });

  it('shows the lit count on the badge', () => {
    expect(badgeText(s({ total: 23, new: 3, changed: 1, seen: 19 }))).toBe('4');
  });

  it('caps the badge at 99+', () => {
    expect(badgeText(s({ total: 300, new: 150, seen: 150 }))).toBe('99+');
    expect(badgeText(s({ total: 120, new: 99, seen: 21 }))).toBe('99');
  });

  it('has no badge and no pill when nothing matched', () => {
    const none = s({ total: 20, new: 20 });
    expect(badgeText(none)).toBe('');
    expect(pillText(none)).toBeNull();
  });

  it('writes the pill sentence', () => {
    expect(pillText(s({ total: 23, new: 3, changed: 1, seen: 19 }))).toBe(
      'Only 4 of 23 paragraphs are new to you',
    );
  });

  it('says nothing is new when every paragraph is faded', () => {
    expect(pillText(s({ total: 12, seen: 10, similar: 2 }))).toBe(
      'Nothing new here. All 12 paragraphs are old news.',
    );
    expect(badgeText(s({ total: 12, seen: 10, similar: 2 }))).toBe('0');
  });
});

describe('privacy meter and receipt sentence', () => {
  it('formats counts with thousands separators', () => {
    expect(formatCount(3412)).toBe('3,412');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('reads like the popup footer', () => {
    expect(privacyMeterText({ paragraphs: 3412, oldestReadAt: at(2026, 9, 21) }, NOW)).toBe(
      '0 requests sent · 3,412 paragraphs remembered · oldest 29 days.',
    );
  });

  it('handles empty memory, one paragraph and today', () => {
    expect(privacyMeterText({ paragraphs: 0, oldestReadAt: null }, NOW)).toBe(
      '0 requests sent · nothing remembered yet.',
    );
    expect(privacyMeterText({ paragraphs: 1, oldestReadAt: NOW - 1000 }, NOW)).toBe(
      '0 requests sent · 1 paragraph remembered · oldest today.',
    );
    expect(privacyMeterText({ paragraphs: 2, oldestReadAt: at(2026, 10, 19) }, NOW)).toContain(
      'oldest 1 day.',
    );
  });

  it('writes the receipt sentence from the counters only', () => {
    expect(receiptSentence({ words: 41200, knownPercent: 63 })).toBe(
      "You read 41,200 words this week. 63% was stuff you'd already read.",
    );
  });
});
