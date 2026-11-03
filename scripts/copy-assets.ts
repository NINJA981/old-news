/**
 * Copies bundled runtime assets into public/ (gitignored) so WXT packages them:
 *  - the two ONNX Runtime builds we ship (WASM base + JSPI for WebGPU) from onnxruntime-web;
 *  - the latin Fontsource subsets under stable names;
 *  - the licence texts of everything the package redistributes (public/licenses).
 * Runs before dev and build. No network.
 */
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
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

// Licence texts travel inside the package: Old News's own licence, THIRD_PARTY.md, and the licence
// file of every component the package redistributes (Apache-2.0 and SIL OFL 1.1 require it).
const LICENSED: Record<string, string> = {
  '@huggingface/transformers': 'transformers.txt',
  '@mozilla/readability': 'readability.txt',
  '@fontsource-variable/newsreader': 'newsreader-ofl.txt',
  '@fontsource-variable/hanken-grotesk': 'hanken-grotesk-ofl.txt',
  '@radix-ui/react-switch': 'radix-ui.txt',
  cmdk: 'cmdk.txt',
  idb: 'idb.txt',
  'lucide-react': 'lucide.txt',
  motion: 'motion.txt',
  react: 'react.txt',
  'react-dom': 'react-dom.txt',
  sonner: 'sonner.txt',
  valibot: 'valibot.txt',
};

function licenceFile(dir: string): string | null {
  const name = readdirSync(dir).find((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f));
  return name ? join(dir, name) : null;
}

const LICENCES = join(ROOT, 'public', 'licenses');
await mkdir(LICENCES, { recursive: true });
await copyFile(join(ROOT, 'LICENSE'), join(ROOT, 'public', 'LICENSE.txt'));
await copyFile(join(ROOT, 'THIRD_PARTY.md'), join(ROOT, 'public', 'THIRD_PARTY.md'));
const missing: string[] = [];
for (const [pkg, out] of Object.entries(LICENSED)) {
  const file = licenceFile(join(ROOT, 'node_modules', pkg));
  if (file) await copyFile(file, join(LICENCES, out));
  else missing.push(pkg);
}
// onnxruntime-web publishes no licence file in its npm package; its licence is MIT.
await writeFile(
  join(LICENCES, 'onnxruntime-web.txt'),
  [
    'onnxruntime-web (https://github.com/microsoft/onnxruntime), MIT License',
    '',
    'Copyright (c) Microsoft Corporation',
    '',
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and',
    'associated documentation files (the "Software"), to deal in the Software without restriction,',
    'including without limitation the rights to use, copy, modify, merge, publish, distribute,',
    'sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is',
    'furnished to do so, subject to the following conditions:',
    '',
    'The above copyright notice and this permission notice shall be included in all copies or',
    'substantial portions of the Software.',
    '',
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT',
    'NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND',
    'NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,',
    'DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT',
    'OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
    '',
  ].join('\n'),
);
// The model is Apache-2.0 (same text as transformers.js, which is Apache-2.0 too).
await writeFile(
  join(LICENCES, 'all-MiniLM-L6-v2.txt'),
  [
    'models/Xenova/all-MiniLM-L6-v2: ONNX export by Xenova of sentence-transformers/all-MiniLM-L6-v2,',
    'revision 751bff37182d3f1213fa05d7196b954e230abad9, licensed under the Apache License 2.0.',
    'The full licence text is in transformers.txt in this folder.',
    '',
  ].join('\n'),
);
if (missing.length) {
  console.error(`assets: no licence file found for ${missing.join(', ')}`);
  process.exitCode = 1;
}
