/**
 * Markup for the product's marks, as strings. One renderer feeds the landing page (rendered at
 * build time into static HTML), the landing demo and the web app, so all three draw the same DOM.
 * Every dynamic value is escaped here; reader-supplied text never reaches innerHTML unescaped.
 */
import type { ArticleView, ViewDrift, ViewParagraph } from './view.ts';
import { plain } from './text.ts';

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] as string);
}

/** The product glyph: three strokes, the top two at 40% ink, the bottom one at full ink. */
export const GLYPH =
  '<svg class="on-glyph" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
  '<path d="M2 3.5h12" opacity=".4"/><path d="M2 8h12" opacity=".4"/><path d="M2 12.5h12"/></svg>';

export interface RenderOptions {
  /** Solved opacity floor per faded tier. Omit to let the client solve it from computed colours. */
  alpha?: { seen: number; similar: number };
  /** Tags go in the right gutter at wide widths (the landing sheets); inline otherwise. */
  gutter?: boolean;
  /** Hide the reader's own tags for the "all new" case. */
  tags?: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function paragraphHtml(p: ViewParagraph): string {
  const drift = p.drift.filter((d) => d.offset >= 0 && d.length > 0);
  let out = '';
  let cursor = 0;
  const placed: ViewDrift[] = [];
  for (const d of drift) {
    if (d.offset < cursor) continue; // overlapping findings: the first one wins
    out += esc(p.text.slice(cursor, d.offset));
    out +=
      '<mark class="on-mark" data-state="rest">' +
      esc(p.text.slice(d.offset, d.offset + d.length)) +
      '<i class="on-rect" aria-hidden="true"></i></mark>';
    cursor = d.offset + d.length;
    placed.push(d);
  }
  out += esc(p.text.slice(cursor));
  return out;
}

function chipHtml(d: ViewDrift): string {
  const plainChip = plain(d.chip);
  const dot = plainChip.indexOf(' · ');
  const head = dot === -1 ? plainChip : plainChip.slice(0, dot);
  const tail = dot === -1 ? '' : plainChip.slice(dot);
  return (
    `<button type="button" class="on-chip" aria-label="${esc(`Changed: ${plainChip}`)}">` +
    `<b>${esc(head)}</b>${esc(tail)}</button>`
  );
}

export function rowHtml(p: ViewParagraph, opts: RenderOptions = {}): string {
  const faded = !p.skipped && (p.tier === 'seen' || p.tier === 'similar');
  const a = faded && opts.alpha ? opts.alpha[p.tier as 'seen' | 'similar'] : null;
  const prov = p.provenance;
  const attrs = [
    'class="on-row"',
    `data-ord="${p.ordinal}"`,
    `data-tier="${p.skipped ? 'skipped' : p.tier}"`,
    `data-fp="${esc(p.fingerprint)}"`,
  ];
  if (p.drift.length > 0) attrs.push(`data-drift="${Math.min(p.drift.length, 3)}"`);
  if (prov && (faded || p.tier === 'changed')) {
    attrs.push(
      `data-outlet="${esc(prov.siteName)}"`,
      `data-when="${esc(plain(prov.when))}"`,
      `data-title="${esc(prov.title)}"`,
      `data-snippet="${esc(prov.snippet)}"`,
      `data-match="${esc(prov.matchLine)}"`,
      `data-url="${esc(prov.url)}"`,
      `data-old="${esc(prov.paragraphId)}"`,
    );
  }
  const pAttrs = ['class="on-p"'];
  if (faded) {
    pAttrs.push(`data-a="${a ?? ''}"`);
    if (a !== null) pAttrs.push(`style="--a:${a}"`);
  }
  const chips =
    p.drift.length > 0
      ? `<div class="on-chips">${p.drift.slice(0, 2).map(chipHtml).join('')}${
          p.drift.length > 2
            ? `<span class="on-chip" role="note">+${p.drift.length - 2}</span>`
            : ''
        }</div>`
      : '';
  const tag =
    faded && p.tag && opts.tags !== false
      ? `<button type="button" class="on-tag" aria-haspopup="dialog" aria-expanded="false">${esc(plain(p.tag))}</button>`
      : '';
  return `<div ${attrs.join(' ')}>${chips}<p ${pAttrs.join(' ')}>${paragraphHtml(p)}</p>${tag}</div>`;
}

export function rowsHtml(view: ArticleView, opts: RenderOptions = {}): string {
  return view.paragraphs.map((p) => rowHtml(p, opts)).join('');
}

/** The status pill. Structured (so the dissolve can count down) when the copy is "Only n of m …". */
export function pillHtml(view: ArticleView, attrs = ''): string {
  if (!view.pill) return '';
  const text = plain(view.pill);
  const total = view.summary.total;
  const m = /^Only (\d+) of (\d+) (.+)$/.exec(text);
  const body = m
    ? `<span data-pill-only>Only </span><b data-pill-n>${m[1]}</b> of <b>${m[2]}</b> ${esc(m[3] ?? '')}`
    : esc(text).replace(/(\d+)/, '<b data-pill-n>$1</b>');
  return (
    `<div class="on-pill" data-pill data-total="${total}" data-lit="${view.lit}" role="status" ${attrs}>` +
    `${GLYPH}<span>${body}</span></div>`
  );
}

/** The tier bar and its legend (the bar is never the only carrier of meaning). */
export function tierBarHtml(s: {
  new: number;
  changed: number;
  similar: number;
  seen: number;
  total: number;
}): string {
  const w = (n: number): string => `${s.total === 0 ? 0 : (n / s.total) * 100}%`;
  const seg = (cls: string, n: number): string =>
    n > 0 ? `<i class="${cls}" style="width:${w(n)}"></i>` : '';
  return (
    `<div class="tier-bar" aria-hidden="true">${seg('t-new', s.new)}${seg('t-changed', s.changed)}${seg('t-similar', s.similar)}${seg('t-seen', s.seen)}</div>` +
    `<dl class="tier-legend">` +
    `<div><dt>New</dt><dd>${s.new}</dd></div><div><dt>Changed</dt><dd>${s.changed}</dd></div>` +
    `<div><dt>Similar</dt><dd>${s.similar}</dd></div><div><dt>Seen</dt><dd>${s.seen}</dd></div></dl>`
  );
}

export { hostOf };
