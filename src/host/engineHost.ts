/**
 * Engine host (ADR-0001 §3): owns the in-memory index, the embedder and IndexedDB (single writer).
 * Runs in the Chrome offscreen document or the Firefox background page. Nothing is persisted at
 * match time; paragraphs are remembered only when the reader dwells on them (page/read) or
 * confirms install-time ingest (page/ingest).
 */
import type { Embedder } from '../engine/embedder';
import { capFacts } from '../engine/facts';
import type { DriftFinding } from '../engine/guard';
import { sha256Hex } from '../engine/hash';
import type {
  InputParagraph,
  MatchSummary,
  ParagraphMatch,
  PreparedParagraph,
} from '../engine/match';
import {
  embedPrepared,
  feedbackPairKey,
  matchPrepared,
  prepareParagraph,
  summarize,
} from '../engine/match';
import { entryFromRecord, MemoryIndex } from '../engine/memoryIndex';
import { snippet } from '../engine/normalize';
import { centroid as centroidOf, dequantize, quantize } from '../engine/quantize';
import type { WeeklyReceipt } from '../engine/receipt';
import { weeklyReceipt } from '../engine/receipt';
import type { PreviouslyOnCard } from '../engine/story';
import { linkStory, previouslyOn } from '../engine/story';
import { DAY_MS, STORY_WINDOW_DAYS, TTL_DAYS } from '../engine/thresholds';
import type { Tier } from '../engine/tiers';
import type {
  ArticleRecord,
  DriftRecord,
  ParagraphRecord,
  StoryRecord,
  TierCounts,
} from '../engine/types';
import { canonicalizeUrl, originOf } from '../engine/url';
import type { PageMeta } from '../messaging/protocol';
import type { Db } from '../store/db';
import * as repo from '../store/repo';
import type { SweepReport } from '../store/ttl';
import { sweepExpired } from '../store/ttl';
import { wipeAll } from '../store/wipe';

export interface Provenance {
  paragraphId: string;
  articleId: string;
  siteName: string;
  title: string;
  url: string;
  /** When the reader read the earlier paragraph. */
  readAt: number;
  snippet: string;
}

export interface ParagraphResult {
  ordinal: number;
  tier: Tier;
  fingerprint: string;
  /** 'wording' = MinHash match (seen); 'meaning' = embedding match (similar). */
  matchKind: 'wording' | 'meaning' | null;
  provenance: Provenance | null;
  drift: DriftFinding[];
}

export interface AnalyseResponse {
  articleId: string;
  paragraphs: ParagraphResult[];
  summary: MatchSummary;
  degraded: boolean;
  storyId: string | null;
  previouslyOn: PreviouslyOnCard | null;
  timingMs: number;
}

export interface ArticleSummary {
  id: string;
  siteName: string;
  title: string;
  url: string;
  kind: ArticleRecord['kind'];
  firstReadAt: number;
  lastReadAt: number;
  paragraphCount: number;
  readCount: number;
  /** Tier counts of the paragraphs read, null for articles remembered before counts existed. */
  tiers: TierCounts | null;
}

export interface StoryOverview {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  driftCount: number;
  articles: ArticleSummary[];
}

export interface DriftRow {
  id: string;
  kind: DriftRecord['kind'];
  before: string;
  after: string;
  context: string;
  storyId: string | null;
  storyLabel: string | null;
  oldSite: string;
  oldTitle: string;
  oldUrl: string;
  oldAt: number;
  newSite: string;
  newTitle: string;
  newUrl: string;
  newAt: number;
}

export interface ReadResponse {
  remembered: number;
  storyId: string | null;
  driftRecorded: number;
}

/** A failed model load or embed is retried after this long; pages run degraded meanwhile. */
export const EMBED_RETRY_MS = 60_000;

