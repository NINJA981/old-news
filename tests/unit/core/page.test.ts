import { describe, expect, it } from 'vitest';
import {
  badgeFor,
  leftAloneMessage,
  pageGate,
  statusFromAnalysis,
  statusFromResult,
} from '../../../src/core/page';
import { parseMessage } from '../../../src/messaging/protocol';
import type { PageStatus } from '../../../src/messaging/protocol';

const open = { paused: false, pausedOrigins: [] as string[] };
const base = { settings: open, origin: 'https://a.example', protocol: 'https:', incognito: false };

describe('pageGate', () => {
  it('runs on ordinary http(s) pages', () => {
    expect(pageGate(base)).toEqual({ run: true });
    expect(pageGate({ ...base, protocol: 'http:' })).toEqual({ run: true });
  });

  it('never runs in incognito or on non-web schemes', () => {
    expect(pageGate({ ...base, incognito: true }).run).toBe(false);
    for (const protocol of ['chrome:', 'chrome-extension:', 'file:', 'about:', 'moz-extension:']) {
      expect(pageGate({ ...base, protocol }).run, protocol).toBe(false);
    }
  });

  it('reports the pause scope (AC17.3)', () => {
    expect(pageGate({ ...base, settings: { paused: true, pausedOrigins: [] } })).toEqual({
      run: false,
      status: { status: 'paused', scope: 'global' },
    });
    expect(
      pageGate({ ...base, settings: { paused: false, pausedOrigins: ['https://a.example'] } }),
    ).toEqual({ run: false, status: { status: 'paused', scope: 'site' } });
    expect(
      pageGate({ ...base, settings: { paused: false, pausedOrigins: ['https://b.example'] } }).run,
    ).toBe(true);
  });
});

describe('statusFromAnalysis', () => {
  const page = { url: 'u', canonicalUrl: 'u', siteName: 's', title: 't' };
  it('maps each non-engine outcome and lets mapped pages through', () => {
    expect(statusFromAnalysis({ status: 'not-article', reason: 'no-signal' })).toEqual({
      status: 'not-article',
    });
    expect(statusFromAnalysis({ status: 'non-english' })).toEqual({ status: 'non-english' });
    expect(
      statusFromAnalysis({
        status: 'unmapped',
        reason: 'low-mapping',
        total: 5,
        mapped: 2,
        page,
        kind: 'news',
      }),
    ).toEqual({ status: 'unmapped', reason: 'low-mapping' });
    expect(
      statusFromAnalysis({ status: 'mapped', page, kind: 'news', blocks: [], total: 0 }),
    ).toBeNull();
  });

  it('every status it can produce passes the protocol schema', () => {
    const statuses: PageStatus[] = [
      { status: 'not-article' },
      { status: 'non-english' },
      { status: 'unmapped', reason: 'double-mapped' },
    ];
    for (const status of statuses) {
      expect(
        parseMessage({ type: 'page/status', url: 'https://a.example/x', status }),
      ).not.toBeNull();
    }
  });
});

describe('statusFromResult and badge', () => {
  const result = (summary: {
    total: number;
    new: number;
    seen: number;
    similar: number;
    changed: number;
  }) =>
    statusFromResult({
      articleId: 'a',
      paragraphs: [],
      summary,
      degraded: false,
      storyId: null,
      previouslyOn: null,
      timingMs: 1,
    });

  it('carries the counts and engine state', () => {
    expect(result({ total: 23, new: 3, seen: 18, similar: 1, changed: 1 })).toEqual({
      status: 'result',
      total: 23,
      new: 3,
      seen: 18,
      similar: 1,
      changed: 1,
      degraded: false,
      storyId: null,
      story: null,
    });
  });

  it('badge is the lit count, empty without matches, empty for non-results (AC11.1)', () => {
    expect(badgeFor(result({ total: 23, new: 3, seen: 18, similar: 1, changed: 1 }))).toBe('4');
    expect(badgeFor(result({ total: 10, new: 10, seen: 0, similar: 0, changed: 0 }))).toBe('');
    expect(badgeFor({ status: 'not-article' })).toBe('');
    expect(badgeFor({ status: 'analysing', total: 5 })).toBe('');
  });
});

describe('leftAloneMessage (AC2.2)', () => {
  it('says the exact sentence for an unmapped page', () => {
    expect(leftAloneMessage({ status: 'unmapped', reason: 'low-mapping' })).toBe(
      "Old News couldn't line up this page's paragraphs, so it left the page alone.",
    );
  });

  it('has a sentence for every left-alone status and none for acted-on pages', () => {
    expect(leftAloneMessage({ status: 'paused', scope: 'site' })).toBe(
      'Old News is paused on this site.',
    );
    expect(leftAloneMessage({ status: 'not-article' })).toMatch(/left it alone/);
    expect(leftAloneMessage({ status: 'non-english' })).toMatch(/English/);
    expect(leftAloneMessage({ status: 'error', reason: 'x' })).toMatch(/problem/);
    expect(leftAloneMessage({ status: 'analysing', total: 3 })).toBeNull();
  });
});
