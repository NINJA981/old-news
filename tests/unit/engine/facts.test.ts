import { describe, expect, it } from 'vitest';
import type { Fact, FactKind } from '../../../src/engine/facts';
import { capFacts, extractFacts, MAX_STORED_FACTS } from '../../../src/engine/facts';

const of = (text: string, kind: FactKind): Pick<Fact, 'raw' | 'norm'>[] =>
  extractFacts(text)
    .filter((f) => f.kind === kind)
    .map(({ raw, norm }) => ({ raw, norm }));

describe('numbers', () => {
  it('reads digits with separators, decimals, percentages and units', () => {
    expect(
      of('About 1,200 residents and 4.5 tonnes; 40% of homes; 90 km of road.', 'number'),
    ).toEqual([
      { raw: '1,200', norm: '1200' },
      { raw: '4.5', norm: '4.5' },
      { raw: '40%', norm: '40' },
      { raw: '90', norm: '90' },
    ]);
  });
  it('reads number words up to twenty, tens and dozen', () => {
    expect(
      of('Twelve were hurt, twenty fled, and a dozen stayed.', 'number').map((f) => f.norm),
    ).toEqual(['12', '20', '12']);
  });
  it('keeps vague quantities as words', () => {
    expect(of('Dozens of people and hundreds of cars.', 'number').map((f) => f.norm)).toEqual([
      'dozens',
      'hundreds',
    ]);
  });
  it('applies million/billion multipliers', () => {
    expect(of('A crowd of 1.2 million people.', 'number')[0]?.norm).toBe('1200000');
  });
  it('records the unit after a number', () => {
    const [f] = extractFacts('Officials said 14 people were injured.').filter(
      (x) => x.kind === 'number',
    );
    expect(f?.unit).toBe('people');
    const [p] = extractFacts('Turnout was 38 per cent this year.').filter(
      (x) => x.kind === 'number',
    );
    expect(p?.unit).toBe('%');
  });
  it('does not read "no one" or "one of" as a number', () => {
    expect(of('No one was hurt, and one of the trucks was moved.', 'number')).toEqual([]);
  });
});

describe('dates', () => {
  it('reads weekdays, month-day forms, ISO dates and times', () => {
    const norms = of(
      'On Tuesday, October 14, at 7:30 p.m., then 3 November and 2026-10-24.',
      'date',
    ).map((f) => f.norm);
    expect(norms).toEqual(['wd:tuesday', 'md:10-14', 'time:19:30', 'md:11-3', 'md:10-24']);
  });
  it('keeps relative days raw', () => {
    expect(of('It happened yesterday and ends next week.', 'date').map((f) => f.norm)).toEqual([
      'rel:yesterday',
      'rel:next week',
    ]);
  });
  it('treats "May" as a month only in date context', () => {
    expect(of('The vote was held in May.', 'date').map((f) => f.norm)).toEqual(['month:5']);
    expect(of('The vote was held on May 3.', 'date').map((f) => f.norm)).toEqual(['md:5-3']);
    expect(of('The council may vote again.', 'date')).toEqual([]);
  });
  it('reads years as dates, not numbers', () => {
    expect(of('First shown in 2019.', 'date').map((f) => f.norm)).toEqual(['year:2019']);
    expect(of('First shown in 2019.', 'number')).toEqual([]);
  });
});

describe('money', () => {
  it('reads symbols, codes, multipliers and currency words', () => {
    expect(
      of(
        'It cost €4.5m, then $3 billion, then USD 4 million, then £12,500 and 300 million euros.',
        'money',
      ).map((f) => f.norm),
    ).toEqual(['EUR:4500000', 'USD:3000000000', 'USD:4000000', 'GBP:12500', 'EUR:300000000']);
  });
  it('does not double-count money as a number', () => {
    expect(of('A fine of £200 was set.', 'number')).toEqual([]);
  });
});

describe('entities', () => {
  it('reads capitalised spans not at sentence start and strips titles', () => {
    expect(
      of('Fire Chief Ana Ruiz said crews from Harrow Bridge helped.', 'entity').map((f) => f.norm),
    ).toEqual(['ana ruiz', 'harrow bridge']);
  });
  it('reads acronyms, even at sentence start', () => {
    expect(of('NHS staff met the BBC crew.', 'entity').map((f) => f.norm)).toEqual(['nhs', 'bbc']);
  });
  it('joins connectors inside names', () => {
    expect(of('A report by the Bank of Calder was cited.', 'entity').map((f) => f.norm)).toEqual([
      'bank of calder',
    ]);
  });
  it('ignores sentence-initial capitals and stopwords', () => {
    expect(of('The fire spread. It was contained.', 'entity')).toEqual([]);
  });
});

describe('negation, modals and outcomes', () => {
  it('reads negations including contractions', () => {
    expect(
      of("He did not go, she didn't stay, nobody left, never again.", 'negation').map((f) => f.raw),
    ).toEqual(['not', "n't", 'nobody', 'never']);
  });
  it('splits "won\'t" into will + negation', () => {
    const facts = extractFacts("The line won't reopen.");
    expect(facts.filter((f) => f.kind === 'modal').map((f) => f.norm)).toEqual(['will']);
    expect(facts.filter((f) => f.kind === 'negation')).toHaveLength(1);
  });
  it('groups modals (will/would same; may/might/could same) and reads phrases', () => {
    expect(
      of(
        'It will, it would, it may, it might, it could, it must, it plans to, it is expected to.',
        'modal',
      ).map((f) => f.norm),
    ).toEqual(['will', 'will', 'possible', 'possible', 'possible', 'must', 'plan', 'expect']);
  });
  it('lemmatises outcome verbs', () => {
    expect(
      of(
        'He fled, was arrested, charged, then released; two died and four were hurt.',
        'outcome',
      ).map((f) => f.norm),
    ).toEqual(['flee', 'arrest', 'charge', 'release', 'die', 'injure']);
  });
});

describe('extractFacts', () => {
  it('returns facts in text order with context words', () => {
    const facts = extractFacts('Officials said 14 people were injured on Tuesday.');
    expect(facts.map((f) => f.offset)).toEqual(
      [...facts.map((f) => f.offset)].sort((a, b) => a - b),
    );
    const n = facts.find((f) => f.kind === 'number');
    expect(n?.ctx).toBe('officials said');
    const d = facts.find((f) => f.kind === 'date');
    expect(d?.ctx).toBe('were injured on');
  });
  it('offsets point at the raw token in the normalised text', () => {
    const text = 'The council voted 7 to 4 on Thursday.';
    for (const f of extractFacts(text))
      expect(text.slice(f.offset, f.offset + f.raw.length)).toBe(f.raw);
  });
});

describe('capFacts', () => {
  it(`keeps at most ${MAX_STORED_FACTS}, load-bearing kinds first`, () => {
    const text = `${Array.from({ length: 30 }, (_, i) => `${i + 1}`).join(', ')} people fled but were not arrested.`;
    const facts = extractFacts(text);
    expect(facts.length).toBeGreaterThan(MAX_STORED_FACTS);
    const capped = capFacts(facts);
    expect(capped).toHaveLength(MAX_STORED_FACTS);
    expect(capped.some((f) => f.kind === 'outcome')).toBe(true);
    expect(capped.some((f) => f.kind === 'negation')).toBe(true);
    expect(capped.map((f) => f.offset)).toEqual(
      [...capped.map((f) => f.offset)].sort((a, b) => a - b),
    );
  });
});
