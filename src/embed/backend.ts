/**
 * Inference backend choice (ADR-0001 §4.3): run the same warm-up on WebGPU (if the browser can)
 * and on WASM, then use the faster one. This module is the pure part: capability checks, the
 * warm-up corpus and the decision. Timing itself is done by the host with a real model.
 */

export type Backend = 'webgpu' | 'wasm';

export interface BackendTiming {
  backend: Backend;
  /** False when the backend failed to load or run. */
  ok: boolean;
  /** Warm-up wall time in ms (ignored when !ok). */
  ms: number;
}

export interface BackendChoice {
  backend: Backend | null;
  /** Fraction by which WebGPU beat WASM ((wasm - gpu) / wasm), or null when not comparable. */
  webgpuGain: number | null;
  reason: string;
}

/**
 * The faster working backend wins. Ties and anything within 5% go to WASM, which is the simpler
 * and more predictable path. `null` backend means neither worked (degraded engine).
 */
export function chooseBackend(timings: readonly BackendTiming[]): BackendChoice {
  const gpu = timings.find((t) => t.backend === 'webgpu' && t.ok);
  const wasm = timings.find((t) => t.backend === 'wasm' && t.ok);
  if (!gpu && !wasm)
    return { backend: null, webgpuGain: null, reason: 'no backend could run the model' };
  if (gpu && !wasm)
    return { backend: 'webgpu', webgpuGain: null, reason: 'wasm failed, webgpu worked' };
  if (!gpu && wasm)
    return { backend: 'wasm', webgpuGain: null, reason: 'webgpu unavailable or failed' };
  const g = gpu as BackendTiming;
  const w = wasm as BackendTiming;
  const gain = w.ms > 0 ? (w.ms - g.ms) / w.ms : 0;
  return gain > 0.05
    ? { backend: 'webgpu', webgpuGain: gain, reason: 'webgpu was faster on warm-up' }
    : { backend: 'wasm', webgpuGain: gain, reason: 'wasm was as fast or faster on warm-up' };
}

/** ADR §4.3: if WebGPU gains less than this over WASM, propose dropping it (ADR-0002). */
export const WEBGPU_MIN_GAIN = 0.2;

export function webgpuWorthShipping(gain: number | null): boolean {
  return gain !== null && gain >= WEBGPU_MIN_GAIN;
}

/** Minimal shape of the globals we probe, so tests can pass fakes. */
export interface CapabilityProbe {
  navigator?: { gpu?: unknown };
  WebAssembly?: { Suspending?: unknown };
}

/** WebGPU in extension pages needs navigator.gpu (Chrome >= 113). */
export function hasWebGpu(env: CapabilityProbe = globalThis as CapabilityProbe): boolean {
  return typeof env.navigator?.gpu === 'object' && env.navigator.gpu !== null;
}

/**
 * The bundled WebGPU-capable ORT build is the JSPI one (16 MB, versus 25.6 MB for asyncify), so
 * WebGPU is only attempted where WebAssembly JSPI exists (Chrome >= 137).
 */
export function hasJspi(env: CapabilityProbe = globalThis as CapabilityProbe): boolean {
  return typeof env.WebAssembly?.Suspending === 'function';
}

export function webgpuUsable(env: CapabilityProbe = globalThis as CapabilityProbe): boolean {
  return hasWebGpu(env) && hasJspi(env);
}

/** ORT runtime files bundled into public/ort/ for each backend. */
export const ORT_FILES: Readonly<Record<Backend, { mjs: string; wasm: string }>> = {
  wasm: { mjs: 'ort-wasm-simd-threaded.mjs', wasm: 'ort-wasm-simd-threaded.wasm' },
  webgpu: { mjs: 'ort-wasm-simd-threaded.jspi.mjs', wasm: 'ort-wasm-simd-threaded.jspi.wasm' },
};

/**
 * Warm-up texts: invented, generic news-like sentences of realistic length. 32 of them match the
 * 30-paragraph article the latency budget is stated for (SPEC AC5.2).
 */
export function warmupTexts(count = 32): string[] {
  const base = [
    'Officials said the council would meet on Thursday to decide whether the proposal should go to a public vote.',
    'The company declined to comment on the report and referred questions to its legal team.',
    'Residents near the site were told to keep their windows closed while crews worked through the night.',
    'A spokesperson for the regional authority said the inquiry would begin once the building was declared safe.',
    'Analysts expect the decision to affect prices across the region over the coming months, though estimates differ.',
    'The report, published on Monday, found that most of the delays were caused by staffing shortages and old equipment.',
    'Local businesses said they had seen fewer customers since the road was closed at the start of the month.',
    'Investigators have not said what caused the failure and asked anyone with footage to come forward.',
  ];
  return Array.from({ length: count }, (_, i) => `${base[i % base.length]} (${i + 1})`);
}