export interface EngineHostOptions {
  db: Db;
  embedder: Embedder | null;
  now?: () => number;
  /** Paragraphs of an article read at or after this time are not matched against that same article. */
  sessionStart?: number;
  /** Maximum articles kept in the in-memory session cache. */
  maxSessions?: number;
}

interface ArticleSession {
  articleId: string;
  meta: PageMeta;
  prepared: Map<number, PreparedParagraph>;
  matches: Map<number, ParagraphMatch>;
  read: Set<number>;
}

export class EngineHost {
  readonly index = new MemoryIndex();
  private readonly db: Db;
  private embedder: Embedder | null;
  private readonly now: () => number;
  private readonly sessionStart: number;
  private readonly maxSessions: number;
  private readonly sessions = new Map<string, ArticleSession>();
  private feedback = new Set<string>();
  private loaded: Promise<void> | null = null;
  /** When the model last failed; it is tried again after EMBED_RETRY_MS (degraded until then). */
  private embedderFailedAt: number | null = null;

  constructor(opts: EngineHostOptions) {
    this.db = opts.db;
    this.embedder = opts.embedder;
    this.now = opts.now ?? Date.now;
    this.sessionStart = opts.sessionStart ?? this.now();
    this.maxSessions = opts.maxSessions ?? 30;
  }

  /** Loads remembered paragraphs and feedback into memory once. */
  ready(): Promise<void> {
    this.loaded ??= (async () => {
      const now = this.now();
      const [paragraphs, feedback] = await Promise.all([
        repo.allParagraphs(this.db, now),
        repo.allFeedbackKeys(this.db, now),
      ]);
      this.index.addRecords(paragraphs);
      this.feedback = feedback;
    })();
    return this.loaded;
  }

  get modelAvailable(): boolean {
    return this.embedder !== null && !this.embedderCoolingDown();
  }

  private async embed(prepared: PreparedParagraph[]): Promise<boolean> {
    if (!this.embedder || this.embedderCoolingDown()) return false;
    const ok = await embedPrepared(prepared, this.embedder);
    this.embedderFailedAt = ok ? null : this.now();
    return ok;
  }

  private embedderCoolingDown(): boolean {
    return this.embedderFailedAt !== null && this.now() - this.embedderFailedAt < EMBED_RETRY_MS;
  }

  private remember(session: ArticleSession): void {
    this.sessions.delete(session.articleId);
    this.sessions.set(session.articleId, session);
    while (this.sessions.size > this.maxSessions) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
  }

  /**
   * Matches an article's paragraphs. With `append`, the paragraphs are added to the article's
   * existing session (live-blog posts, SPEC F3) instead of replacing it: the response lists only
   * the new paragraphs while `summary` covers everything analysed so far.
   */
  async analyse(
    page: PageMeta,
    paragraphs: readonly InputParagraph[],
    opts: { append?: boolean } = {},
  ): Promise<AnalyseResponse> {
    const started = this.now();
    await this.ready();
    const { articleId, session, prepared, matches, embedded } = await this.openSession(
      page,
      paragraphs,
      opts.append === true,
    );

    const results = await this.withProvenance(prepared, matches);
    const { storyId, card } = await this.storyFor(
      articleId,
      [...session.prepared.values()],
      [...session.matches.values()],
    );
    if (card) await this.addPageDrift(card, articleId, session);
    return {
      articleId,
      paragraphs: results,
      summary: summarize([...session.matches.values()]),
      degraded: !embedded,
      storyId,
      previouslyOn: card,
      timingMs: this.now() - started,
    };
  }

