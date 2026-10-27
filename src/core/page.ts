/**
 * Page-level decisions that are pure: whether Old News may run on a page at all, and how an
 * analysis maps to the status the popup and badge show. The content script, the background and
 * the web app all use these, so the same page gets the same status everywhere.
 */
import type { AnalyseResponse } from '../host/engineHost';
import type { PageAnalysis } from '../extract';
import type { PageStatus, StoryCard } from '../messaging/protocol';
import type { PreviouslyOnCard } from '../engine/story';
import { badgeText } from '../engine/present';
import type { Settings } from './settings';
import { pauseScope } from './settings';

export type GateResult = { run: true } | { run: false; status: PageStatus };

export interface GateInput {
  settings: Pick<Settings, 'paused' | 'pausedOrigins'>;
  /** location.origin of the page. */
  origin: string;
  /** location.protocol of the page. */
  protocol: string;
  /** True in an incognito context (the extension is not allowed there; this is a second lock). */
  incognito: boolean;
}

/** Cheap checks done before any DOM work (ADR §3 flow 1). */
export function pageGate(input: GateInput): GateResult {
  if (input.incognito) return { run: false, status: { status: 'not-article' } };
  if (input.protocol !== 'https:' && input.protocol !== 'http:') {
    return { run: false, status: { status: 'not-article' } };
  }
  const scope = pauseScope(input.settings, input.origin);
  if (scope) return { run: false, status: { status: 'paused', scope } };
  return { run: true };
}

/** Status for a page analysis that did not reach the engine. Null when the engine should run. */
export function statusFromAnalysis(a: PageAnalysis): PageStatus | null {
  switch (a.status) {
    case 'not-article':
      return { status: 'not-article' };
    case 'non-english':
      return { status: 'non-english' };
    case 'unmapped':
      return { status: 'unmapped', reason: a.reason };
    case 'mapped':
      return null;
  }
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The "Previously on" card in the trimmed shape that travels in a page status. */
export function storyCardOf(card: PreviouslyOnCard | null): StoryCard | null {
  if (!card) return null;
  const site = new Map(card.articles.map((a) => [a.articleId, a.siteName]));
  return {
    label: clip(card.label, 300),
    articles: card.articles.slice(0, 12).map((a) => ({
      siteName: clip(a.siteName, 300),
      title: clip(a.title, 300),
      url: a.url.length > 4096 ? '' : a.url,
      readAt: a.readAt,
    })),
    changed: card.changedFigures.slice(0, 12).map((d) => ({
      kind: d.kind,
      before: clip(d.before, 80),
      after: clip(d.after, 80),
      context: clip(d.context, 80),
      siteName: clip(site.get(d.oldArticleId) ?? 'an earlier article', 300),
      readAt: d.detectedAt,
    })),
  };
}

export function statusFromResult(r: AnalyseResponse): PageStatus {
  const s = r.summary;
  return {
    status: 'result',
    total: s.total,
    new: s.new,
    seen: s.seen,
    similar: s.similar,
    changed: s.changed,
    degraded: r.degraded,
    storyId: r.storyId,
    story: storyCardOf(r.previouslyOn),
  };
}

/** Toolbar badge text for a status: only a result with matches has a badge. */
export function badgeFor(status: PageStatus): string {
  return status.status === 'result' ? badgeText(status) : '';
}

/** The popup sentence for a page that was left alone, or null when Old News acted on it. */
export function leftAloneMessage(status: PageStatus): string | null {
  switch (status.status) {
    case 'not-article':
      return 'This page does not look like an article, so Old News left it alone.';
    case 'non-english':
      return 'Old News reads English pages only, so it left this one alone.';
    case 'paused':
      return status.scope === 'global'
        ? 'Old News is paused everywhere.'
        : 'Old News is paused on this site.';
    case 'unmapped':
      return "Old News couldn't line up this page's paragraphs, so it left the page alone.";
    case 'error':
      return 'Old News hit a problem on this page and left it alone.';
    default:
      return null;
  }
}
