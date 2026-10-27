import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertLocalUrl,
  base64ToBytes,
  bytesToBase64,
  fetchLocalAsset,
} from '../../../src/net/localAsset';

describe('assertLocalUrl', () => {
  it('accepts extension origins', () => {
    expect(assertLocalUrl('chrome-extension://abc/models/x.onnx').host).toBe('abc');
    expect(assertLocalUrl('moz-extension://abc/ort/x.wasm').protocol).toBe('moz-extension:');
  });

  it.each([
    'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/model.onnx',
    'http://127.0.0.1/model.onnx',
    'data:text/plain,hi',
    'blob:chrome-extension://abc/1',
    '/models/x.onnx',
    'not a url',
  ])('refuses %s', (url) => {
    expect(() => assertLocalUrl(url)).toThrow(/Refusing/);
  });

  it('allows the web app own origin only when opted in', () => {
    const url = 'https://app.example/models/x.onnx';
    expect(() => assertLocalUrl(url)).toThrow();
    expect(assertLocalUrl(url, { sameOrigin: 'https://app.example' }).pathname).toBe(
      '/models/x.onnx',
    );
    expect(() =>
      assertLocalUrl('https://evil.example/x', { sameOrigin: 'https://app.example' }),
    ).toThrow();
  });
});

describe('fetchLocalAsset', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('never calls fetch for a remote URL', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await expect(fetchLocalAsset('https://example.com/a')).rejects.toThrow(/Refusing/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches an extension URL without credentials', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', spy);
    await fetchLocalAsset('chrome-extension://abc/a.txt');
    expect(spy).toHaveBeenCalledWith(
      'chrome-extension://abc/a.txt',
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('reports a missing bundled asset by path only', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(fetchLocalAsset('chrome-extension://abc/models/missing.onnx')).rejects.toThrow(
      /missing \(404\): \/models\/missing\.onnx/,
    );
  });
});

describe('base64 helpers', () => {
  it('round-trips bytes, including large inputs', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
