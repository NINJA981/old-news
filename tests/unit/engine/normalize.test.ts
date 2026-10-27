import { describe, expect, it } from 'vitest';
import {
  isSkippable,
  mappingKey,
  normalizeText,
  snippet,
  tokenize,
  wordCount,
} from '../../../src/engine/normalize';

describe('normalizeText', () => {
  it('unifies quotes, dashes and whitespace', () => {
    expect(normalizeText('  “Hello” — it’s here\n\n')).toBe('"Hello" - it\'s here');
  });
  it('applies NFKC (ligatures, full-width digits)', () => {
    expect(normalizeText('ﬁre at １２')).toBe('fire at 12');
  });
  it('removes soft hyphens and zero-width joiners', () => {
    expect(normalizeText('ware­house fi‍re')).toBe('warehouse fire');
  });
});

describe('tokenize', () => {
  it('keeps numbers with separators and contractions as one token', () => {
    expect(tokenize('Officials said 1,200 people didn’t leave; €4.5m co-op.')).toEqual([
      'officials',
      'said',
      '1,200',
      'people',
      "didn't",
      'leave',
      '4.5m',
      'co-op',
    ]);
  });
  it('counts words', () => {
    expect(wordCount('One two  three.\nFour')).toBe(4);
    expect(wordCount('')).toBe(0);
  });
});

describe('mappingKey', () => {
  it('ignores whitespace and quote style differences', () => {
    expect(mappingKey('He said “no”.\n  Then left.')).toBe(mappingKey('He said "no". Then left.'));
    expect(mappingKey("it's")).toBe(mappingKey('it’s'));
  });
  it('keeps letters and punctuation that matter', () => {
    expect(mappingKey('12 injured')).not.toBe(mappingKey('14 injured'));
  });
});

describe('snippet', () => {
  it('returns short text unchanged', () => {
    expect(snippet('Short text.')).toBe('Short text.');
  });
  it('truncates on a word boundary with an ellipsis and stays within the limit', () => {
    const text = 'word '.repeat(60);
    const s = snippet(text, 140);
    expect(s.length).toBeLessThanOrEqual(140);
    expect(s.endsWith('…')).toBe(true);
    expect(s).not.toMatch(/ …$/);
  });
});

describe('isSkippable', () => {
  it('skips short paragraphs', () => {
    expect(isSkippable('Too short to matter.')).toBe(true);
  });
  it('skips boilerplate', () => {
    expect(
      isSkippable(
        'Sign up for our newsletter to get the latest updates from Port Alder every morning.',
      ),
    ).toBe(true);
    expect(
      isSkippable('Advertisement - story continues below this message from our sponsors today'),
    ).toBe(true);
  });
  it('keeps real paragraphs', () => {
    expect(
      isSkippable(
        'Firefighters battled the blaze at the Port Alder warehouse for six hours on Tuesday.',
      ),
    ).toBe(false);
  });
});
