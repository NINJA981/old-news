/**
 * Corpus evaluation with the REAL model (SPEC F19, AC19.1, ADR §8).
 *
 *   pnpm eval            run, write metrics.json, fail on a gate violation
 *   pnpm eval --no-gate  run and write metrics.json only
 *
 * Simulates reading each authored story in order, scores every paragraph's tier against its hand
 * label, then runs the changed-meaning minimal pairs through the same matcher. Uses the bundled
 * MiniLM weights via transformers.js in Node (public/models, fetched by `pnpm fetch-model`).
 * Nothing here touches the network.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Embedder } from '../src/engine/embedder';
import { capFacts } from '../src/engine/facts';
import { embedPrepared, matchArticle, prepareParagraph } from '../src/engine/match';
import { entryFromRecord, MemoryIndex } from '../src/engine/memoryIndex';
import { snippet } from '../src/engine/normalize';
import { THRESHOLDS, THRESHOLDS_PROVENANCE } from '../src/engine/thresholds';
import type { Tier } from '../src/engine/tiers';
import { isFaded } from '../src/engine/tiers';
import type { ParagraphRecord } from '../src/engine/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = join(ROOT, 'tests', 'fixtures', 'corpus');

interface Label {
  tier: Tier;
  variant?: 'verbatim' | 'edit' | 'paraphrase';
}
interface Article {
  paragraphs: string[];
  labels: Label[];
}
interface Story {
  id: string;
  readingOrder: string[];
  articles: Record<string, Article>;
}
interface Pair {
  id: string;
  kind: string;
  expect: 'fires' | 'quiet';
  a: string;
  b: string;
}

async function nodeEmbedder(): Promise<Embedder> {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = `${join(ROOT, 'public', 'models')}/`;
  const extractor = (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'q8',
  })) as unknown as (
    t: string[],
    o: { pooling: 'mean'; normalize: boolean },
  ) => Promise<{ data: Float32Array; dims: number[] }>;
  return {
    id: 'Xenova/all-MiniLM-L6-v2:q8:node',
    async embed(texts) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += 16) {
        const batch = texts.slice(i, i + 16);
        const t = await extractor(batch, { pooling: 'mean', normalize: true });
        const dim = t.dims[t.dims.length - 1] as number;
        for (let r = 0; r < batch.length; r++) out.push(t.data.slice(r * dim, (r + 1) * dim));
      }
      return out;
    },
  };
}

async function remember(
  index: MemoryIndex,
  embedder: Embedder,
  articleId: string,
  texts: readonly string[],
  readAt: number,
): Promise<void> {
  const prepared = texts.map((text, ordinal) => prepareParagraph({ ordinal, text }));
  await embedPrepared(prepared, embedder);
  for (const p of prepared.filter((x) => !x.skip)) {
    const rec: ParagraphRecord = {
      id: `${articleId}#${p.ordinal}`,
      articleId,
      ordinal: p.ordinal,
      snippet: snippet(p.text),
      minhash: p.minhash,
      bands: p.bands,
      vec: p.vec?.q ?? null,
      vecScale: p.vec?.scale ?? 0,
      facts: capFacts(p.facts),
      words: p.words,
      chars: p.chars,
      readAt,
      expiresAt: readAt + 30 * 86_400_000,
    };
    index.add(entryFromRecord(rec));
  }
}

const ratio = (n: number, d: number): number | null =>
  d === 0 ? null : Math.round((n / d) * 1000) / 1000;

async function main(): Promise<void> {
  const embedder = await nodeEmbedder();
  const stories = readdirSync(join(CORPUS, 'stories'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CORPUS, 'stories', f), 'utf8')) as Story);

  // Confusion counts over every non-first article's paragraphs.
  let predSeen = 0;
  let predSeenOk = 0;
  let predFaded = 0;
  let predFadedOk = 0;
  let wireTotal = 0;
  let wireHit = 0;
  let paraTotal = 0;
  let paraHit = 0;
  let paraSeen = 0;
  let changedLabelled = 0;
  let changedLit = 0;
  let changedFadedLabelled = 0;
  let newLabelled = 0;
  let newFaded = 0;
  const misses: string[] = [];

  for (const story of stories) {
    const index = new MemoryIndex();
    for (const [step, key] of story.readingOrder.entries()) {
      const article = story.articles[key] as Article;
      const { result } = await matchArticle(
        article.paragraphs.map((text, ordinal) => ({ ordinal, text })),
        index,
        embedder,
      );
      for (const m of result.paragraphs) {
        const label = article.labels[m.ordinal] as Label;
        const where = `${story.id}/${key}#${m.ordinal}`;
        if (m.tier === 'seen') {
          predSeen++;
          if (label.tier === 'seen') predSeenOk++;
          else misses.push(`${where}: predicted seen, labelled ${label.tier}`);
        }
        if (isFaded(m.tier)) {
          predFaded++;
          if (label.tier === 'seen' || label.tier === 'similar') predFadedOk++;
        }
        if (label.tier === 'seen' && label.variant !== 'paraphrase') {
          wireTotal++;
          if (m.tier === 'seen') wireHit++;
          else misses.push(`${where}: wire recall miss (got ${m.tier})`);
        }
        if (label.variant === 'paraphrase') {
          paraTotal++;
          if (isFaded(m.tier)) paraHit++;
          if (m.tier === 'seen') paraSeen++;
        }
        if (label.tier === 'changed') {
          changedLabelled++;
          if (m.tier === 'changed') changedLit++;
          if (isFaded(m.tier)) changedFadedLabelled++;
        }
        if (label.tier === 'new') {
          newLabelled++;
          if (isFaded(m.tier)) {
            newFaded++;
            misses.push(`${where}: new paragraph was faded as ${m.tier}`);
          }
        }
      }
      await remember(index, embedder, `${story.id}/${key}`, article.paragraphs, step + 1);
    }
  }

  // Changed-meaning minimal pairs: remember `a`, then match `b`.
  const pairs = readFileSync(join(CORPUS, 'changed-meaning.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Pair);
  let firesTotal = 0;
  let firesCaught = 0;
  let firesFaded = 0;
  let quietTotal = 0;
  let quietFaded = 0;
  for (const p of pairs) {
    const index = new MemoryIndex();
    await remember(index, embedder, 'earlier', [p.a], 1);
    const { result } = await matchArticle([{ ordinal: 0, text: p.b }], index, embedder);
    const tier = result.paragraphs[0]?.tier ?? 'new';
    if (p.expect === 'fires') {
      firesTotal++;
      if (tier === 'changed') firesCaught++;
      if (isFaded(tier)) {
        firesFaded++;
        misses.push(`pair ${p.id}: changed meaning was faded as ${tier}`);
      }
    } else {
      quietTotal++;
      if (isFaded(tier)) quietFaded++;
    }
  }

  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'scripts', 'model-manifest.json'), 'utf8'),
  ) as {
    files: Record<string, { sha256: string }>;
  };
  const corpusHash = createHash('sha256')
    .update(readFileSync(join(CORPUS, 'changed-meaning.jsonl')))
    .update(
      readdirSync(join(CORPUS, 'stories'))
        .sort()
        .map((f) => readFileSync(join(CORPUS, 'stories', f), 'utf8'))
        .join('\n'),
    )
    .digest('hex');

  const metrics = {
    measuredAt: new Date().toISOString(),
    corpus: {
      stories: stories.length,
      articles: stories.reduce((a, s) => a + Object.keys(s.articles).length, 0),
      labelledParagraphs: stories.reduce(
        (a, s) => a + Object.values(s.articles).reduce((b, x) => b + x.paragraphs.length, 0),
        0,
      ),
      changedMeaningPairs: pairs.length,
      negativesWikinews: 0,
      sha256: corpusHash,
    },
    model: {
      id: 'Xenova/all-MiniLM-L6-v2 (q8)',
      sha256: manifest.files['onnx/model_quantized.onnx']?.sha256 ?? null,
    },
    thresholds: { ...THRESHOLDS, status: THRESHOLDS_PROVENANCE.status },
    metrics: {
      seenPrecision: ratio(predSeenOk, predSeen),
      fadePrecision: ratio(predFadedOk, predFaded),
      wireRecall: ratio(wireHit, wireTotal),
      paraphraseRecall: ratio(paraHit, paraTotal),
      paraphraseAsFullFade: paraSeen,
      changedLabelledStillLit: ratio(changedLit, changedLabelled),
      changedLabelledFaded: changedFadedLabelled,
      newParagraphsFaded: newFaded,
      changedMeaningRecall: ratio(firesCaught, firesTotal),
      changedMeaningFullFades: firesFaded,
      quietControlsFaded: `${quietFaded}/${quietTotal}`,
    },
    counts: {
      newLabelled,
      predSeen,
      predSeenOk,
      wireTotal,
      wireHit,
      paraTotal,
      paraHit,
      firesTotal,
      firesCaught,
    },
    misses,
  };
  writeFileSync(join(ROOT, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(JSON.stringify({ corpus: metrics.corpus, metrics: metrics.metrics }, null, 2));
  if (misses.length > 0) console.log(`\n${misses.length} miss(es), listed in metrics.json`);

  if (process.argv.includes('--no-gate')) return;
  const failures: string[] = [];
  const seenP = metrics.metrics.seenPrecision;
  if (seenP !== null && seenP < 0.98) failures.push(`seen precision ${seenP} < 0.98`);
  if (firesFaded > 0) failures.push(`${firesFaded} changed-meaning pair(s) were faded`);
  if (changedFadedLabelled > 0)
    failures.push(`${changedFadedLabelled} labelled-changed paragraph(s) were faded`);
  if (failures.length > 0) {
    console.error(`GATE FAILED:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log('Gates passed: seen precision >= 0.98, 0 changed-meaning full fades.');
  }
}

await main();