  /** Prepares, embeds and matches paragraphs, and stores the result as the article's session. */
  private async openSession(
    page: PageMeta,
    paragraphs: readonly InputParagraph[],
    append: boolean,
  ): Promise<{
    articleId: string;
    session: ArticleSession;
    prepared: PreparedParagraph[];
    matches: ParagraphMatch[];
    embedded: boolean;
  }> {
    const canonical = canonicalizeUrl(page.canonicalUrl || page.url);
    const articleId = await sha256Hex(canonical);
    const prepared = paragraphs.map(prepareParagraph);
    const embedded = await this.embed(prepared);
    const sessionStart = this.sessionStart;
    const now = this.now();
    const matches = matchPrepared(prepared, this.index, {
      // Expired paragraphs never match, even before the daily sweep has removed them.
      keep: (e) => e.expiresAt > now && !(e.articleId === articleId && e.readAt >= sessionStart),
      hasFeedback: (k) => this.feedback.has(k),
    });

    const prior = this.sessions.get(articleId);
    const merged = append && prior ? prior : undefined;
    const session: ArticleSession = {
      articleId,
      meta: { ...page, canonicalUrl: canonical },
      prepared: new Map([
        ...(merged?.prepared ?? []),
        ...prepared.map((p): [number, PreparedParagraph] => [p.ordinal, p]),
      ]),
      matches: new Map([
        ...(merged?.matches ?? []),
        ...matches.map((m): [number, ParagraphMatch] => [m.ordinal, m]),
      ]),
      read: prior?.read ?? new Set(),
    };
    this.remember(session);
    return { articleId, session, prepared, matches, embedded };
  }

  /**
   * Figures that differ on the page being read count as "changed" on the Previously-on card right
   * away, even before any paragraph is dwelled on. These are not stored (nothing is remembered
   * until it is read); stored records of the same change are not listed twice.
   */
  private async addPageDrift(
    card: PreviouslyOnCard,
    articleId: string,
    session: ArticleSession,
  ): Promise<void> {
    const key = (d: { oldParagraphId: string; kind: string; before: string; after: string }) =>
      `${d.oldParagraphId}|${d.kind}|${d.before}|${d.after}`;
    const have = new Set(card.changedFigures.map(key));
    const now = this.now();
    const found: DriftRecord[] = [];
    for (const m of session.matches.values()) {
      const p = session.prepared.get(m.ordinal);
      if (!p || m.tier !== 'changed' || !m.matchId || !m.matchArticleId) continue;
      for (const f of m.drift) {
        const rec: DriftRecord = {
          id: await sha256Hex(`page|${articleId}|${p.ordinal}|${m.matchId}|${f.kind}|${f.after}`),
          storyId: card.storyId,
          newParagraphId: '',
          oldParagraphId: m.matchId,
          kind: f.kind,
          before: f.before,
          after: f.after,
          context: driftContext(p.text, f),
          oldArticleId: m.matchArticleId,
          newArticleId: articleId,
          detectedAt: now,
          expiresAt: now,
        };
        if (have.has(key(rec))) continue;
        have.add(key(rec));
        found.push(rec);
      }
    }
    card.changedFigures = [...found, ...card.changedFigures];
  }

  private async withProvenance(
    prepared: readonly PreparedParagraph[],
    matches: readonly ParagraphMatch[],
  ): Promise<ParagraphResult[]> {
    const paraIds = [...new Set(matches.map((m) => m.matchId).filter((x): x is string => !!x))];
    const paras = new Map<string, ParagraphRecord>();
    await Promise.all(
      paraIds.map(async (id) => {
        const p = await repo.getParagraph(this.db, id);
        if (p) paras.set(id, p);
      }),
    );
    const articles = new Map(
      (
        await repo.getArticles(this.db, [...new Set([...paras.values()].map((p) => p.articleId))])
      ).map((a) => [a.id, a]),
    );
    return matches.map((m, i) => {
      const para = m.matchId ? paras.get(m.matchId) : undefined;
      const art = para ? articles.get(para.articleId) : undefined;
      return {
        ordinal: m.ordinal,
        tier: m.tier,
        fingerprint: prepared[i]?.fingerprint ?? '',
        matchKind: m.basis === 'jaccard' ? 'wording' : m.basis === 'cosine' ? 'meaning' : null,
        provenance:
          para && art
            ? {
                paragraphId: para.id,
                articleId: art.id,
                siteName: art.siteName,
                title: art.title,
                url: art.url,
                readAt: para.readAt,
                snippet: para.snippet,
              }
            : null,
        drift: m.drift,
      };
    });
  }

