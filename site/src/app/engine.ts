/**
 * The web app's thin adapter around the real engine (`src/core/index.ts`, via the `@engine` alias).
 * It owns only environment choices the engine deliberately leaves to the host:
 *  - which IndexedDB database to open (`old-news-web`, this origin only);
 *  - which Embedder to inject: the build-time vectors for the bundled sample stories (the same
 *    MiniLM model, precomputed), the real model if the reader opted in to download it, or none
 *    (the engine then runs degraded: exact wording and changed facts still work);
 *  - a clock, so the bundled samples can be read "earlier" and the tags have something to say.
 * No matching, fading or drift logic lives here, and nothing here talks to the network except
 * same-origin static files (the sample data, and the model if the reader asks for it).
 */
import type {
  AnalyseResponse,
  DisposableEmbedder,
  Embedder,
  Engine,
  InputParagraph,
  PageMeta,
  Settings,
  StoryRecord,
  ArticleRecord,
  DriftRecord,
} from '@engine';
import {
  canonicalizeUrl,
  createEngine,
  createTransformersEmbedder,
  dequantize,
  getArticles,
  articlesReadSince,
  isSkippable,
  normalizeText,
  textFingerprint,
} from '@engine';
import { WebSettingsStore } from '@adapters/chromeSettings';
import { buildCard, buildView, type ArticleView } from '../shared/view.ts';

export const DB_NAME_WEB = 'old-news-web';
const MODEL_FLAG = 'old-news:model-enabled';

// ---------------------------------------------------------------- settings

function safeStorage(): Storage {
  try {
    const s = window.localStorage;
    s.getItem('old-news:probe');
    return s;
  } catch {
    // Blocked storage: behave as in-memory for this session.
    const mem = new Map<string, string>();
    return {
      get length() {
        return mem.size;
      },
      clear: () => mem.clear(),
      getItem: (k) => mem.get(k) ?? null,
      key: (i) => [...mem.keys()][i] ?? null,
      removeItem: (k) => void mem.delete(k),
      setItem: (k, v) => void mem.set(k, v),
    };
  }
}

export const storage = safeStorage();
export const settingsStore = new WebSettingsStore(storage);
export type { Settings };

// ---------------------------------------------------------------- clock

let skew = 0;
const now = (): number => Date.now() + skew;

// ---------------------------------------------------------------- model

export type ModelState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; reason: string };

let modelState: ModelState = { status: 'off' };
let model: DisposableEmbedder | null = null;
let modelLoading: Promise<void> | null = null;
const modelListeners = new Set<(s: ModelState) => void>();

function setModelState(s: ModelState): void {
  modelState = s;
  for (const l of modelListeners) l(s);
}
export const getModelState = (): ModelState => modelState;
export function onModelState(l: (s: ModelState) => void): () => void {
  modelListeners.add(l);
  return () => modelListeners.delete(l);
}
export const modelWasEnabled = (): boolean => storage.getItem(MODEL_FLAG) === '1';

