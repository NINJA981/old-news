/**
 * Finds the changed token inside a live paragraph element so it can be highlighted. The guard
 * reports tokens against normalised text, so the DOM is searched by value near the expected
 * position; when the token cannot be found the paragraph stays lit and gets a chip without a
 * highlight (ambiguity never hides anything).
 */

interface Flat {
  text: string;
  /** Per character of `text`: the text node and offset it came from. */
  at: { node: Text; offset: number }[];
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

function fold(ch: string): string {
  if (/[\s\u00a0]/.test(ch)) return ' ';
  if ('‘’‚‛′`´'.includes(ch)) return "'";
  if ('“”„‟″«»'.includes(ch)) return '"';
  if ('‐‑‒–—―−'.includes(ch)) return '-';
  return ch.toLowerCase();
}

/** The element's text with whitespace collapsed and quotes unified, plus a map back to text nodes. */
export function flatten(el: Element): Flat {
  const at: Flat['at'] = [];
  let text = '';
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      const t = node as Text;
      const data = t.data;
      for (let i = 0; i < data.length; i++) {
        const c = fold(data[i] as string);
        if (c === ' ' && (text.endsWith(' ') || text === '')) continue;
        text += c;
        at.push({ node: t, offset: i });
      }
    } else if (node.nodeType === 1 && !SKIP.has((node as Element).tagName)) {
      for (const child of node.childNodes) walk(child);
    }
  };
  walk(el);
  return { text, at };
}

const isWord = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * The Range covering `needle` in `el`. With several matches the one closest to `hint` (a 0..1
 * fraction of the way through the text) wins. Null when absent.
 */
export function findToken(el: Element, needle: string, hint = 0): Range | null {
  const want = [...needle.trim()].map(fold).join('');
  if (want.length === 0) return null;
  const { text, at } = flatten(el);
  let best = -1;
  let bestDist = Infinity;
  const target = hint * text.length;
  for (let from = text.indexOf(want); from !== -1; from = text.indexOf(want, from + 1)) {
    const before = text[from - 1];
    const after = text[from + want.length];
    if (isWord(want[0]) && isWord(before)) continue;
    if (isWord(want[want.length - 1]) && isWord(after)) continue;
    const dist = Math.abs(from - target);
    if (dist < bestDist) {
      best = from;
      bestDist = dist;
    }
  }
  if (best < 0) return null;
  const first = at[best];
  const last = at[best + want.length - 1];
  if (!first || !last) return null;
  const range = el.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}
