/**
 * The fact-drift guard (SPEC F7, ADR-0001 §5). Compares the fact tokens of a new paragraph
 * against those of its best match and reports every load-bearing difference.
 *
 * Rules:
 *  - Facts are compared per kind as multisets, so identical tokens in a different order never fire.
 *  - Leftover facts are aligned by local context (the 3 words before) and, for numbers, unit.
 *    An aligned pair whose values differ is a finding ("12 -> 14").
 *  - Asymmetry rule: an outcome, negation or modal present on one side only always fires.
 *    A number, date, money amount or entity present on one side only fires only when it aligns
 *    with a different value on the other side; extra detail ("more details") does not fire.
 *  - Entities compare by token containment, so "Ruiz" and "Ana Ruiz" are the same entity.
 */
import type { Fact, FactKind } from './facts';
import { FACT_KINDS } from './facts';

export interface DriftFinding {
  kind: FactKind;
  /** Display text from the earlier paragraph ("" when the token is new). */
  before: string;
  /** Display text from the new paragraph ("" when the token disappeared). */
  after: string;
  beforeNorm: string;
  afterNorm: string;
  /** Offset of the changed token in the new paragraph's normalised text, or -1. */
  offset: number;
  /** Length of the changed token in the new paragraph, or 0. */
  length: number;
  /** Words before the token, for the drift list's context label. */
  context: string;
}

const ONE_SIDED_FIRES: ReadonlySet<FactKind> = new Set(['outcome', 'negation', 'modal']);

function entityEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const [small, big] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return small.every((t) => big.has(t));
}

/** Units of measure: the same figure in two of these is a different fact ("90 km", "90 miles"). */
const MEASURES: ReadonlySet<string> = new Set(
  (
    '% km kilometres kilometers miles mile mi m metres meters feet foot ft cm mm kg kilograms ' +
    'kilos pounds lb lbs tonnes tons grams g litres liters gallons mph kmh degrees mw gw ha ' +
    'hectares acres seconds minutes hours days weeks months years'
  ).split(' '),
);

function measure(unit: string): string {
  if (unit === 'percent' || unit === 'per cent') return '%';
  return unit.endsWith('s') && MEASURES.has(unit.slice(0, -1)) ? unit.slice(0, -1) : unit;
}

/**
 * Whether two facts' units allow them to be the same fact. Numbers: unless one side is a unit of
 * measure and the other differs ("40%" vs "40 people"); a plain next word ("12 were", "12 people")
 * never blocks. ISO dates: unless both carry a year and the years differ.
 */
function unitsCompatible(kind: FactKind, a: Fact, b: Fact): boolean {
  if (!a.unit || !b.unit) return true;
  if (kind === 'date') return a.unit === b.unit;
  if (kind !== 'number') return true;
  const ua = measure(a.unit);
  const ub = measure(b.unit);
  return ua === ub || (!MEASURES.has(ua) && !MEASURES.has(ub));
}

/** Same value, and nothing about the units says otherwise. */
function factsEqual(kind: FactKind, a: Fact, b: Fact): boolean {
  if (kind === 'entity') return entityEqual(a.norm, b.norm);
  return a.norm === b.norm && unitsCompatible(kind, a, b);
}

/** Same value in the same slot: also the same unit word, when both have one. */
function factsIdentical(kind: FactKind, a: Fact, b: Fact): boolean {
  return factsEqual(kind, a, b) && (kind !== 'number' || !a.unit || !b.unit || a.unit === b.unit);
}

function contextOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const sb = new Set(b.split(' '));
  let n = 0;
  for (const w of a.split(' ')) if (w && sb.has(w)) n++;
  return n;
}

function alignScore(kind: FactKind, a: Fact, b: Fact): number {
  let s = contextOverlap(a.ctx, b.ctx);
  if (kind === 'number' && a.unit && measure(a.unit) === measure(b.unit)) s += 2;
  return s;
}

function lastWord(ctx: string): string {
  const parts = ctx.split(' ');
  return parts[parts.length - 1] ?? '';
}

/** "will" -> "will not": negation findings carry the preceding word so the chip reads naturally. */
function negationDisplay(f: Fact): string {
  const prev = lastWord(f.ctx);
  if (f.raw === "n't") return `${prev}n't`;
  return prev ? `${prev} ${f.raw}` : f.raw;
}