  private currentCentroid(prepared: Iterable<PreparedParagraph>): Int8Array | null {
    const vecs = [...prepared].filter((p) => p.vec).map((p) => dequantize(p.vec!));
    const c = centroidOf(vecs);
    return c ? quantize(c).q : null;
  }

  private sharedCounts(matches: Iterable<ParagraphMatch>): Map<string, number> {
    const shared = new Map<string, number>();
    for (const m of matches) {
      if (m.matchArticleId && m.tier !== 'new') {
        shared.set(m.matchArticleId, (shared.get(m.matchArticleId) ?? 0) + 1);
      }
    }
    return shared;
  }

  private async storyFor(
    articleId: string,
    prepared: readonly PreparedParagraph[],
    matches: readonly ParagraphMatch[],
  ): Promise<{ storyId: string | null; card: PreviouslyOnCard | null }> {
    const now = this.now();
    const existing = await repo.getArticle(this.db, articleId);
    const candidates = await repo.articlesReadSince(this.db, now - STORY_WINDOW_DAYS * DAY_MS);
    let story: StoryRecord | undefined = existing?.storyId
      ? await repo.getStory(this.db, existing.storyId)
      : undefined;
    if (!story) {
      const stories = new Map((await repo.listStories(this.db)).map((s) => [s.id, s]));
      const d = linkStory(
        {
          articleId,
          centroid: this.currentCentroid(prepared),
          sharedParagraphs: this.sharedCounts(matches),
          now,
        },
        candidates,
        stories,
      );
      if (d.storyId) story = stories.get(d.storyId);
      else if (d.linkedArticleIds.length > 0) {
        // Not yet a stored story: show the linked articles; the story is created on read.
        const first = candidates.find((a) => a.id === d.linkedArticleIds[0]);
        story = {
          id: '',
          articleIds: d.linkedArticleIds,
          label: first?.title ?? '',
          createdAt: now,
          updatedAt: now,
          expiresAt: now,
        };
      }
    }
    if (!story) return { storyId: null, card: null };
    const articles = await repo.getArticles(this.db, story.articleIds);
    const drift = story.id ? await repo.listDrift(this.db, story.id) : [];
    return { storyId: story.id || null, card: previouslyOn(articleId, story, articles, drift) };
  }

