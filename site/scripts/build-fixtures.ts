/**
 * Runs the repo's three authored fixture stories through the REAL engine (EngineHost, IndexedDB via
 * fake-indexeddb, the real MiniLM int8 model) and writes what the site needs:
 *
 *   src/data/samples.json        the sample stories for the web app (paragraph text, outlet, title)
 *   src/data/embeddings.json     the model's vectors for those paragraphs, so the web app can show
 *                                the "similar meaning" tier on samples without a 23 MB download
 *   src/generated/views.json     the engine's answer for every sample article, read in order, with
 *                                fixed read times (rendered into the landing page's static HTML)
 *   src/generated/measured.json  corpus metrics and package sizes copied from the repo's
 *                                metrics.json and scripts/size-baseline.json (never estimated)
 *
 * Nothing here is invented: tiers, tags, drift tokens and counts are whatever the engine returned.
 * Run `pnpm fixtures` after changing the fixtures or the engine.
 */
import 'fake-indexeddb/auto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Embedder } from '@engine';
import { createEngine, dequantize, quantize, textFingerprint } from '@engine';
import { buildView, type ArticleView } from '../src/shared/view';
import { nodeEmbedder } from './node-embedder';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(SITE, '..');
const CORPUS = join(ROOT, 'tests', 'fixtures', 'corpus', 'stories');

interface RawArticle {
  url: string;
  siteName: string;
  title: string;
  kind: 'news' | 'blog' | 'liveblog';
  readAtMinutes: number;
  paragraphs: string[];
}
interface RawStory {
  id: string;
  story: string;
  license: string;
  readingOrder: string[];
  articles: Record<string, RawArticle>;
}

/** Local morning start, so relative strings ("yesterday") do not depend on the build machine. */
const BASE = new Date(2026, 9, 19, 7, 40, 0).getTime();
const MIN = 60_000;

const vectors = new Map<string, { q: Int8Array; scale: number }>();

function recording(inner: Embedder): Embedder {
  return {
    id: inner.id,
    async embed(texts) {
      const out = await inner.embed(texts);
      texts.forEach((t, i) => {
        const v = out[i];
        if (v) vectors.set(textFingerprint(t), quantize(v));
      });
      // Hand the engine the same dequantised vectors the web app will use.
      return out.map((v) => dequantize(quantize(v)));
    },
  };
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

async function main(): Promise<void> {
  const embedder = recording(await nodeEmbedder());
  const files = readdirSync(CORPUS)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const stories = files.map((f) => JSON.parse(readFileSync(join(CORPUS, f), 'utf8')) as RawStory);

  const samples: unknown[] = [];
  const views: Record<string, Record<string, ArticleView & { readAt: number }>> = {};

  for (const story of stories) {
    let clock = BASE;
    const engine = await createEngine({
      dbName: `fixtures-${story.id}`,
      embedder,
      now: () => clock,
    });
    const storyViews: Record<string, ArticleView & { readAt: number }> = {};
    views[story.id] = storyViews;
    const articles = [];
    for (const key of story.readingOrder) {
      const a = story.articles[key] as RawArticle;
      clock = BASE + a.readAtMinutes * MIN;
      const meta = {
        url: a.url,
        canonicalUrl: a.url,
        siteName: a.siteName,
        title: a.title,
        kind: a.kind,
      };
      const inputs = a.paragraphs.map((text, ordinal) => ({ ordinal, text }));
      const resp = await engine.host.analyse(meta, inputs);
      const view = buildView(meta, inputs, resp, clock);
      await engine.host.markRead(
        a.url,
        inputs.map((i) => i.ordinal),
      );
      // The card's changed figures exist only once the article's paragraphs are remembered, so the
      // card is taken from a second analysis, as the extension does while the reader reads.
      const after = await engine.host.analyse(meta, inputs);
      storyViews[key] = {
        ...view,
        card: buildView(meta, inputs, after, clock).card,
        readAt: clock,
      };
      articles.push({
        key,
        url: a.url,
        siteName: a.siteName,
        title: a.title,
        kind: a.kind,
        readAfterMinutes: a.readAtMinutes,
        paragraphs: a.paragraphs,
      });
    }
    engine.close();
    samples.push({ id: story.id, label: story.story, license: story.license, articles });
  }

  mkdirSync(join(SITE, 'src', 'data'), { recursive: true });
  mkdirSync(join(SITE, 'src', 'generated'), { recursive: true });
  writeFileSync(join(SITE, 'src', 'data', 'samples.json'), JSON.stringify(samples, null, 1) + '\n');

  const table: Record<string, string> = {};
  for (const [fp, v] of [...vectors].sort(([a], [b]) => a.localeCompare(b))) {
    table[fp] = `${v.scale.toPrecision(8)}:${b64(new Uint8Array(v.q.buffer))}`;
  }
  writeFileSync(
    join(SITE, 'src', 'data', 'embeddings.json'),
    JSON.stringify({ model: 'Xenova/all-MiniLM-L6-v2 (q8)', dim: 384, vectors: table }) + '\n',
  );
  writeFileSync(
    join(SITE, 'src', 'generated', 'views.json'),
    JSON.stringify(views, null, 1) + '\n',
  );

  const metrics = JSON.parse(readFileSync(join(ROOT, 'metrics.json'), 'utf8'));
  const size = JSON.parse(readFileSync(join(ROOT, 'scripts', 'size-baseline.json'), 'utf8'));
  writeFileSync(
    join(SITE, 'src', 'generated', 'measured.json'),
    JSON.stringify({ metrics, size }, null, 1) + '\n',
  );
  console.log(
    `fixtures: ${stories.length} stories, ${vectors.size} embedded paragraphs, ` +
      `embeddings.json ${(JSON.stringify(table).length / 1024).toFixed(0)} KB`,
  );
}

await main();
