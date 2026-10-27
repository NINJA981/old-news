// @vitest-environment jsdom
/**
 * The gates in front of the mapper (SPEC AC1.1, AC1.2, AC2.2): which status a page gets decides
 * which popup message the reader sees, so the order of the gates is part of the contract.
 */
import { describe, expect, it } from 'vitest';
import { analyseDocument } from '../../../src/extract';

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');
const head = (lang: string): string =>
  `<!doctype html><html lang="${lang}"><head><title>Story</title>` +
  `<meta property="og:type" content="article"></head>`;

const EN = (n: number): string =>
  `Paragraph ${n} says that the council will meet on Tuesday, and that the report which was ` +
  `published after the fire has been read by more than two of the people who were there.`;

describe('analyseDocument gate order', () => {
  it('an English article with enough text is mapped', () => {
    const doc = parse(
      `${head('en')}<body><article><h1>Story</h1>${[1, 2, 3, 4].map((n) => `<p>${EN(n)}</p>`).join('')}</article></body></html>`,
    );
    expect(analyseDocument(doc, 'https://x.example/a').status).toBe('mapped');
  });

  it('a page tagged lang="fr" is non-english, whatever its text', () => {
    const doc = parse(
      `${head('fr')}<body><article>${[1, 2, 3].map((n) => `<p>${EN(n)}</p>`).join('')}</article></body></html>`,
    );
    expect(analyseDocument(doc, 'https://x.example/a').status).toBe('non-english');
  });

  it('English-tagged French text is non-english', () => {
    const fr =
      'Le conseil municipal se réunira mardi pour discuter du rapport publié après l’incendie, ' +
      'et les habitants des quartiers voisins ont été invités à venir poser des questions aux élus.';
    const doc = parse(
      `${head('en')}<body><article>${[1, 2, 3].map(() => `<p>${fr}</p>`).join('')}</article></body></html>`,
    );
    expect(analyseDocument(doc, 'https://x.example/a').status).toBe('non-english');
  });

  it('an English page with almost no text (canvas story) is "unmapped", not "non-english"', () => {
    const doc = parse(
      `${head('en')}<body><article><h1>Story</h1><canvas width="10" height="10"></canvas>` +
        `<p>Use a modern browser to read this story.</p></article></body></html>`,
    );
    expect(analyseDocument(doc, 'https://x.example/a')).toMatchObject({
      status: 'unmapped',
      reason: 'too-little-text',
      total: 0,
    });
  });

  it('a page with no article signal is not-article before any language check', () => {
    const doc = parse(`<!doctype html><html lang="fr"><body><p>Bonjour</p></body></html>`);
    expect(analyseDocument(doc, 'https://x.example/a').status).toBe('not-article');
  });
});