  /**
   * Remember the given ordinals of an analysed article as read. The session that `analyse` built
   * lives in memory only, and the engine host can be recycled (idle unload, or more than
   * `maxSessions` open articles) while a tab stays open. `restore` carries the page and the read
   * paragraphs' text so a lost session is rebuilt instead of the read being dropped.
   */
  async markRead(
    canonicalUrl: string,
    ordinals: readonly number[],
    restore?: { page: PageMeta; paragraphs: readonly InputParagraph[] },
  ): Promise<ReadResponse> {
    await this.ready();
    const articleId = await sha256Hex(canonicalizeUrl(canonicalUrl));
    let found = this.sessions.get(articleId);
    const missing = (s: ArticleSession) => ordinals.some((o) => !s.prepared.has(o));
    if (restore && restore.paragraphs.length > 0 && (!found || missing(found))) {
      found = (await this.openSession(restore.page, restore.paragraphs, found !== undefined))
        .session;
    }
    if (!found) return { remembered: 0, storyId: null, driftRecorded: 0 };
    const session = found;
    const now = this.now();
    const expiresAt = now + TTL_DAYS * DAY_MS;

    const fresh = ordinals.filter(
      (o) => !session.read.has(o) && session.prepared.get(o) && !session.prepared.get(o)!.skip,
    );
    if (fresh.length === 0) return { remembered: 0, storyId: null, driftRecorded: 0 };
    // Claim the ordinals before any await, so a second read of the same article (another tab, or
    // a flush racing pagehide) cannot store them twice.
    const firstReadThisSession = session.read.size === 0;
    for (const o of fresh) session.read.add(o);

    const records: ParagraphRecord[] = await Promise.all(
      fresh.map(async (o) => {
        const p = session.prepared.get(o)!;
        return {
          id: await sha256Hex(`${articleId}\n${p.text}`),
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
          readAt: now,
          expiresAt,
        };
      }),
    );

    // Article record: create or refresh; centroid over everything read so far.
    const prev = await repo.getArticle(this.db, articleId);
    const readPrepared = [...session.read]
      .map((o) => session.prepared.get(o))
      .filter((p): p is PreparedParagraph => !!p);
    const cvec = this.currentCentroid(readPrepared);
    const article: ArticleRecord = {
      id: articleId,
      url: session.meta.url,
      canonicalUrl: session.meta.canonicalUrl,
      origin: originOf(session.meta.url),
      siteName: session.meta.siteName,
      title: session.meta.title,
      kind: session.meta.kind,
      firstReadAt: prev?.firstReadAt ?? now,
      lastReadAt: now,
      paragraphCount: Math.max(session.prepared.size, prev?.paragraphCount ?? 0),
      readCount: (prev?.readCount ?? 0) + (firstReadThisSession ? 1 : 0),
      centroid: cvec ?? prev?.centroid ?? null,
      centroidScale: 0,
      storyId: prev?.storyId ?? null,
      tiers: tierCounts([...session.read].map((o) => session.matches.get(o)?.tier ?? 'new')),
      expiresAt,
    };

    const storyId = await this.linkAndStore(article, session, now, expiresAt);
    article.storyId = storyId;
    await repo.putArticle(this.db, article);
    await repo.putParagraphs(this.db, records);
    for (const r of records) this.index.add(entryFromRecord(r));

    // Drift records for changed paragraphs the reader actually read.
    const drift: DriftRecord[] = [];
    for (const r of records) {
      const m = session.matches.get(r.ordinal);
      const p = session.prepared.get(r.ordinal);
      if (!m || !p || m.tier !== 'changed' || !m.matchId || !m.matchArticleId) continue;
      for (const f of m.drift) {
        drift.push({
          id: await sha256Hex(`${r.id}|${m.matchId}|${f.kind}|${f.beforeNorm}|${f.afterNorm}`),
          storyId,
          newParagraphId: r.id,
          oldParagraphId: m.matchId,
          kind: f.kind,
          before: f.before,
          after: f.after,
          context: driftContext(p.text, f),
          oldArticleId: m.matchArticleId,
          newArticleId: articleId,
          detectedAt: now,
          expiresAt,
        });
      }
    }
    await repo.putDrift(this.db, drift);

    // Daily counters for the receipt.
    const tiers = records.map((r) => session.matches.get(r.ordinal)?.tier ?? 'new');
    const words = records.reduce((a, r) => a + r.words, 0);
    const wordsKnown = records.reduce(
      (a, r, i) => a + (tiers[i] === 'seen' || tiers[i] === 'similar' ? r.words : 0),
      0,
    );
    await repo.addDaily(
      this.db,
      {
        words,
        wordsKnown,
        articles: prev ? 0 : 1,
        pNew: tiers.filter((t) => t === 'new').length,
        pSeen: tiers.filter((t) => t === 'seen').length,
        pSimilar: tiers.filter((t) => t === 'similar').length,
        pChanged: tiers.filter((t) => t === 'changed').length,
      },
      now,
    );
    return { remembered: records.length, storyId, driftRecorded: drift.length };
  }

