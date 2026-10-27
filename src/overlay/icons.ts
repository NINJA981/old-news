/** The five Lucide icons the overlay inlines (DESIGN.md Iconography) plus the product glyph. */
const svg = (body: string, size = 16, stroke = 1.5): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICON = {
  externalLink: svg(
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    12,
  ),
  x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 14),
  chevronUp: svg('<path d="m18 15-6-6-6 6"/>', 14),
  eye: svg(
    '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    14,
  ),
  alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>', 14),
} as const;

/**
 * The product glyph: three horizontal strokes, the top two at 40% ink and the bottom one at full
 * ink ("old lines faded, the new line in ink").
 */
export function glyph(size = 16): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M2 3.5h12" opacity=".4"/><path d="M2 8h12" opacity=".4"/><path d="M2 12.5h8"/></svg>`;
}
