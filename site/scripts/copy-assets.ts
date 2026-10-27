/**
 * Copies bundled runtime assets into public/ (gitignored):
 *  - the latin Fontsource subsets under stable names (the landing preloads them);
 *  - the MiniLM int8 model files and the base ONNX Runtime wasm from the extension package at the
 *    repo root (fetched there by `pnpm fetch-model`). They back the web app's optional "meaning
 *    match" and are served from the site's own origin; the app never fetches anything remote.
 * No network.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(SITE, '..');

const FONTS: Record<string, string> = {
  'newsreader-opsz-normal.woff2': join(
    SITE,
    'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2',
  ),
  'hanken-grotesk-wght-normal.woff2': join(
    SITE,
    'node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2',
  ),
};

const MODEL_DIR = 'Xenova/all-MiniLM-L6-v2';
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];
const ORT_FILES = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

async function copyIfChanged(src: string, dest: string): Promise<void> {
  const s = await stat(src);
  const d = await stat(dest).catch(() => null);
  if (d && d.size === s.size && d.mtimeMs >= s.mtimeMs) return;
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(realpathSync(src), dest);
  console.log(`copied ${dest.slice(SITE.length + 1)} (${(s.size / 1024).toFixed(0)} KB)`);
}

for (const [name, src] of Object.entries(FONTS)) {
  await copyIfChanged(src, join(SITE, 'public', 'fonts', name));
}

const haveModel = MODEL_FILES.every((f) =>
  existsSync(join(ROOT, 'public', 'models', MODEL_DIR, f)),
);
const haveOrt = ORT_FILES.every((f) => existsSync(join(ROOT, 'public', 'ort', f)));
if (haveModel && haveOrt) {
  for (const f of MODEL_FILES) {
    await copyIfChanged(
      join(ROOT, 'public', 'models', MODEL_DIR, f),
      join(SITE, 'public', 'models', MODEL_DIR, f),
    );
  }
  for (const f of ORT_FILES) {
    await copyIfChanged(join(ROOT, 'public', 'ort', f), join(SITE, 'public', 'ort', f));
  }
} else {
  console.warn(
    'Model or ONNX Runtime files not found at the repo root. Run `pnpm fetch-model && pnpm assets` ' +
      'in the repo root first. The web app still works without them; the optional meaning match ' +
      'will report that the model is unavailable.',
  );
}
