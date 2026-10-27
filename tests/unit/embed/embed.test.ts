import { describe, expect, it, vi } from 'vitest';
import {
  chooseBackend,
  hasJspi,
  hasWebGpu,
  ORT_FILES,
  warmupTexts,
  webgpuUsable,
  webgpuWorthShipping,
} from '../../../src/embed/backend';
import type { DisposableEmbedder, Timers } from '../../../src/embed/lazyEmbedder';
import { IDLE_UNLOAD_MS, LazyEmbedder } from '../../../src/embed/lazyEmbedder';
import { planBatches, splitRows } from '../../../src/embed/transformersEmbedder';

function manualTimers() {
  let next = 1;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      pending.set(next, { fn, ms });
      return next++;
    },
    clearTimeout: (h) => void pending.delete(h as number),
  };
  return {
    timers,
    pending,
    fireAll: () => {
      for (const [k, v] of [...pending]) {
        pending.delete(k);
        v.fn();
      }
    },
  };
}

function fakeModel() {
  const e: DisposableEmbedder & { disposed: number; embeds: number } = {
    id: 'fake',
    disposed: 0,
    embeds: 0,
    async embed(texts) {
      e.embeds++;
      return texts.map(() => new Float32Array([1, 0]));
    },
    dispose() {
      e.disposed++;
    },
  };
  return e;
}

