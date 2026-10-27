/**
 * Drift chips, horizontally anchored to their token.
 *
 * In the reproduction the chips sit in normal flow directly above the paragraph (product.css), so
 * the row reserves their height and a chip can never cover text at any width (DESIGN.md: "A chip
 * never covers text"). The extension anchors a chip above its token (`placeChips`, mode "above",
 * x = token.left clamped into the row). This does the same horizontal half: when the chips fit on
 * one line, they slide (the `translate` property on each chip, which composes with the rise
 * animation's `transform`; no layout shift) to start at the first changed token's x,
 * clamped so they stay inside the row. When they wrap (phones), they stay at the left edge.
 */
import { clampX } from '@overlay/geometry';

const GAP = 6;

export function alignChips(root: HTMLElement): void {
  // A band skipped by content-visibility has no layout; reading it would force one. Wait for it.
  if (root.checkVisibility && !root.checkVisibility({ contentVisibilityAuto: true })) return;
  // Read every row first, then write: `translate` does not change offsetLeft or offsetTop, so the
  // reads never see our own writes and the pass costs one layout, not one per row.
  const writes: [HTMLElement[], string][] = [];
  for (const row of root.querySelectorAll<HTMLElement>('.on-row[data-drift]')) {
    const chips = row.querySelector<HTMLElement>('.on-chips');
    const mark = row.querySelector<HTMLElement>('.on-mark');
    if (!chips || !mark) continue;
    const kids = [...chips.children] as HTMLElement[];
    const first = kids[0];
    let value = '';
    // Not laid out, or wrapped onto two lines (phones): the chips stay at the left edge.
    if (first && chips.clientWidth > 0 && kids.every((k) => k.offsetWidth > 0)) {
      if (kids.every((k) => k.offsetTop === first.offsetTop)) {
        const used = kids.reduce((a, k) => a + k.offsetWidth, 0) + GAP * (kids.length - 1);
        // offsetLeft is layout space (the hero sheets are 3D-transformed, client rects are not).
        const x = clampX(mark.offsetLeft - chips.offsetLeft, used, 0, chips.clientWidth);
        if (x >= 0.5) value = `${Math.floor(x)}px 0`;
      }
    }
    writes.push([kids, value]);
  }
  for (const [kids, value] of writes) {
    for (const k of kids) if (k.style.translate !== value) k.style.translate = value;
  }
}

/** Aligns after layout, after the fonts settle, and whenever the root changes size. Returns a disposer. */
export function watchChips(root: HTMLElement): () => void {
  // ResizeObserver callbacks run after layout, so reading there forces nothing. It fires once on
  // observe (the first pass) and again whenever the root's size changes.
  const ro = new ResizeObserver(() => alignChips(root));
  ro.observe(root);
  // Web fonts can move the token without resizing the root; re-observe to get one more pass.
  void document.fonts?.ready.then(() => {
    ro.unobserve(root);
    ro.observe(root);
  });
  // A band skipped by content-visibility: auto is laid out only when it nears the viewport.
  const onShow = (e: Event): void => {
    if ((e.target as Node).contains(root)) {
      ro.unobserve(root);
      ro.observe(root);
    }
  };
  document.addEventListener('contentvisibilityautostatechange', onShow, true);
  return () => {
    ro.disconnect();
    document.removeEventListener('contentvisibilityautostatechange', onShow, true);
  };
}
