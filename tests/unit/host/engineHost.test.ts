import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeEmbedder } from '../../../src/engine/fakeEmbedder';
import { EngineHost, driftContext } from '../../../src/host/engineHost';
import { handleEngineMessage } from '../../../src/host/handle';
import type { PageMeta } from '../../../src/messaging/protocol';
import type { Db } from '../../../src/store/db';
import { openOldNewsDb } from '../../../src/store/db';
import { storeCounts } from '../../../src/store/repo';
import { loadStory } from '../../helpers/stories';

const DAY = 86_400_000;
let db: Db;
let clock: number;
let n = 0;

beforeEach(async () => {
  db = await openOldNewsDb(`host-test-${++n}`);
  clock = new Date(2026, 9, 20, 7, 40).getTime();
});
afterEach(() => db.close());

function host(embedder = new FakeEmbedder()) {
  return new EngineHost({ db, embedder, now: () => clock, sessionStart: clock });
}

const story = loadStory('port-alder-fire');
const meta = (key: string): PageMeta => {
  const a = story.articles[key]!;
  return { url: a.url, canonicalUrl: a.url, siteName: a.siteName, title: a.title, kind: 'news' };
};
const paras = (key: string) =>
  story.articles[key]!.paragraphs.map((text, ordinal) => ({ ordinal, text }));