/** Downloads (first time) and starts the real MiniLM model, from this site's own files. */
export function enableModel(): Promise<void> {
  if (model) return Promise.resolve();
  modelLoading ??= (async () => {
    setModelState({ status: 'loading' });
    try {
      model = await createTransformersEmbedder({
        modelBaseUrl: `${location.origin}/models/`,
        ortBaseUrl: `${location.origin}/ort/`,
        backend: 'wasm',
      });
      storage.setItem(MODEL_FLAG, '1');
      setModelState({ status: 'ready' });
    } catch (err) {
      model = null;
      modelLoading = null;
      setModelState({
        status: 'error',
        reason: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  })();
  return modelLoading;
}

// Sample vectors, loaded only when a sample story or a known sample text needs them.
type VecTable = Map<string, { q: Int8Array; scale: number }>;
let vectors: Promise<VecTable> | null = null;
function sampleVectors(): Promise<VecTable> {
  vectors ??= import('../data/embeddings.json').then((m) => {
    const table: VecTable = new Map();
    for (const [fp, packed] of Object.entries(m.vectors as Record<string, string>)) {
      const [scale, b64] = packed.split(':') as [string, string];
      const bin = atob(b64);
      const q = new Int8Array(bin.length);
      for (let i = 0; i < bin.length; i++) q[i] = (bin.charCodeAt(i) << 24) >> 24;
      table.set(fp, { q, scale: Number(scale) });
    }
    return table;
  });
  return vectors;
}

function precomputed(table: VecTable): Embedder {
  return {
    id: 'minilm-q8-precomputed',
    async embed(texts) {
      return texts.map((t) => {
        const v = table.get(textFingerprint(t));
        if (!v) throw new Error('No precomputed vector for this text.');
        return dequantize(v);
      });
    },
  };
}

/** Which embedder the next analysis may use. Null means degraded (no meaning match). */
async function pickEmbedder(paragraphs: readonly string[]): Promise<Embedder | null> {
  const comparable = paragraphs.map((p) => normalizeText(p)).filter((p) => !isSkippable(p));
  if (comparable.length === 0) return null;
  const table = await sampleVectors().catch(() => null);
  if (table && comparable.every((p) => table.has(textFingerprint(p)))) return precomputed(table);
  if (!model && modelWasEnabled() && modelState.status === 'off') {
    await enableModel().catch(() => undefined);
  }
  return model;
}

// ---------------------------------------------------------------- engine

let enginePromise: Promise<Engine> | null = null;
export function getEngine(): Promise<Engine> {
  enginePromise ??= createEngine({ dbName: DB_NAME_WEB, embedder: null, now });
  return enginePromise;
}

export interface SessionArticle {
  id: string;
  meta: PageMeta;
  inputs: InputParagraph[];
  view: ArticleView;
  addedAt: number;
  /** True while the dissolve has not yet been shown for this view. */
  fresh: boolean;
  sample: boolean;
  /** How the meaning tier was provided for this article. */
  embedder: 'precomputed' | 'model' | 'off';
}

let counter = 0;

export interface NewArticle {
  title: string;
  siteName: string;
  /** Omit for pasted text; the app invents an unreachable `pasted.invalid` URL. */
  url?: string;
  paragraphs: readonly string[];
  /** When it was "read"; defaults to now. Samples are read earlier. */
  readAt?: number;
  sample?: boolean;
}

function pastedUrl(): string {
  return `https://pasted.invalid/a/${Date.now().toString(36)}${(counter++).toString(36)}`;
}

/** Analyses an article against everything remembered, then remembers it as read. */
export async function addArticle(a: NewArticle): Promise<SessionArticle> {
  const eng = await getEngine();
  const url = a.url ?? pastedUrl();
  const meta: PageMeta = {
    url,
    canonicalUrl: url,
    siteName: a.siteName || 'Pasted article',
    title: a.title || 'Untitled',
    kind: 'news',
  };
  const inputs = a.paragraphs.map((text, ordinal) => ({ ordinal, text }));
  const embedder = await pickEmbedder(a.paragraphs);
  eng.host.setEmbedder(embedder);
  skew = a.readAt ? a.readAt - Date.now() : 0;
  try {
    const at = now();
    const resp: AnalyseResponse = await eng.host.analyse(meta, inputs);
    const view = buildView(meta, inputs, resp, at);
    await eng.host.markRead(
      url,
      inputs.map((i) => i.ordinal),
    );
    // The card's changed figures exist once the paragraphs are remembered (as in the extension).
    if (resp.previouslyOn) {
      const after = await eng.host.analyse(meta, inputs);
      view.card = buildCard(after.previouslyOn, at);
    }
    return {
      id: `s${counter++}`,
      meta,
      inputs,
      view,
      addedAt: at,
      fresh: true,
      sample: a.sample === true,
      embedder: !embedder ? 'off' : embedder === model ? 'model' : 'precomputed',
    };
  } finally {
    skew = 0;
  }
}

export async function addFeedback(fingerprint: string, oldParagraphId: string): Promise<void> {
  const eng = await getEngine();
  await eng.host.addFeedback(fingerprint, oldParagraphId);
}

// ---------------------------------------------------------------- samples

export interface SampleArticle {
  key: string;
  url: string;
  siteName: string;
  title: string;
  kind: 'news' | 'blog' | 'liveblog';
  readAfterMinutes: number;
  paragraphs: string[];
}
export interface SampleStory {
  id: string;
  label: string;
  articles: SampleArticle[];
}

export async function loadSampleStories(): Promise<SampleStory[]> {
  const m = await import('../data/samples.json');
  return m.default as unknown as SampleStory[];
}

const isFixtureUrl = (url: string): boolean => {
  try {
    return new URL(url).hostname.endsWith('.example');
  } catch {
    return false;
  }
};

/**
 * Reads a sample story's articles in order, "earlier today" (spaced as the fixture says), so the
 * provenance tags have real times. If memory holds only earlier sample reads it is wiped first, so
 * the demo always starts clean; reader-pasted articles are never wiped.
 */
export async function readSampleStory(
  story: SampleStory,
  onArticle: (a: SessionArticle) => void,
): Promise<SessionArticle[]> {
  const eng = await getEngine();
  const existing = await articlesReadSince(eng.db, 0);
  let suffix = '';
  if (existing.length > 0) {
    if (existing.every((a) => isFixtureUrl(a.url))) await eng.host.wipe();
    else suffix = `?run=${Date.now().toString(36)}`;
  }
  const maxMin = Math.max(...story.articles.map((a) => a.readAfterMinutes));
  const out: SessionArticle[] = [];
  for (const a of story.articles) {
    const readAt = Date.now() - (maxMin - a.readAfterMinutes) * 60_000;
    const added = await addArticle({
      title: a.title,
      siteName: a.siteName,
      url: `${a.url}${suffix}`,
      paragraphs: a.paragraphs,
      readAt,
      sample: true,
    });
    out.push(added);
    onArticle(added);
  }
  return out;
}

// ---------------------------------------------------------------- history and memory

export interface StoryRow {
  story: StoryRecord;
  articles: ArticleRecord[];
  drift: DriftRecord[];
}

export async function loadStories(): Promise<{ rows: StoryRow[]; loose: ArticleRecord[] }> {
  const eng = await getEngine();
  const [stories, drift, all] = await Promise.all([
    eng.host.listStories(),
    eng.host.listDrift(),
    articlesReadSince(eng.db, 0),
  ]);
  const rows: StoryRow[] = [];
  const inStory = new Set<string>();
  for (const story of stories.sort((a, b) => b.updatedAt - a.updatedAt)) {
    const articles = (await getArticles(eng.db, story.articleIds)).sort(
      (a, b) => b.lastReadAt - a.lastReadAt,
    );
    for (const a of articles) inStory.add(a.id);
    rows.push({ story, articles, drift: drift.filter((d) => d.storyId === story.id) });
  }
  const loose = all.filter((a) => !inStory.has(a.id)).sort((a, b) => b.lastReadAt - a.lastReadAt);
  return { rows, loose };
}

export async function loadStats(): Promise<Awaited<ReturnType<Engine['host']['stats']>>> {
  const eng = await getEngine();
  return eng.host.stats();
}

export async function forgetEverything(): Promise<Record<string, number>> {
  const eng = await getEngine();
  return eng.host.wipe();
}

export { canonicalizeUrl };
