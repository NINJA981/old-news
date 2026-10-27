/**
 * Live blogs (SPEC F3): each timestamped post is one paragraph block. Posts are found by common
 * markup (schema.org liveBlogUpdate microdata, data attributes, article elements with a <time>).
 * The live element itself is the block, so no Readability mapping is needed.
 */
import { MIN_PARAGRAPH_CHARS, normalizeText } from '../engine/normalize';
import { OVERLAY_ATTR } from './map';

const POST_SELECTOR = [
  '[itemprop="liveBlogUpdate"]',
  '[data-post-id]',
  '[data-live-post]',
  '[data-entry-id]',
  'article.live-post',
  'li.liveblog-post',
].join(', ');

export interface LiveBlogPost {
  element: Element;
  /** Post body text (the timestamp and byline line are excluded). */
  text: string;
  /** datetime attribute of the post's <time>, when present. */
  postedAt: string | null;
  /** Stable key for de-duplication across mutations. */
  key: string;
}

function bodyText(post: Element): string {
  const paras = [...post.querySelectorAll('p')].filter(
    (p) => !p.closest('time, header, figcaption'),
  );
  if (paras.length > 0) return normalizeText(paras.map((p) => p.textContent ?? '').join(' '));
  const clone = post.cloneNode(true) as Element;
  for (const t of clone.querySelectorAll('time, header, figcaption')) t.remove();
  return normalizeText(clone.textContent ?? '');
}

/** Candidate post elements: by known markup, else <article>s with a <time> sharing a parent. */
function postElements(root: ParentNode): Element[] {
  const known = [...root.querySelectorAll(POST_SELECTOR)].filter(
    (el) => !el.parentElement?.closest(POST_SELECTOR),
  );
  if (known.length > 0) return known;
  const byParent = new Map<Element, Element[]>();
  for (const a of root.querySelectorAll('article')) {
    if (!a.querySelector('time') || !a.parentElement) continue;
    const list = byParent.get(a.parentElement) ?? [];
    list.push(a);
    byParent.set(a.parentElement, list);
  }
  let best: Element[] = [];
  for (const list of byParent.values()) if (list.length > best.length) best = list;
  return best.length >= 3 ? best : [];
}

export function findLiveBlogPosts(root: ParentNode): LiveBlogPost[] {
  const out: LiveBlogPost[] = [];
  for (const element of postElements(root)) {
    if (element.closest(`[${OVERLAY_ATTR}]`)) continue;
    const text = bodyText(element);
    if (text.length < MIN_PARAGRAPH_CHARS) continue;
    const postedAt = element.querySelector('time')?.getAttribute('datetime') ?? null;
    const id =
      element.getAttribute('data-post-id') ??
      element.getAttribute('data-entry-id') ??
      element.getAttribute('id') ??
      `${postedAt ?? ''}|${text.slice(0, 80)}`;
    out.push({ element, text, postedAt, key: id });
  }
  return out;
}

/**
 * Tracks which posts have been seen, so a MutationObserver callback can ask for only the posts
 * appended since the last scan. Ordinals keep increasing; they never collide with earlier posts.
 */
export class LiveBlogTracker {
  private readonly seen = new Map<string, number>();
  private next = 0;

  /** Posts not seen before, with fresh ordinals, in document order. */
  scan(root: ParentNode): (LiveBlogPost & { ordinal: number })[] {
    const fresh: (LiveBlogPost & { ordinal: number })[] = [];
    for (const post of findLiveBlogPosts(root)) {
      if (this.seen.has(post.key)) continue;
      const ordinal = this.next++;
      this.seen.set(post.key, ordinal);
      fresh.push({ ...post, ordinal });
    }
    return fresh;
  }

  get size(): number {
    return this.seen.size;
  }
}
