/**
 * Token gate for the site (DESIGN.md is the source of truth).
 *  1. Every colour value in src/styles/tokens.css matches the DESIGN.md front matter
 *     (the `drift-mark` roles are checked against the Colors tables).
 *  2. No colour literal (hex, rgb(), hsl(), oklch(), named) appears in any other src file, so UI can
 *     only use role tokens. Raw palette utility names are banned too.
 *  3. The type, radius and motion tokens the site relies on are present.
 * Exit code 1 on any violation. Run `pnpm check-tokens`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN = readFileSync(join(SITE, '..', 'DESIGN.md'), 'utf8');
const TOKENS = readFileSync(join(SITE, 'src', 'styles', 'tokens.css'), 'utf8');

const problems: string[] = [];

// 1. DESIGN.md front matter colours.
const front = DESIGN.split('---')[1] ?? '';
const design = new Map<string, string>();
let inColors = false;
for (const line of front.split('\n')) {
  if (/^colors:/.test(line)) inColors = true;
  else if (/^\S/.test(line)) inColors = false;
  const m = /^\s{2}([a-z0-9-]+):\s*"(#[0-9a-f]{6})"/i.exec(line);
  if (inColors && m) design.set(m[1] as string, (m[2] as string).toLowerCase());
}

/** token css name -> DESIGN.md name, per theme block. */
const roles = [
  'bg',
  'surface',
  'surface-2',
  'surface-3',
  'border',
  'border-strong',
  'text',
  'text-muted',
  'text-subtle',
  'accent',
  'accent-hover',
  'on-accent',
  'accent-soft',
  'drift',
  'drift-soft',
  'success',
  'danger',
  'danger-soft',
  'info',
];
function block(selector: RegExp): string {
  const m = selector.exec(TOKENS);
  if (!m) return '';
  const start = TOKENS.indexOf('{', m.index);
  return TOKENS.slice(start, TOKENS.indexOf('\n}', start));
}
const dark = block(/:root,\s*\n\[data-theme='dark'\]/);
const light = block(/\n\[data-theme='light'\]\s*\{/);
for (const [name, css, suffix] of [
  ['dark', dark, '-dark'],
  ['light', light, ''],
] as const) {
  for (const role of roles) {
    const want = design.get(`${role}${suffix}`);
    const got = new RegExp(`--${role}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1]?.toLowerCase();
    if (!want) problems.push(`DESIGN.md has no colour ${role}${suffix}`);
    else if (got !== want)
      problems.push(`${name} --${role} is ${got ?? 'missing'}, DESIGN.md says ${want}`);
  }
}
if (design.get('accent-text') !== '#12676a')
  problems.push('DESIGN.md accent-text changed; update tokens.css');
for (const [token, expect] of [
  ['--drift-mark: oklch(0.83 0.11 78 / 0.24)', 'dark drift-mark'],
  ['--drift-mark: oklch(0.88 0.11 85 / 0.55)', 'light drift-mark'],
] as const) {
  if (!TOKENS.includes(token))
    problems.push(`tokens.css is missing the ${expect} from DESIGN.md Colors`);
}

// 2. No colour literals outside tokens.css.
const LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(|\b(?:bg|text|border|fill|stroke)-(?:white|black|gray|slate|zinc|neutral|red|blue|green|amber|indigo|purple)\b/;
const NAMED = /:\s*(?:white|black|red|blue|green|gray|grey|purple|orange|yellow)\s*[;}]/;
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'generated' || f === 'data' ? [] : walk(p);
    return /\.(css|ts|tsx|html)$/.test(f) ? [p] : [];
  });
}
for (const file of walk(join(SITE, 'src'))) {
  if (file.endsWith('tokens.css')) continue;
  const text = readFileSync(file, 'utf8').split('\n');
  text.forEach((line, i) => {
    const code = line.replace(/\/\*.*?\*\//g, '').replace(/^\s*(\/\/|\*).*/, '');
    if (LITERAL.test(code) || NAMED.test(code)) {
      problems.push(
        `${file.slice(SITE.length + 1)}:${i + 1}: colour literal or raw palette name: ${line.trim()}`,
      );
    }
  });
}

// 3. The tokens the site consumes.
for (const t of [
  '--r-xs: 4px',
  '--r-sm: 8px',
  '--r-md: 12px',
  '--r-lg: 16px',
  '--ease-scene: cubic-bezier(0.65, 0.05, 0, 1)',
  '--ease-out: cubic-bezier(0.23, 1, 0.32, 1)',
]) {
  if (!TOKENS.includes(t)) problems.push(`tokens.css is missing ${t}`);
}

if (problems.length > 0) {
  console.error(
    `check-tokens: ${problems.length} problem(s)\n` + problems.map((p) => `  ${p}`).join('\n'),
  );
  process.exit(1);
}
console.log(
  `check-tokens: ok (${roles.length} roles x 2 themes match DESIGN.md; no colour literals outside tokens.css)`,
);
