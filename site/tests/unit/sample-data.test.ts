/**
 * The bundled samples are the web app's only path to the "similar meaning" tier without a 23 MB
 * download, and the landing page renders the engine's answers for them. These tests fail when the
 * generated data (src/data, src/generated) goes stale against the authored corpus, i.e. when
 * someone edits a fixture story or the engine and forgets `pnpm fixtures`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dequantize, isSkippable, normalizeText, textFingerprint } from '@engine';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS = join(SITE, '..', 'tests', 'fixtures', 'corpus', 'stories');
const read = <T>(p: string): T => JSON.parse(readFileSync(join(SITE, p), 'utf8')) as T;

interface Sample {
  id: string;
  articles: { key: string; url: string; siteName: string; paragraphs: string[] }[];
}
interface Corpus {
  id: string;
  articles: Record<string, { url: string; siteName: string; paragraphs: string[] }>;
}

const samples = read<Sample[]>('src/data/samples.json');
const vectors = read<{ dim: number; vectors: Record<string, string> }>('src/data/embeddings.json');
const corpus = readdirSync(CORPUS)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(CORPUS, f), 'utf8')) as Corpus);

describe('bundled sample data', () => {
  it('every sample story and article is the authored corpus text, unchanged', () => {
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      const src = corpus.find((c) => c.id === s.id);
      expect(src, `corpus story for sample "${s.id}"`).toBeDefined();
      for (const a of s.articles) {
        const raw = src?.articles[a.key];
        expect(raw, `${s.id}/${a.key} exists in the corpus`).toBeDefined();
        expect(a.paragraphs, `${s.id}/${a.key} text`).toEqual(raw?.paragraphs);
        expect(a.url).toBe(raw?.url);
        expect(a.siteName).toBe(raw?.siteName);
      }
    }
  });

  it('every comparable sample paragraph has a precomputed vector (else the sample silently degrades)', () => {
    const missing: string[] = [];
    for (const s of samples)
      for (const a of s.articles)
        for (const p of a.paragraphs) {
          const text = normalizeText(p);
          if (isSkippable(text)) continue;
          if (!(textFingerprint(text) in vectors.vectors)) missing.push(`${s.id}/${a.key}: ${p}`);
        }
    expect(missing).toEqual([]);
  });

  it('vectors are unit-length-ish int8 of the stated dimension, with no orphan entries', () => {
    const used = new Set<string>();
    for (const s of samples)
      for (const a of s.articles)
        for (const p of a.paragraphs) used.add(textFingerprint(normalizeText(p)));
    for (const [fp, packed] of Object.entries(vectors.vectors)) {
      expect(used.has(fp), `orphan vector ${fp}`).toBe(true);
      const [scale, b64] = packed.split(':') as [string, string];
      const bin = Buffer.from(b64, 'base64');
      expect(bin.length).toBe(vectors.dim);
      const q = new Int8Array(bin.buffer, bin.byteOffset, bin.length);
      const v = dequantize({ q, scale: Number(scale) });
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeGreaterThan(0.97);
      expect(norm).toBeLessThan(1.03);
    }
  });
});
