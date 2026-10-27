import 'fake-indexeddb/auto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as core from '../../../src/core';
import { createEngine } from '../../../src/core';
import type { Engine } from '../../../src/core';
import { loadStory } from '../../helpers/stories';

let n = 0;
let engine: Engine | null = null;
afterEach(() => engine?.close());

const story = loadStory('kessel-valley-rail');
const first = story.articles[story.readingOrder[0] as string]!;
const second = story.articles[story.readingOrder[1] as string]!;
const pageOf = (a: typeof first) => ({
  url: a.url,
  canonicalUrl: a.url,
  siteName: a.siteName,
  title: a.title,
  kind: 'news' as const,
});
const paragraphsOf = (a: typeof first) => a.paragraphs.map((text, ordinal) => ({ ordinal, text }));

async function make(): Promise<Engine> {
  engine = await createEngine({
    dbName: `core-engine-${++n}`,
    embedder: new core.FakeEmbedder(),
    now: () => new Date(2026, 9, 20, 8, 0).getTime(),
  });
  return engine;
}

describe('core entry module', () => {
  it('exports the surface both the extension and the web app need', () => {
    for (const name of [
      'createEngine',
      'EngineHost',
      'MemoryIndex',
      'matchArticle',
      'guard',
      'decideTier',
      'analyseDocument',
      'DwellTracker',
      'solveFade',
      'pillText',
      'MemorySettingsStore',
      'openOldNewsDb',
      'parseMessage',
      'LazyEmbedder',
      'createTransformersEmbedder',
      'THRESHOLDS',
    ]) {
      expect(core, name).toHaveProperty(name);
    }
  });

  it('runs the whole flow through untrusted messages', async () => {
    const e = await make();
    const ingest = await e.handle({
      type: 'page/ingest',
      page: pageOf(first),
      paragraphs: paragraphsOf(first),
    });
    expect(ingest).toMatchObject({ ok: true });

    const reply = await e.handle({
      type: 'page/analyse',
      page: pageOf(second),
      paragraphs: paragraphsOf(second),
    });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    const data = reply.data as core.AnalyseResponse;
    expect(data.paragraphs.length).toBe(second.paragraphs.length);
    expect(data.summary.seen + data.summary.similar + data.summary.changed).toBeGreaterThan(0);

    const stats = await e.handle({ type: 'memory/stats' });
    expect(stats).toMatchObject({ ok: true, data: { articles: 1 } });
    const wiped = await e.handle({ type: 'memory/wipe' });
    expect(wiped.ok).toBe(true);
    expect(await e.handle({ type: 'memory/stats' })).toMatchObject({
      data: { paragraphs: 0, articles: 0 },
    });
  });

  it('refuses malformed, unknown and non-engine messages', async () => {
    const e = await make();
    for (const bad of [
      null,
      'x',
      {},
      { type: 'nope' },
      { type: 'page/analyse' },
      { type: 'page/read', canonicalUrl: 1 },
    ]) {
      expect(await e.handle(bad)).toEqual({ ok: false, error: 'invalid message' });
    }
    expect(await e.handle({ type: 'settings/changed' })).toMatchObject({ ok: false });
  });

  it('works with no embedder: degraded engine, seen and changed tiers still run', async () => {
    const e = await createEngine({ dbName: `core-engine-${++n}`, embedder: null });
    engine = e;
    await e.host.ingest(pageOf(first), paragraphsOf(first));
    const r = await e.host.analyse(pageOf(second), paragraphsOf(second));
    expect(r.degraded).toBe(true);
    expect(r.paragraphs.every((p) => p.tier !== 'similar')).toBe(true);
  });
});

describe('web-app reuse: the core stays free of extension APIs', () => {
  const ROOT = join(process.cwd(), 'src');
  const PURE_DIRS = [
    'engine',
    'extract',
    'paint',
    'host',
    'store',
    'embed',
    'core',
    'messaging',
    'net',
  ];
  const FORBIDDEN =
    /\b(?:chrome|browser)\s*\.\s*(?:runtime|storage|tabs|scripting|offscreen|alarms|action|windows|i18n)\b|from\s+['"]wxt/;

  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
    });
  }

  it.each(PURE_DIRS)('src/%s has no chrome.*, browser.* or wxt imports', (dir) => {
    for (const f of files(join(ROOT, dir))) {
      expect(stripComments(readFileSync(f, 'utf8')), f).not.toMatch(FORBIDDEN);
    }
  });
});
