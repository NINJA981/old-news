import { describe, expect, it } from 'vitest';
import { extractFacts } from '../../../src/engine/facts';
import type { DriftFinding } from '../../../src/engine/guard';
import { guard } from '../../../src/engine/guard';

/** Findings when `later` is read after `earlier`. */
const diff = (earlier: string, later: string): DriftFinding[] =>
  guard(extractFacts(later), extractFacts(earlier));
const pairs = (earlier: string, later: string) =>
  diff(earlier, later).map((f) => [f.kind, f.before, f.after]);

// AC7.1: >= 3 minimal pairs per kind, plus "identical tokens in a different order do not fire".
describe('guard: numbers', () => {
  it.each([
    [
      'Twelve people were injured in the fire.',
      '14 people were injured in the fire.',
      'Twelve',
      '14',
    ],
    ['The vote was 7 to 4 in favour.', 'The vote was 6 to 4 in favour.', '7', '6'],
    [
      'About 1,200 commuters use the line daily.',
      'About 2,100 commuters use the line daily.',
      '1,200',
      '2,100',
    ],
    ['Turnout was 38% this year.', 'Turnout was 43% this year.', '38%', '43%'],
  ])('%s -> %s', (a, b, before, after) => {
    expect(pairs(a, b)).toEqual([['number', before, after]]);
  });
  it('"twelve" and 12 are the same number', () => {
    expect(diff('Twelve people were injured.', '12 people were injured.')).toEqual([]);
  });
  it('an extra number with no counterpart does not fire ("more details")', () => {
    expect(
      diff('Crews fought the fire overnight.', 'Crews fought the fire overnight, using 3 engines.'),
    ).toEqual([]);
  });
});

describe('guard: dates', () => {
  it.each([
    ['The line reopens on Tuesday.', 'The line reopens on Wednesday.'],
    ['The trial begins on October 14.', 'The trial begins on October 21.'],
    ['The fire started at 7:30 p.m. in a unit.', 'The fire started at 9:30 p.m. in a unit.'],
    ['It was announced yesterday by the agency.', 'It was announced today by the agency.'],
  ])('%s -> %s', (a, b) => {
    expect(diff(a, b).map((f) => f.kind)).toEqual(['date']);
  });
  it('"October 14" and "14 October" are the same date', () => {
    expect(diff('The trial begins on October 14.', 'The trial begins on 14 October.')).toEqual([]);
  });
});

describe('guard: money', () => {
  it.each([
    [
      'The city will spend €4.5m on buses.',
      'The city will spend €5.4m on buses.',
      '€4.5m',
      '€5.4m',
    ],
    [
      'Repairs will cost $2 million.',
      'Repairs will cost $20 million.',
      '$2 million',
      '$20 million',
    ],
    [
      'He diverted £180,000 from the club.',
      'He diverted £810,000 from the club.',
      '£180,000',
      '£810,000',
    ],
  ])('%s -> %s', (a, b, before, after) => {
    expect(pairs(a, b)).toEqual([['money', before, after]]);
  });
  it('"$2 million" and "$2m" are the same amount', () => {
    expect(diff('Repairs will cost $2 million.', 'Repairs will cost $2m.')).toEqual([]);
  });
});

describe('guard: entities', () => {
  it.each([
    [
      'Fire chief Ana Ruiz said the cause is unknown.',
      'Fire chief Mia Ortiz said the cause is unknown.',
    ],
    [
      'The suspect was held near Harrow Bridge on Monday.',
      'The suspect was held near Kessel Junction on Monday.',
    ],
    [
      'The contract went to Tarrow Civil this week.',
      'The contract went to Brennan Works this week.',
    ],
  ])('%s -> %s', (a, b) => {
    expect(diff(a, b).map((f) => f.kind)).toEqual(['entity']);
  });
  it('a shorter mention of the same name does not fire', () => {
    expect(diff('Officials said Ana Ruiz will speak.', 'Officials said Ruiz will speak.')).toEqual(
      [],
    );
  });
});

describe('guard: negation', () => {
  it.each([
    ['The minister will resign.', 'The minister will not resign.', 'will', 'will not'],
    [
      'The batches reached shelves in the north.',
      'The batches never reached shelves in the north.',
      'batches',
      'batches never',
    ],
    ['Residents received a warning.', 'Residents received no warning.', 'received', 'received no'],
  ])('%s -> %s', (a, b, before, after) => {
    expect(pairs(a, b)).toEqual([['negation', before, after]]);
  });
  it('removing a negation also fires', () => {
    expect(pairs('The branch would not close.', 'The branch would close.')).toEqual([
      ['negation', 'would not', 'would'],
    ]);
  });
  it('"did not" and "didn\'t" are the same', () => {
    expect(
      diff('She did not say whether she would go.', "She didn't say whether she would go."),
    ).toEqual([]);
  });
});

