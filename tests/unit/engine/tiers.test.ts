import { describe, expect, it } from 'vitest';
import type { DriftFinding } from '../../../src/engine/guard';
import type { TierInput } from '../../../src/engine/tiers';
import { decideTier, isFaded } from '../../../src/engine/tiers';
import { THRESHOLDS } from '../../../src/engine/thresholds';

const F: DriftFinding = {
  kind: 'number',
  before: '12',
  after: '14',
  beforeNorm: '12',
  afterNorm: '14',
  offset: 0,
  length: 2,
  context: '',
};

const base: TierInput = { j: 0, gj: [], lenRatio: 1, c: 0, jc: 0, gc: [], feedback: false };
const t = (over: Partial<TierInput>) => decideTier({ ...base, ...over });

// AC6.1: the decision table holds for synthetic pairs (ADR §5), first matching row wins.
describe('decideTier', () => {
  it('row 1: feedback beats everything', () => {
    expect(t({ feedback: true, j: 1, c: 1 })).toEqual({ tier: 'new', basis: null, row: 1 });
  });
  it('row 2: same wording with a changed fact is changed', () => {
    expect(t({ j: 0.9, gj: [F] })).toMatchObject({ tier: 'changed', basis: 'jaccard', row: 2 });
    expect(t({ c: 0.95, gc: [F] })).toMatchObject({ tier: 'changed', basis: 'cosine', row: 2 });
  });
  it('row 3: similar meaning with a changed fact is changed', () => {
    expect(t({ c: 0.85, gc: [F] })).toMatchObject({ tier: 'changed', row: 3 });
  });
  it('row 4: same wording, clean guard, similar length is seen', () => {
    expect(t({ j: 0.6 })).toMatchObject({ tier: 'seen', basis: 'jaccard', row: 4 });
    expect(t({ j: 0.8, lenRatio: 0.7 })).toMatchObject({ tier: 'seen', row: 4 });
    expect(t({ j: 0.8, lenRatio: 1.4 })).toMatchObject({ tier: 'seen', row: 4 });
  });
  it('row 4 does not fire outside the length window', () => {
    expect(t({ j: 0.8, lenRatio: 0.5 }).tier).toBe('new');
    expect(t({ j: 0.8, lenRatio: 1.6 }).tier).toBe('new');
  });
  it('row 5: duplicated meaning with overlapping wording is seen', () => {
    expect(t({ c: 0.95, jc: 0.4 })).toMatchObject({ tier: 'seen', basis: 'cosine', row: 5 });
  });
  it('row 6: similar meaning, clean guard is similar', () => {
    expect(t({ c: 0.85 })).toMatchObject({ tier: 'similar', row: 6 });
    expect(t({ c: 0.95, jc: 0.1 })).toMatchObject({ tier: 'similar', row: 6 });
  });
  it('row 7: otherwise new', () => {
    expect(t({ j: 0.59, c: 0.81 })).toMatchObject({ tier: 'new', row: 7 });
    expect(t({})).toMatchObject({ tier: 'new', row: 7 });
  });
  it('boundaries are inclusive at each threshold', () => {
    expect(t({ j: THRESHOLDS.jSeen }).tier).toBe('seen');
    expect(t({ c: THRESHOLDS.cSim }).tier).toBe('similar');
    expect(t({ c: THRESHOLDS.cDup, jc: THRESHOLDS.jNear }).tier).toBe('seen');
  });
  it('guard before fade: a finding never yields a faded tier', () => {
    for (const j of [0, 0.35, 0.6, 1]) {
      for (const c of [0, 0.82, 0.93, 1]) {
        const d = t({ j, c, jc: j, gj: [F], gc: [F] });
        expect(isFaded(d.tier)).toBe(false);
      }
    }
  });
  it('accepts custom thresholds', () => {
    expect(decideTier({ ...base, j: 0.5 }, { ...THRESHOLDS, jSeen: 0.5 }).tier).toBe('seen');
  });
});
