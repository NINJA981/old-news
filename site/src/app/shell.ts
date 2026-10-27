import { GLYPH } from '../shared/render.ts';

/**
 * Static first paint for /app/. The same structure and class names as the empty "Read" view in
 * App.tsx (app bar, nav rail, heading, lead), written into index.html at build time so the heading
 * paints before the 111 KB (gz) React bundle has run. React replaces it on mount. It has no handlers
 * and the nav icons are same-size blanks, so the swap does not move anything (CLS 0).
 */
const NAV = ['Read', 'Stories', 'Settings'];

export function appShell(): string {
  const nav = NAV.map(
    (label, i) =>
      `<a class="nav-item" href="#/${label.toLowerCase()}"${i === 0 ? ' aria-current="page"' : ''}>` +
      `<svg class="icon" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true"></svg><span>${label}</span></a>`,
  ).join('');
  return (
    `<div class="app">` +
    `<header class="app-bar"><a class="brand" href="/app/">${GLYPH}` +
    `<span class="brand-text"><span class="brand-name">Old News</span>` +
    `<span class="brand-sub">Runs entirely in your browser. Nothing is uploaded.</span></span></a>` +
    `<div class="bar-actions"></div></header>` +
    `<nav class="app-nav" aria-label="Sections">${nav}</nav>` +
    `<main id="content" class="app-main"><div class="view"><div class="empty-hero">` +
    `<h2 class="empty-h1">Paste two articles about the same story.</h2>` +
    `<p class="lead">Old News fades the paragraphs you’ve already read, tells you where you read them, and lights up the one number that changed. It all happens in this tab.</p>` +
    `</div></div></main></div>`
  );
}