describe('guard: modals', () => {
  it.each([
    ['The line will reopen on Tuesday.', 'The line may reopen on Tuesday.', 'will', 'may'],
    ['The minister must answer questions.', 'The minister may answer questions.', 'must', 'may'],
    [
      'The company plans to reopen the plant.',
      'The company will reopen the plant.',
      'plans to',
      'will',
    ],
  ])('%s -> %s', (a, b, before, after) => {
    expect(pairs(a, b)).toEqual([['modal', before, after]]);
  });
  it('reported-speech backshift (will -> would) does not fire', () => {
    expect(
      diff('The operator said the line will reopen.', 'The operator said the line would reopen.'),
    ).toEqual([]);
  });
});

describe('guard: outcomes', () => {
  it.each([
    ['The driver fled the scene.', 'The driver was arrested at the scene.', 'fled', 'arrested'],
    ['The company denied the report.', 'The company confirmed the report.', 'denied', 'confirmed'],
    [
      'The council approved the budget.',
      'The council rejected the budget.',
      'approved',
      'rejected',
    ],
    ['The concert was postponed.', 'The concert was cancelled.', 'postponed', 'cancelled'],
  ])('%s -> %s', (a, b, before, after) => {
    expect(pairs(a, b)).toEqual([['outcome', before, after]]);
  });
  it('an outcome on one side only always fires', () => {
    expect(
      pairs('One firefighter was at the scene.', 'One firefighter was injured at the scene.'),
    ).toEqual([['outcome', '', 'injured']]);
    expect(pairs('The hiker was found.', 'The hiker was found dead.')).toEqual([
      ['outcome', '', 'dead'],
    ]);
  });
  it('synonyms that share a lemma do not fire (hurt / injured)', () => {
    expect(diff('Twelve people were injured.', 'Twelve people were hurt.')).toEqual([]);
  });
});

describe('guard: order and offsets', () => {
  it('identical tokens in a different order do not fire', () => {
    expect(
      diff(
        'The plan costs €4.5m and starts Tuesday with 3 buses.',
        'Starting Tuesday with 3 buses, the plan costs €4.5m.',
      ),
    ).toEqual([]);
  });
  it('reports the offset of the changed token in the new paragraph', () => {
    const later = 'Officials said 14 people were injured.';
    const [f] = diff('Officials said 12 people were injured.', later);
    expect(f && later.slice(f.offset, f.offset + f.length)).toBe('14');
  });
  it('reports several independent changes', () => {
    expect(
      diff('Twelve were hurt on Tuesday.', 'Fourteen were hurt on Wednesday.').map((f) => f.kind),
    ).toEqual(['number', 'date']);
  });
});

describe('guard: units, swapped figures and years', () => {
  it.each([
    ['The route is 90 km long.', 'The route is 90 miles long.'],
    ['Support rose to 40% in the poll.', 'Support rose to 40 percent among men in the poll.'],
    ['The tank holds 500 litres of fuel.', 'The tank holds 500 gallons of fuel.'],
  ])('the same figure in a different unit fires: %s -> %s', (a, b) => {
    const out = diff(a, b);
    if (b.includes('percent')) {
      // "40%" and "40 percent" are the same unit.
      expect(out).toEqual([]);
    } else {
      expect(out.map((f) => f.kind)).toEqual(['number']);
    }
  });

  it('a unit of measure against a plain word fires, and the chip shows both units', () => {
    expect(pairs('Support was 40% in March.', 'Support was 40 people in March.')).toEqual([
      ['number', '40%', '40 people'],
    ]);
  });

  it('a plain next word that changed is not a unit change ("12 were" vs "12 people")', () => {
    expect(
      diff('Officials said 12 were injured.', 'Officials said 12 people were injured.'),
    ).toEqual([]);
  });

  it('swapped figures fire for both slots', () => {
    const out = pairs(
      'The crash left 14 dead and 12 injured, police said.',
      'The crash left 12 dead and 14 injured, police said.',
    );
    expect(out).toHaveLength(2);
    expect(out).toContainEqual(['number', '14', '12']);
    expect(out).toContainEqual(['number', '12', '14']);
  });

  it('the same figures in a different order still do not fire', () => {
    expect(
      diff(
        'The crash left 14 dead and 12 injured, police said.',
        'Police said 12 were injured and 14 were dead after the crash.',
      ).filter((f) => f.kind === 'number'),
    ).toEqual([]);
  });

  it('ISO dates keep their year', () => {
    expect(
      pairs('The hearing is set for 2025-03-14.', 'The hearing is set for 2026-03-14.'),
    ).toEqual([['date', '2025-03-14', '2026-03-14']]);
  });

  it('an ISO date and the same day written out are the same date', () => {
    expect(
      diff('The hearing is set for 2026-03-14.', 'The hearing is set for March 14.').filter(
        (f) => f.kind === 'date',
      ),
    ).toEqual([]);
  });
});