  /** Install-time ingest: analyse, then remember every mapped paragraph as read. */
  async ingest(page: PageMeta, paragraphs: readonly InputParagraph[]): Promise<ReadResponse> {
    await this.analyse(page, paragraphs);
    return this.markRead(
      page.canonicalUrl || page.url,
      paragraphs.map((p) => p.ordinal),
    );
  }

  private async linkAndStore(
    article: ArticleRecord,
    session: ArticleSession,
    now: number,
    expiresAt: number,
  ): Promise<string | null> {
    const candidates = await repo.articlesReadSince(this.db, now - STORY_WINDOW_DAYS * DAY_MS);
    const storiesList = await repo.listStories(this.db);
    const stories = new Map(storiesList.map((s) => [s.id, s]));
    const d = linkStory(
      {
        articleId: article.id,
        centroid: article.centroid,
        sharedParagraphs: this.sharedCounts(session.matches.values()),
        now,
      },
      candidates,
      stories,
    );
    let storyId = article.storyId ?? d.storyId;
    if (!storyId && d.linkedArticleIds.length === 0) return null;

    let story: StoryRecord | undefined = storyId ? stories.get(storyId) : undefined;
    if (!story) {
      storyId = await sha256Hex(`story\n${article.id}\n${now}`);
      const first = candidates
        .filter((a) => d.linkedArticleIds.includes(a.id))
        .sort((a, b) => a.firstReadAt - b.firstReadAt)[0];
      story = {
        id: storyId,
        articleIds: [],
        label: first?.title ?? article.title,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      };
    }
    const members = new Set([...story.articleIds, ...d.linkedArticleIds, article.id]);
    for (const mergeId of d.mergeStoryIds) {
      if (mergeId === story.id) continue;
      const other = stories.get(mergeId);
      if (!other) continue;
      for (const a of other.articleIds) members.add(a);
      await repo.deleteStory(this.db, mergeId);
    }
    const updated: StoryRecord = { ...story, articleIds: [...members], updatedAt: now, expiresAt };
    await repo.putStory(this.db, updated);
    // Point linked articles at the story.
    const linked = await repo.getArticles(
      this.db,
      [...members].filter((id) => id !== article.id),
    );
    for (const a of linked) {
      if (a.storyId !== updated.id) await repo.putArticle(this.db, { ...a, storyId: updated.id });
    }
    return updated.id;
  }

  /** "Not old news": suppress this pair from now on. */
  async addFeedback(fingerprint: string, oldParagraphId: string): Promise<void> {
    const key = feedbackPairKey(fingerprint, oldParagraphId);
    const now = this.now();
    this.feedback.add(key);
    await repo.putFeedback(this.db, {
      pairKey: key,
      verdict: 'not-old',
      createdAt: now,
      expiresAt: now + TTL_DAYS * DAY_MS,
    });
  }

  async stats(): Promise<
    repo.MemoryStats & {
      modelAvailable: boolean;
      embedderId: string | null;
      /** Backend decision recorded by the extension host (meta.modelInfo), when there is one. */
      modelInfo: unknown;
    }
  > {
    const s = await repo.memoryStats(this.db);
    return {
      ...s,
      modelAvailable: this.modelAvailable,
      embedderId: this.embedder?.id ?? null,
      modelInfo: (await repo.getMeta<unknown>(this.db, 'modelInfo')) ?? null,
    };
  }

  async wipe(): Promise<Record<string, number>> {
    const before = await wipeAll(this.db);
    this.index.clear();
    this.feedback.clear();
    this.sessions.clear();
    return before;
  }

  async sweep(): Promise<SweepReport> {
    const now = this.now();
    const report = await sweepExpired(this.db, now);
    this.index.removeExpired(now);
    this.feedback = await repo.allFeedbackKeys(this.db, now);
    return report;
  }

  listDrift(storyId?: string): Promise<DriftRecord[]> {
    return repo.listDrift(this.db, storyId);
  }

  listStories(): Promise<StoryRecord[]> {
    return repo.listStories(this.db);
  }

