import { describe, expect, it } from 'vitest';
import {
  fitPage,
  fitParagraphs,
  isTrustedEngineSender,
  parseMessage,
} from '../../../src/messaging/protocol';

const ID = 'abcdefghijklmnop';
const ORIGIN = `chrome-extension://${ID}/`;

describe('engine envelopes are only accepted from the background', () => {
  it('accepts the background service worker', () => {
    expect(isTrustedEngineSender({ id: ID, url: `${ORIGIN}background.js` }, ID, ORIGIN)).toBe(true);
  });

  it('rejects a content script (it has a tab and a web URL)', () => {
    expect(
      isTrustedEngineSender(
        { id: ID, url: 'https://news.example/story', tab: { id: 4 } },
        ID,
        ORIGIN,
      ),
    ).toBe(false);
  });

  it('rejects an extension page open in a tab, another extension and a missing URL', () => {
    expect(
      isTrustedEngineSender({ id: ID, url: `${ORIGIN}app.html`, tab: { id: 2 } }, ID, ORIGIN),
    ).toBe(false);
    expect(
      isTrustedEngineSender({ id: 'other', url: 'chrome-extension://other/bg.js' }, ID, ORIGIN),
    ).toBe(false);
    expect(isTrustedEngineSender({ id: ID }, ID, ORIGIN)).toBe(false);
  });
});

describe('pages are trimmed to the message limits instead of being rejected', () => {
  const page = {
    url: 'https://news.example/a',
    canonicalUrl: 'https://news.example/a',
    siteName: 'S'.repeat(1000),
    title: 'T'.repeat(5000),
    kind: 'liveblog' as const,
  };

  it('a live blog with 700 posts, one of them 25 KB, still parses', () => {
    const paragraphs = Array.from({ length: 700 }, (_, ordinal) => ({
      ordinal,
      text: ordinal === 3 ? 'x'.repeat(25_000) : `Post ${ordinal}.`,
    }));
    const raw = {
      type: 'page/analyse',
      page: fitPage(page),
      paragraphs: fitParagraphs(paragraphs),
    };
    const msg = parseMessage(raw);
    expect(msg).not.toBeNull();
    if (msg?.type !== 'page/analyse') throw new Error('wrong type');
    expect(msg.paragraphs).toHaveLength(600);
    expect(msg.paragraphs[3]?.text).toHaveLength(20_000);
    expect(msg.page.siteName).toHaveLength(300);
    expect(msg.page.title).toHaveLength(1000);
  });

  it('without trimming the same page is rejected whole (why fitting matters)', () => {
    expect(parseMessage({ type: 'page/analyse', page, paragraphs: [] })).toBeNull();
  });

  it('page/read carries the page and text for rebuilding a lost session', () => {
    const msg = parseMessage({
      type: 'page/read',
      canonicalUrl: page.canonicalUrl,
      ordinals: [0],
      page: fitPage(page),
      paragraphs: fitParagraphs([{ ordinal: 0, text: 'A paragraph.' }]),
    });
    expect(msg).toMatchObject({ type: 'page/read', paragraphs: [{ ordinal: 0 }] });
  });
});
