/**
 * View model for one analysed article: everything the landing page, the web app and the build
 * scripts need to draw the product's result, derived only from the real engine's response
 * (tiers, provenance, drift findings) and the engine's own copy functions. No matching logic here.
 */
import type {
  AnalyseResponse,
  InputParagraph,
  MatchSummary,
  PageMeta,
  PreviouslyOnCard,
  Tier,
} from '@engine';
import { plain } from './text';
import {
  driftChipText,
  formatCount,
  isSkippable,
  normalizeText,
  pillText,
  provenanceLabel,
  readWhen,
  relativeTime,
} from '@engine';

export interface ViewDrift {
  kind: string;
  before: string;
  after: string;
  /** Offset and length of the changed token inside `text`; -1 when the token is not in the text. */
  offset: number;
  length: number;
  /** "12 → 14 · Fenwick Wire said 12, yesterday". */
  chip: string;
}

export interface ViewProvenance {
  paragraphId: string;
  siteName: string;
  title: string;
  /** Stored URL of the earlier article; empty when the reader pasted text without one. */
  url: string;
  when: string;
  snippet: string;
  matchLine: string;
}

export interface ViewParagraph {
  ordinal: number;
  text: string;
  tier: Tier;
  /** True when the engine skipped it (too short or boilerplate); it is never faded or tagged. */
  skipped: boolean;
  fingerprint: string;
  /** "Fenwick Wire · yesterday" or "Similar to Calder Courier · yesterday". */
  tag: string | null;
  provenance: ViewProvenance | null;
  drift: ViewDrift[];
}

export interface ViewCard {
  label: string;
  /** "Previously on this story: 3 articles, 2 figures changed". */
  summary: string;
  articles: { siteName: string; title: string; url: string; when: string }[];
  figures: { context: string; before: string; after: string; when: string; source: string }[];
}

export interface ArticleView {
  title: string;
  siteName: string;
  paragraphs: ViewParagraph[];
  summary: MatchSummary;
  /** Paragraphs that stay lit: new plus changed. */
  lit: number;
  pill: string | null;
  degraded: boolean;
  card: ViewCard | null;
}

export const MATCH_LINE = {
  wording: 'Same wording as a paragraph you read',
  meaning: 'Similar meaning, different wording',
} as const;

/** Display text: the reader's own characters when normalisation keeps offsets, else normalised. */
function displayText(original: string): string {
  const norm = normalizeText(original);
  return norm.length === original.length ? original : norm;
}

export function buildView(
  meta: Pick<PageMeta, 'title' | 'siteName'>,
  inputs: readonly InputParagraph[],
  resp: AnalyseResponse,
  now: number,
): ArticleView {
  const byOrdinal = new Map(resp.paragraphs.map((p) => [p.ordinal, p]));
  const paragraphs: ViewParagraph[] = inputs.map((input) => {
    const r = byOrdinal.get(input.ordinal);
    const skipped = isSkippable(input.text);
    const text = displayText(input.text);
    if (!r || skipped) {
      return {
        ordinal: input.ordinal,
        text,
        tier: 'new',
        skipped: true,
        fingerprint: r?.fingerprint ?? '',
        tag: null,
        provenance: null,
        drift: [],
      };
    }
    const prov = r.provenance;
    const drift: ViewDrift[] = r.drift.map((d) => ({
      kind: d.kind,
      before: d.before,
      after: d.after,
      offset: d.offset,
      length: d.length,
      chip: prov ? driftChipText(d, prov.siteName, prov.readAt, now) : `${d.before} → ${d.after}`,
    }));
    const placed = drift.filter((d) => d.offset >= 0).sort((a, b) => a.offset - b.offset);
    const unplaced = drift.filter((d) => d.offset < 0);
    return {
      ordinal: input.ordinal,
      text,
      tier: r.tier,
      skipped: false,
      fingerprint: r.fingerprint,
      tag: prov ? provenanceLabel(r.tier, prov.siteName, prov.readAt, now) : null,
      provenance: prov
        ? {
            paragraphId: prov.paragraphId,
            siteName: prov.siteName,
            title: prov.title,
            url: prov.url,
            when: readWhen(prov.readAt, now),
            snippet: prov.snippet,
            matchLine: r.matchKind === 'meaning' ? MATCH_LINE.meaning : MATCH_LINE.wording,
          }
        : null,
      drift: [...placed, ...unplaced],
    };
  });
  const s = resp.summary;
  return {
    title: meta.title,
    siteName: meta.siteName,
    paragraphs,
    summary: s,
    lit: s.new + s.changed,
    pill: pillText(s),
    degraded: resp.degraded,
    card: buildCard(resp.previouslyOn, now),
  };
}

/** The "Previously on this story" card. Null when there is nothing earlier to show. */
export function buildCard(card: PreviouslyOnCard | null, now: number): ViewCard | null {
  if (!card) return null;
  const articles = card.articles.map((a) => ({
    siteName: a.siteName,
    title: a.title,
    url: a.url,
    when: relativeTime(a.readAt, now),
  }));
  const names = new Map(card.articles.map((a) => [a.articleId, a.siteName]));
  const figures = card.changedFigures.map((d) => ({
    context: d.context,
    before: d.before || 'not mentioned',
    after: d.after || 'not mentioned',
    when: relativeTime(d.detectedAt, now),
    source: names.get(d.oldArticleId) ?? '',
  }));
  const a = articles.length;
  const f = figures.length;
  const summary =
    `Previously on this story: ${formatCount(a)} ${a === 1 ? 'article' : 'articles'}` +
    (f > 0 ? `, ${formatCount(f)} ${f === 1 ? 'figure' : 'figures'} changed` : '');
  return { label: card.label, summary, articles, figures };
}

export { plain } from './text';
