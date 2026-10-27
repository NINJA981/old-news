/**
 * Copies bundled runtime assets into public/ (gitignored) so WXT packages them:
 *  - the two ONNX Runtime builds we ship (WASM base + JSPI for WebGPU) from onnxruntime-web;
 *  - the latin Fontsource subsets under stable names.
 * Runs before dev and build. No network.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** onnxruntime-web is a dependency of transformers.js, so find it beside it (pnpm strict layout). */
function ortDist(): string {
  const tf = realpathSync(join(ROOT, 'node_modules', '@huggingface', 'transformers'));
  // <store>/node_modules/@huggingface/transformers -> <store>/node_modules/onnxruntime-web
  return join(dirname(dirname(tf)), 'onnxruntime-web', 'dist');
}

function fontFile(pkg: string, file: string): string {
  return join(ROOT, 'node_modules', pkg, 'files', file);
}

const ORT_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jspi.mjs',
  'ort-wasm-simd-threaded.jspi.wasm',
];

/** Published name -> source. Names are what CSS and the font/get message refer to. */
const FONTS: Record<string, string> = {
  'newsreader-opsz-normal.woff2': fontFile(
    '@fontsource-variable/newsreader',
    'newsreader-latin-opsz-normal.woff2',
  ),
  'newsreader-opsz-italic.woff2': fontFile(
    '@fontsource-variable/newsreader',
    'newsreader-latin-opsz-italic.woff2',
  ),
  'hanken-grotesk-wght-normal.woff2': fontFile(
    '@fontsource-variable/hanken-grotesk',
    'hanken-grotesk-latin-wght-normal.woff2',
  ),
  // Smaller wght-only Newsreader for the in-page overlay (travels as base64 over messaging).
  'overlay-newsreader.woff2': fontFile(
    '@fontsource-variable/newsreader',
    'newsreader-latin-wght-normal.woff2',
  ),
  'overlay-hanken.woff2': fontFile(
    '@fontsource-variable/hanken-grotesk',
    'hanken-grotesk-latin-wght-normal.woff2',
  ),
};

async function copyIfChanged(src: string, dest: string): Promise<boolean> {
  const [s, d] = await Promise.all([stat(src), stat(dest).catch(() => null)]);
  if (d && d.size === s.size && d.mtimeMs >= s.mtimeMs) return false;
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  return true;
}

let copied = 0;
const dist = ortDist();
for (const f of ORT_FILES) {
  if (await copyIfChanged(join(dist, f), join(ROOT, 'public', 'ort', f))) copied++;
}
for (const [name, src] of Object.entries(FONTS)) {
  if (await copyIfChanged(src, join(ROOT, 'public', 'fonts', name))) copied++;
}
console.log(
  `assets: ${copied} copied, ${ORT_FILES.length + Object.keys(FONTS).length - copied} up to date`,
);

// The model is not committed (23 MB). Fail early with the fix instead of building a broken package.
const modelFile = join(
  ROOT,
  'public',
  'models',
  'Xenova',
  'all-MiniLM-L6-v2',
  'onnx',
  'model_quantized.onnx',
);
if (!existsSync(modelFile)) {
  console.error('assets: the model is missing. Run `pnpm fetch-model` once, then try again.');
  process.exitCode = 1;
}
