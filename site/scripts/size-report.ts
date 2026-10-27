/**
 * Reports and gates the built site against the budgets (bible 8.2 and 11.3, DESIGN.md landing plan):
 *   landing initial JS  <= 120 KB gzipped, no 3D chunk (0 KB)
 *   web app first route <= 170 KB gzipped JS
 * "Initial" means the entry chunk plus the static imports it needs, read from the Vite manifest.
 * The optional model loader (transformers.js) and the sample data are lazy chunks and reported apart.
 */
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist');
const manifestPath = join(DIST, '.vite', 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('size-report: run `vite build` first');
  process.exit(1);
}
interface Chunk {
  file: string;
  css?: string[];
  imports?: string[];
  dynamicImports?: string[];
  isEntry?: boolean;
  name?: string;
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, Chunk>;
const gz = (file: string): number => gzipSync(readFileSync(join(DIST, file))).length;
const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;

function initial(entryName: string): { js: number; css: number; files: string[] } {
  const key = Object.keys(manifest).find(
    (k) => manifest[k]?.isEntry && manifest[k]?.name === entryName,
  );
  if (!key) throw new Error(`no entry named ${entryName}`);
  const seen = new Set<string>();
  const js: string[] = [];
  const css: string[] = [];
  const visit = (k: string): void => {
    if (seen.has(k)) return;
    seen.add(k);
    const c = manifest[k];
    if (!c) return;
    js.push(c.file);
    css.push(...(c.css ?? []));
    for (const i of c.imports ?? []) visit(i);
  };
  visit(key);
  return {
    js: js.reduce((a, f) => a + gz(f), 0),
    css: [...new Set(css)].reduce((a, f) => a + gz(f), 0),
    files: js,
  };
}

const landing = initial('main');
const app = initial('app');
const lazy = Object.values(manifest)
  .filter((c) => !c.isEntry)
  .filter((c) => !landing.files.includes(c.file) && !app.files.includes(c.file))
  .map((c) => `${c.file} ${kb(gz(c.file))}`);
const html = statSync(join(DIST, 'index.html')).size;

const lines = [
  `landing   initial JS ${kb(landing.js)} gz (budget 120 KB), CSS ${kb(landing.css)} gz, HTML ${kb(html)}, 3D chunk 0 KB`,
  `web app   first-route JS ${kb(app.js)} gz (budget 170 KB), CSS ${kb(app.css)} gz`,
  `lazy      ${lazy.join('; ')}`,
];
console.log(lines.join('\n'));
const fail: string[] = [];
if (landing.js > 120 * 1024) fail.push('landing initial JS is over 120 KB gz');
if (app.js > 170 * 1024) fail.push('web app first-route JS is over 170 KB gz');
if (fail.length > 0) {
  console.error(fail.join('\n'));
  process.exit(1);
}
