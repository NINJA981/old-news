/** Tiny DOM helpers for the vanilla overlay (no framework in the content script, ADR-0001 §4.1). */

type Attrs = Record<string, string | undefined>;

/** Creates an element with attributes and children; strings become text nodes. */
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, v);
  for (const c of children) {
    if (c === null || c === undefined) continue;
    el.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  }
  return el;
}

/** Parses trusted static SVG markup (our own icons) into an element. */
export function svgOf(doc: Document, markup: string): Element {
  const t = doc.createElement('template');
  t.innerHTML = markup;
  return t.content.firstElementChild as Element;
}

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) {
    return true;
  }
  return (target as HTMLElement).isContentEditable === true;
}

/** Splits "Only 4 of 23 paragraphs ..." into text and number nodes so numbers can be bold. */
export function withNumbers(doc: Document, text: string): Node[] {
  return text.split(/(\d+)/).map((part, i) => {
    if (i % 2 === 1) return h(doc, 'b', {}, part);
    return doc.createTextNode(part);
  });
}

export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
export const EASE_OUT_SOFT = 'cubic-bezier(0.25, 1, 0.5, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
