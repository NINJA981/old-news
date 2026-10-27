import { describe, expect, it, vi } from 'vitest';
import { createLogger, redact } from '../../../src/messaging/log';
import {
  CONTENT_MESSAGE_TYPES,
  ENGINE_MESSAGE_TYPES,
  isContentMessage,
  isEngineMessage,
  parseEngineEnvelope,
  parseMessage,
} from '../../../src/messaging/protocol';

const page = {
  url: 'https://a.example/x',
  canonicalUrl: 'https://a.example/x',
  siteName: 'A',
  title: 'T',
  kind: 'news',
};

describe('parseMessage', () => {
  it('accepts well-formed messages of every shape the app sends', () => {
    const good = [
      { type: 'page/analyse', page, paragraphs: [{ ordinal: 0, text: 'x' }] },
      { type: 'page/ingest', page, paragraphs: [] },
      { type: 'page/read', canonicalUrl: 'https://a.example/x', ordinals: [0, 1] },
      { type: 'page/status', url: 'https://a.example/x', status: { status: 'not-article' } },
      { type: 'page/status', url: 'u', status: { status: 'paused', scope: 'site' } },
      { type: 'page/feedback', fingerprint: 'f', oldParagraphId: 'p' },
      { type: 'ingest/tabs', tabIds: [1, 2] },
      { type: 'ingest/candidates' },
      { type: 'settings/changed' },
      { type: 'memory/stats' },
      { type: 'memory/wipe' },
      { type: 'drift/list' },
      { type: 'drift/list', storyId: 's' },
      { type: 'receipt/week' },
      { type: 'font/get', family: 'newsreader' },
    ];
    for (const m of good) expect(parseMessage(m), JSON.stringify(m)).not.toBeNull();
  });

  it('drops unknown types, wrong shapes and out-of-range values', () => {
    const bad = [
      null,
      undefined,
      'page/analyse',
      42,
      {},
      { type: 'nope' },
      { type: 'page/analyse', page, paragraphs: 'x' },
      { type: 'page/analyse', page: { ...page, kind: 'tweet' }, paragraphs: [] },
      { type: 'page/analyse', page, paragraphs: [{ ordinal: -1, text: 'x' }] },
      { type: 'page/analyse', page, paragraphs: [{ ordinal: 1.5, text: 'x' }] },
      { type: 'page/read', canonicalUrl: 'u', ordinals: ['a'] },
      { type: 'font/get', family: 'comic-sans' },
      { type: 'page/status', url: 'u', status: { status: 'result' } },
    ];
    for (const m of bad) expect(parseMessage(m), JSON.stringify(m)).toBeNull();
  });

  it('caps paragraph count and text length', () => {
    const many = Array.from({ length: 601 }, (_, ordinal) => ({ ordinal, text: 'x' }));
    expect(parseMessage({ type: 'page/analyse', page, paragraphs: many })).toBeNull();
    expect(
      parseMessage({
        type: 'page/analyse',
        page,
        paragraphs: [{ ordinal: 0, text: 'x'.repeat(20_001) }],
      }),
    ).toBeNull();
  });
});

describe('envelope and routing sets', () => {
  it('parses an engine envelope and refuses a bare message', () => {
    const env = { target: 'engine', message: { type: 'memory/stats' } };
    expect(parseEngineEnvelope(env)?.message.type).toBe('memory/stats');
    expect(parseEngineEnvelope({ type: 'memory/stats' })).toBeNull();
    expect(parseEngineEnvelope({ target: 'other', message: { type: 'memory/stats' } })).toBeNull();
  });

  it('a page context can only send page-level messages, never wipe or list memory', () => {
    for (const type of [
      'memory/wipe',
      'memory/stats',
      'memory/sweep',
      'drift/list',
      'stories/list',
      'receipt/week',
      'ingest/tabs',
      'settings/changed',
    ]) {
      expect(CONTENT_MESSAGE_TYPES.has(type as never), type).toBe(false);
    }
    expect(
      isContentMessage(parseMessage({ type: 'page/read', canonicalUrl: 'u', ordinals: [] })!),
    ).toBe(true);
    expect(isContentMessage(parseMessage({ type: 'memory/wipe' })!)).toBe(false);
  });

  it('classifies engine messages', () => {
    expect(isEngineMessage(parseMessage({ type: 'memory/wipe' })!)).toBe(true);
    expect(
      isEngineMessage(
        parseMessage({ type: 'page/status', url: 'u', status: { status: 'not-article' } })!,
      ),
    ).toBe(false);
    expect(ENGINE_MESSAGE_TYPES.has('font/get')).toBe(false);
  });
});

describe('logging redaction', () => {
  it('replaces text-bearing fields at any depth and summarises typed arrays', () => {
    const out = redact({
      type: 'page/analyse',
      page: { url: 'https://a.example/secret', title: 'Private title', siteName: 'A' },
      paragraphs: [{ ordinal: 0, text: 'secret paragraph' }],
      vec: new Int8Array(4),
      nested: [{ snippet: 'secret', count: 3 }],
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/secret|Private title/);
    expect((out['page'] as Record<string, unknown>)['siteName']).toBe('A');
    expect(out['vec']).toBe('[Int8Array]');
    expect((out['nested'] as { count: number }[])[0]?.count).toBe(3);
  });

  it('stops at a depth limit instead of recursing forever', () => {
    const loop: Record<string, unknown> = {};
    loop['self'] = loop;
    expect(() => redact(loop)).not.toThrow();
  });

  it('a disabled logger writes nothing; an enabled one writes redacted data', () => {
    const sink = { warn: vi.fn(), error: vi.fn() };
    createLogger(false, sink).warn('x', { text: 'secret' });
    expect(sink.warn).not.toHaveBeenCalled();
    createLogger(true, sink).error('failed', { text: 'secret', code: 7 });
    expect(sink.error).toHaveBeenCalledWith('[old-news] failed', { text: '[redacted]', code: 7 });
  });
});