function finding(kind: FactKind, oldF: Fact | null, newF: Fact | null): DriftFinding {
  if (kind === 'negation') {
    const anchor = newF ?? oldF;
    const prev = anchor ? lastWord(anchor.ctx) : '';
    return {
      kind,
      before: oldF ? negationDisplay(oldF) : prev,
      after: newF ? negationDisplay(newF) : prev,
      beforeNorm: oldF?.norm ?? '',
      afterNorm: newF?.norm ?? '',
      offset: newF?.offset ?? -1,
      length: newF?.raw.length ?? 0,
      context: (newF ?? oldF)?.ctx ?? '',
    };
  }
  // Same figure, different unit ("40%" -> "40 people"): show the units so the chip makes sense.
  const withUnit = (f: Fact): string =>
    !f.unit || f.raw.toLowerCase().includes(f.unit) ? f.raw : `${f.raw} ${f.unit}`;
  const sameValue = kind === 'number' && !!oldF && !!newF && oldF.norm === newF.norm;
  return {
    kind,
    before: oldF ? (sameValue ? withUnit(oldF) : oldF.raw) : '',
    after: newF ? (sameValue ? withUnit(newF) : newF.raw) : '',
    beforeNorm: oldF?.norm ?? '',
    afterNorm: newF?.norm ?? '',
    offset: newF?.offset ?? -1,
    length: newF?.raw.length ?? 0,
    context: (newF ?? oldF)?.ctx ?? '',
  };
}

function guardKind(kind: FactKind, newFacts: Fact[], oldFacts: Fact[]): DriftFinding[] {
  const usedOld = new Set<number>();
  const leftNew: Fact[] = [];
  // 1. Cancel equal tokens (multiset semantics: order never matters), identical ones first.
  //    An equal value is kept apart only when its unit word shows a swap: the slot it filled
  //    ("14 dead") now holds a different value on the other side ("12 dead, 14 injured").
  const swapped = (f: Fact, others: readonly Fact[]): boolean =>
    kind === 'number' &&
    !!f.unit &&
    others.some((g) => g !== f && g.unit === f.unit && g.norm !== f.norm);
  const tryCancel = (n: Fact, strict: boolean): boolean => {
    for (let i = 0; i < oldFacts.length; i++) {
      const o = oldFacts[i];
      if (!o || usedOld.has(i)) continue;
      if (strict ? !factsIdentical(kind, n, o) : !factsEqual(kind, n, o)) continue;
      if (!strict && (swapped(o, newFacts) || swapped(n, oldFacts))) continue;
      usedOld.add(i);
      return true;
    }
    return false;
  };
  const afterStrict = newFacts.filter((n) => !tryCancel(n, true));
  for (const n of afterStrict) if (!tryCancel(n, false)) leftNew.push(n);
  const leftOld = oldFacts.filter((_, i) => !usedOld.has(i));
  if (leftNew.length === 0 && leftOld.length === 0) return [];

  // 2. Align leftovers by context (+ unit for numbers), best score first.
  const pairs: [Fact, Fact][] = [];
  const pairedNew = new Set<Fact>();
  const pairedOld = new Set<Fact>();
  const scored: { n: Fact; o: Fact; s: number }[] = [];
  for (const n of leftNew) {
    for (const o of leftOld) scored.push({ n, o, s: alignScore(kind, n, o) });
  }
  scored.sort((a, b) => b.s - a.s);
  for (const { n, o, s } of scored) {
    if (s < 1) break;
    if (pairedNew.has(n) || pairedOld.has(o)) continue;
    pairs.push([o, n]);
    pairedNew.add(n);
    pairedOld.add(o);
  }
  // An aligned pair with an equal value is a reworded slot ("12 were" vs "12 people"), not a change.
  for (let i = pairs.length - 1; i >= 0; i--) {
    const [o, n] = pairs[i] as [Fact, Fact];
    if (factsEqual(kind, n, o)) pairs.splice(i, 1);
  }
  // Unaligned leftovers with an equal value cancel as in step 1, just without the unit word.
  const restNew: Fact[] = [];
  const restOld = leftOld.filter((f) => !pairedOld.has(f));
  for (const n of leftNew) {
    if (pairedNew.has(n)) continue;
    const i = restOld.findIndex((o) => factsEqual(kind, n, o));
    if (i >= 0) restOld.splice(i, 1);
    else restNew.push(n);
  }
  // A single leftover on each side is the same slot with a different value.
  if (restNew.length === 1 && restOld.length === 1) {
    pairs.push([restOld[0] as Fact, restNew[0] as Fact]);
    restNew.length = 0;
    restOld.length = 0;
  }

  const out: DriftFinding[] = pairs.map(([o, n]) => finding(kind, o, n));
  if (ONE_SIDED_FIRES.has(kind)) {
    for (const n of restNew) out.push(finding(kind, null, n));
    for (const o of restOld) out.push(finding(kind, o, null));
  }
  return out;
}

/**
 * Differences between a new paragraph's facts and an earlier paragraph's facts.
 * An empty array means nothing load-bearing differs.
 */
export function guard(newFacts: readonly Fact[], oldFacts: readonly Fact[]): DriftFinding[] {
  const out: DriftFinding[] = [];
  for (const kind of FACT_KINDS) {
    const n = newFacts.filter((f) => f.kind === kind);
    const o = oldFacts.filter((f) => f.kind === kind);
    if (n.length === 0 && o.length === 0) continue;
    out.push(...guardKind(kind, n, o));
  }
  return out.sort((a, b) => a.offset - b.offset);
}