  /** Stories with their articles and drift counts, newest first (app page, SPEC F15). */
  async storiesOverview(): Promise<StoryOverview[]> {
    const stories = (await repo.listStories(this.db)).sort((a, b) => b.updatedAt - a.updatedAt);
    const drift = await repo.listDrift(this.db);
    const out: StoryOverview[] = [];
    for (const s of stories) {
      const articles = await repo.getArticles(this.db, s.articleIds);
      out.push({
        id: s.id,
        label: s.label,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        driftCount: drift.filter((d) => d.storyId === s.id).length,
        articles: articles
          .sort((a, b) => b.lastReadAt - a.lastReadAt)
          .map((a) => ({
            id: a.id,
            siteName: a.siteName,
            title: a.title,
            url: a.url,
            kind: a.kind,
            firstReadAt: a.firstReadAt,
            lastReadAt: a.lastReadAt,
            paragraphCount: a.paragraphCount,
            readCount: a.readCount,
            tiers: a.tiers ?? null,
          })),
      });
    }
    return out;
  }

  /** Drift records joined with the two sources, newest first (SPEC F15). */
  async driftOverview(storyId?: string): Promise<DriftRow[]> {
    const records = await repo.listDrift(this.db, storyId);
    const articleIds = [...new Set(records.flatMap((d) => [d.oldArticleId, d.newArticleId]))];
    const articles = new Map((await repo.getArticles(this.db, articleIds)).map((a) => [a.id, a]));
    const stories = new Map((await repo.listStories(this.db)).map((s) => [s.id, s.label]));
    const rows: DriftRow[] = [];
    for (const d of records) {
      const oldPara = await repo.getParagraph(this.db, d.oldParagraphId);
      const oldA = articles.get(d.oldArticleId);
      const newA = articles.get(d.newArticleId);
      rows.push({
        id: d.id,
        kind: d.kind,
        before: d.before,
        after: d.after,
        context: d.context,
        storyId: d.storyId,
        storyLabel: (d.storyId ? stories.get(d.storyId) : undefined) ?? null,
        oldSite: oldA?.siteName ?? 'an earlier article',
        oldTitle: oldA?.title ?? '',
        oldUrl: oldA?.url ?? '',
        oldAt: oldPara?.readAt ?? oldA?.lastReadAt ?? d.detectedAt,
        newSite: newA?.siteName ?? 'this article',
        newTitle: newA?.title ?? '',
        newUrl: newA?.url ?? '',
        newAt: d.detectedAt,
      });
    }
    return rows;
  }

  async receipt(): Promise<WeeklyReceipt | null> {
    return weeklyReceipt(await repo.listDaily(this.db), this.now());
  }

  /** Releases the model (idle unload); matching continues degraded until a new embedder is set. */
  setEmbedder(embedder: Embedder | null): void {
    this.embedder = embedder;
    this.embedderFailedAt = null;
  }
}

function tierCounts(tiers: readonly Tier[]): TierCounts {
  const out: TierCounts = { new: 0, seen: 0, similar: 0, changed: 0 };
  for (const t of tiers) out[t]++;
  return out;
}

/** At most 60 characters of context around the changed token (SPEC §7 drift.context). */
export function driftContext(text: string, f: DriftFinding, limit = 60): string {
  if (f.offset < 0) return snippet(text, limit);
  const max = limit - 2; // room for the ellipses
  const half = Math.floor((max - f.length) / 2);
  let start = Math.max(0, f.offset - half);
  let end = Math.min(text.length, start + max);
  start = Math.max(0, end - max);
  // Trim to word boundaries.
  if (start > 0) {
    const sp = text.indexOf(' ', start);
    if (sp !== -1 && sp < f.offset) start = sp + 1;
  }
  if (end < text.length) {
    const sp = text.lastIndexOf(' ', end);
    if (sp > f.offset + f.length) end = sp;
  }
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