describe('EngineHost', () => {
  it('analyses without persisting anything', async () => {
    const h = host();
    const r = await h.analyse(meta('wire'), paras('wire'));
    expect(r.summary.total).toBe(paras('wire').length);
    expect(r.summary.new).toBe(r.summary.total);
    expect(r.previouslyOn).toBeNull();
    const counts = await storeCounts(db);
    expect(counts.paragraphs).toBe(0);
    expect(counts.articles).toBe(0);
  });

  it('remembers read paragraphs, then fades them on a rewrite with provenance', async () => {
    const h = host();
    await h.ingest(meta('wire'), paras('wire'));
    clock += 6 * 60_000;
    const r = await h.analyse(meta('calder'), paras('calder'));
    const seen = r.paragraphs.filter((p) => p.tier === 'seen');
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[0]?.provenance).toMatchObject({
      siteName: 'Fenwick Wire',
      title: story.articles.wire!.title,
    });
    expect(seen[0]?.provenance?.snippet.length).toBeLessThanOrEqual(140);
    expect(seen[0]?.matchKind).toBe('wording');
    expect(r.previouslyOn?.articles.map((a) => a.siteName)).toEqual(['Fenwick Wire']);
  });

  it('marks the changed figure, records drift on read, and links a story', async () => {
    const h = host();
    await h.ingest(meta('wire'), paras('wire'));
    clock += DAY;
    const r = await h.analyse(meta('day2'), paras('day2'));
    const changed = r.paragraphs.filter((p) => p.tier === 'changed');
    expect(changed.length).toBeGreaterThanOrEqual(1);
    expect(changed.flatMap((c) => c.drift.map((d) => `${d.before}->${d.after}`))).toContain(
      'Twelve->14',
    );
    const read = await h.markRead(
      meta('day2').canonicalUrl,
      r.paragraphs.map((p) => p.ordinal),
    );
    expect(read.driftRecorded).toBeGreaterThanOrEqual(1);
    expect(read.storyId).not.toBeNull();
    const drift = await h.listDrift(read.storyId!);
    expect(drift[0]).toMatchObject({ before: 'Twelve', after: '14', kind: 'number' });
    expect(drift[0]!.context.length).toBeLessThanOrEqual(60);
    const stories = await h.listStories();
    expect(stories).toHaveLength(1);
    expect(stories[0]!.articleIds).toHaveLength(2);
  });

  it('does not match an article against itself within the session', async () => {
    const h = host();
    await h.ingest(meta('wire'), paras('wire'));
    const again = await h.analyse(meta('wire'), paras('wire'));
    expect(again.summary.seen).toBe(0);
  });

  it('but does match it in a later session', async () => {
    await host().ingest(meta('wire'), paras('wire'));
    clock += DAY;
    const later = new EngineHost({
      db,
      embedder: new FakeEmbedder(),
      now: () => clock,
      sessionStart: clock,
    });
    const again = await later.analyse(meta('wire'), paras('wire'));
    expect(again.summary.seen).toBeGreaterThan(0);
  });

  it('ignores reads for unknown articles and repeated ordinals', async () => {
    const h = host();
    expect(await h.markRead('https://nowhere.example/x', [0])).toMatchObject({ remembered: 0 });
    await h.analyse(meta('wire'), paras('wire'));
    const first = await h.markRead(meta('wire').canonicalUrl, [0, 1]);
    const second = await h.markRead(meta('wire').canonicalUrl, [0, 1]);
    expect(first.remembered).toBe(2);
    expect(second.remembered).toBe(0);
  });

  it('honours "Not old news" feedback', async () => {
    const h = host();
    await h.ingest(meta('wire'), paras('wire'));
    clock += 60_000;
    const r = await h.analyse(meta('calder'), paras('calder'));
    const seen = r.paragraphs.find((p) => p.tier === 'seen')!;
    await h.addFeedback(seen.fingerprint, seen.provenance!.paragraphId);
    const r2 = await h.analyse(meta('calder'), paras('calder'));
    expect(r2.paragraphs.find((p) => p.ordinal === seen.ordinal)?.tier).toBe('new');
  });

  it('counts daily words for the receipt', async () => {
    const h = host();
    expect(await h.receipt()).toBeNull();
    await h.ingest(meta('wire'), paras('wire'));
    await h.analyse(meta('calder'), paras('calder'));
    await h.markRead(
      meta('calder').canonicalUrl,
      paras('calder').map((p) => p.ordinal),
    );
    const r = await h.receipt();
    expect(r?.articles).toBe(2);
    expect(r?.wordsKnown).toBeGreaterThan(0);
    expect(r?.words).toBeGreaterThan(r!.wordsKnown);
  });

  it('runs degraded when the model fails, keeping seen and changed', async () => {
    const h = new EngineHost({
      db,
      embedder: { id: 'broken', embed: () => Promise.reject(new Error('no model')) },
      now: () => clock,
      sessionStart: clock,
    });
    await h.ingest(meta('wire'), paras('wire'));
    clock += 60_000;
    const r = await h.analyse(meta('calder'), paras('calder'));
    expect(r.degraded).toBe(true);
    expect(r.summary.seen).toBeGreaterThan(0);
    expect(r.summary.similar).toBe(0);
    expect((await h.stats()).modelAvailable).toBe(false);
  });

  it('sweeps expired memory and wipes everything', async () => {
    const h = host();
    await h.ingest(meta('wire'), paras('wire'));
    expect(h.index.size).toBeGreaterThan(0);
    const stats = await h.stats();
    expect(stats.paragraphs).toBe(h.index.size);
    expect(stats.oldestReadAt).toBe(clock);
    clock += 31 * DAY;
    const report = await h.sweep();
    expect(report.paragraphs).toBeGreaterThan(0);
    expect(h.index.size).toBe(0);
    await h.ingest(meta('calder'), paras('calder'));
    await h.wipe();
    const counts = await storeCounts(db);
    expect(Object.values(counts).every((c) => c === 0)).toBe(true);
    expect(h.index.size).toBe(0);
  });

  it('routes protocol messages', async () => {
    const h = host();
    const r = await handleEngineMessage(h, {
      type: 'page/ingest',
      page: meta('wire'),
      paragraphs: paras('wire'),
    });
    expect(r.ok).toBe(true);
    const s = await handleEngineMessage(h, { type: 'memory/stats' });
    expect(s).toMatchObject({ ok: true, data: { articles: 1 } });
    const bad = await handleEngineMessage(h, { type: 'font/get', family: 'hanken' });
    expect(bad.ok).toBe(false);
  });
});

describe('driftContext', () => {
  it('keeps the token and stays within 60 characters', () => {
    const text =
      'Officials at the regional fire service said on Wednesday that 14 people were treated for smoke inhalation at the scene of the fire.';
    const offset = text.indexOf('14');
    const ctx = driftContext(text, {
      kind: 'number',
      before: '12',
      after: '14',
      beforeNorm: '12',
      afterNorm: '14',
      offset,
      length: 2,
      context: '',
    });
    expect(ctx).toContain('14 people');
    expect(ctx.length).toBeLessThanOrEqual(60);
  });
});