describe('LazyEmbedder (AC5.1)', () => {
  it('loads nothing until the first embed', async () => {
    const create = vi.fn(async () => fakeModel());
    const lazy = new LazyEmbedder({ create, timers: manualTimers().timers });
    expect(lazy.loaded).toBe(false);
    expect(create).not.toHaveBeenCalled();
    await lazy.embed(['a']);
    expect(create).toHaveBeenCalledTimes(1);
    expect(lazy.loaded).toBe(true);
    await lazy.embed(['b']);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('loads once for concurrent first requests', async () => {
    const create = vi.fn(async () => fakeModel());
    const lazy = new LazyEmbedder({ create, timers: manualTimers().timers });
    await Promise.all([lazy.embed(['a']), lazy.embed(['b']), lazy.embed(['c'])]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('unloads after the idle period and reloads on the next request', async () => {
    const t = manualTimers();
    const models: ReturnType<typeof fakeModel>[] = [];
    const onUnload = vi.fn();
    const lazy = new LazyEmbedder({
      create: async () => {
        const m = fakeModel();
        models.push(m);
        return m;
      },
      timers: t.timers,
      onUnload,
    });
    await lazy.embed(['a']);
    expect([...t.pending.values()][0]?.ms).toBe(IDLE_UNLOAD_MS);
    expect(IDLE_UNLOAD_MS).toBe(300_000);
    t.fireAll();
    await vi.waitFor(() => expect(lazy.loaded).toBe(false));
    expect(models[0]?.disposed).toBe(1);
    await vi.waitFor(() => expect(onUnload).toHaveBeenCalledTimes(1));
    await lazy.embed(['b']);
    expect(models).toHaveLength(2);
  });

  it('each request restarts the idle timer', async () => {
    const t = manualTimers();
    const lazy = new LazyEmbedder({ create: async () => fakeModel(), timers: t.timers });
    await lazy.embed(['a']);
    await lazy.embed(['b']);
    expect(t.pending.size).toBe(1);
  });

  it('never unloads while a request is running', async () => {
    const t = manualTimers();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: DisposableEmbedder = {
      id: 'slow',
      async embed(texts) {
        await gate;
        return texts.map(() => new Float32Array(1));
      },
      dispose: vi.fn(),
    };
    const lazy = new LazyEmbedder({ create: async () => slow, timers: t.timers });
    const p = lazy.embed(['a']);
    await vi.waitFor(() => expect(lazy.loaded).toBe(true));
    expect(await lazy.unload()).toBe(false);
    release();
    await p;
    expect(slow.dispose).not.toHaveBeenCalled();
  });

  it('retries after a failed load and surfaces the error', async () => {
    const create = vi
      .fn<() => Promise<DisposableEmbedder>>()
      .mockRejectedValueOnce(new Error('model file missing'))
      .mockResolvedValueOnce(fakeModel());
    const lazy = new LazyEmbedder({ create, timers: manualTimers().timers });
    await expect(lazy.embed(['a'])).rejects.toThrow('model file missing');
    expect(lazy.loaded).toBe(false);
    await expect(lazy.embed(['a'])).resolves.toHaveLength(1);
  });

  it('dispose releases the model and clears the timer', async () => {
    const t = manualTimers();
    const m = fakeModel();
    const lazy = new LazyEmbedder({ create: async () => m, timers: t.timers });
    await lazy.embed(['a']);
    await lazy.dispose();
    expect(m.disposed).toBe(1);
    expect(t.pending.size).toBe(0);
    expect(lazy.id).toBe('lazy-unloaded');
  });
});

describe('chooseBackend (ADR §4.3)', () => {
  it('picks the faster working backend', () => {
    const c = chooseBackend([
      { backend: 'webgpu', ok: true, ms: 400 },
      { backend: 'wasm', ok: true, ms: 1000 },
    ]);
    expect(c.backend).toBe('webgpu');
    expect(c.webgpuGain).toBeCloseTo(0.6, 5);
  });

  it('prefers wasm within 5% or when webgpu is slower', () => {
    expect(
      chooseBackend([
        { backend: 'webgpu', ok: true, ms: 980 },
        { backend: 'wasm', ok: true, ms: 1000 },
      ]).backend,
    ).toBe('wasm');
    const slower = chooseBackend([
      { backend: 'webgpu', ok: true, ms: 1500 },
      { backend: 'wasm', ok: true, ms: 1000 },
    ]);
    expect(slower.backend).toBe('wasm');
    expect(slower.webgpuGain).toBeLessThan(0);
  });

  it('falls back when one backend fails and reports when both do', () => {
    expect(
      chooseBackend([
        { backend: 'webgpu', ok: false, ms: 0 },
        { backend: 'wasm', ok: true, ms: 900 },
      ]).backend,
    ).toBe('wasm');
    expect(
      chooseBackend([
        { backend: 'webgpu', ok: true, ms: 900 },
        { backend: 'wasm', ok: false, ms: 0 },
      ]).backend,
    ).toBe('webgpu');
    expect(chooseBackend([{ backend: 'wasm', ok: false, ms: 0 }]).backend).toBeNull();
    expect(chooseBackend([]).backend).toBeNull();
  });

  it('flags WebGPU as not worth shipping below a 20% gain', () => {
    expect(webgpuWorthShipping(0.19)).toBe(false);
    expect(webgpuWorthShipping(0.2)).toBe(true);
    expect(webgpuWorthShipping(null)).toBe(false);
  });
});

describe('capability probes', () => {
  it('needs both navigator.gpu and WebAssembly JSPI for webgpu', () => {
    const gpu = { navigator: { gpu: {} } };
    const jspi = { WebAssembly: { Suspending: function () {} } };
    expect(hasWebGpu(gpu)).toBe(true);
    expect(hasJspi(jspi)).toBe(true);
    expect(webgpuUsable({ ...gpu, ...jspi })).toBe(true);
    expect(webgpuUsable(gpu)).toBe(false);
    expect(webgpuUsable(jspi)).toBe(false);
    expect(webgpuUsable({})).toBe(false);
  });

  it('bundles the base and JSPI ORT builds only', () => {
    expect(Object.values(ORT_FILES).map((f) => f.wasm)).toEqual([
      'ort-wasm-simd-threaded.wasm',
      'ort-wasm-simd-threaded.jspi.wasm',
    ]);
  });
});

describe('warmupTexts and splitRows', () => {
  it('gives 32 distinct warm-up texts by default', () => {
    const t = warmupTexts();
    expect(t).toHaveLength(32);
    expect(new Set(t).size).toBe(32);
  });

  it('splits a flat tensor into rows', () => {
    const rows = splitRows(new Float32Array([1, 2, 3, 4, 5, 6]), 2, 3);
    expect(rows.map((r) => [...r])).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('rejects a tensor with the wrong size', () => {
    expect(() => splitRows(new Float32Array(5), 2, 3)).toThrow(/Unexpected embedding shape/);
  });
});

describe('planBatches', () => {
  it('covers every index exactly once and groups by length', () => {
    const texts = ['aaaaaaaaaa', 'a', 'aaaaaa', 'aa', 'aaaaaaaa', 'aaa'];
    const batches = planBatches(texts, 4);
    expect(batches).toHaveLength(2);
    expect(batches.flat().sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(batches[0]).toEqual([1, 3, 5, 2]);
    expect(batches[1]).toEqual([4, 0]);
  });

  it('handles empty input and exact multiples', () => {
    expect(planBatches([], 16)).toEqual([]);
    expect(planBatches(['a', 'b', 'c', 'd'], 2)).toHaveLength(2);
  });
});
