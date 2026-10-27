/**
 * Design-token gate (DESIGN.md is the source of truth).
 *
 *   pnpm check-tokens
 *
 * Fails when src/ui/tokens.css drifts from the DESIGN.md front matter, when a documented contrast
 * pair falls below its floor, or when UI code uses a colour that is not a token (raw Tailwind
 * palette utilities, or a hex value DESIGN.md does not define).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wcagContrast } from 'culori';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** CSS variable -> DESIGN.md colour key, for light and dark. */
const LIGHT: Record<string, string> = {
  bg: 'bg',
  surface: 'surface',
  'surface-2': 'surface-2',
  'surface-3': 'surface-3',
  border: 'border',
  'border-strong': 'border-strong',
  text: 'text',
  'text-muted': 'text-muted',
  'text-subtle': 'text-subtle',
  accent: 'accent',
  'accent-hover': 'accent-hover',
  'accent-text': 'accent-text',
  'on-accent': 'on-accent',
  'accent-soft': 'accent-soft',
  drift: 'drift',
  'drift-soft': 'drift-soft',
  success: 'success',
  danger: 'danger',
  'danger-soft': 'danger-soft',
  info: 'info',
};
const DARK: Record<string, string> = {
  ...Object.fromEntries(Object.entries(LIGHT).map(([v, k]) => [v, `${k}-dark`])),
  'accent-text': 'primary',
};

/** [foreground, background, minimum ratio, label]. WCAG AA text is 4.5; non-text is 3. */
const PAIRS: [string, string, number, string][] = [
  ['text', 'bg', 4.5, 'body text'],
  ['text', 'surface', 4.5, 'text on surface'],
  ['text-muted', 'bg', 4.5, 'muted text'],
  ['text-muted', 'surface', 4.5, 'muted text on surface'],
  ['text-muted', 'surface-2', 4.5, 'muted text on surface-2'],
  ['text-subtle', 'bg', 4.5, 'subtle text'],
  ['text-subtle', 'surface', 4.5, 'subtle text on surface'],
  ['accent-text', 'bg', 4.5, 'accent text'],
  ['accent-text', 'surface', 4.5, 'accent text on surface'],
  ['on-accent', 'accent', 4.5, 'primary button label'],
  ['text', 'accent-soft', 4.5, 'text on accent-soft'],
  ['drift', 'drift-soft', 4.5, 'drift chip'],
  ['danger', 'danger-soft', 4.5, 'danger button'],
  ['success', 'surface', 4.5, 'success notice'],
  ['info', 'surface', 4.5, 'info notice'],
  ['border-strong', 'bg', 3, 'input border (non-text)'],
];

export interface TokenReport {
  errors: string[];
  checked: { values: number; pairs: number; files: number };
}

function frontMatterColors(designMd: string): Record<string, string> {
  const fm = /^---\n([\s\S]*?)\n---/.exec(designMd)?.[1] ?? '';
  const block = /^colors:\n((?:[ \t]+.*\n?)+)/m.exec(fm)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = /^\s+([a-z0-9-]+):\s*"(#[0-9a-fA-F]{6})"/.exec(line);
    if (m) out[m[1] as string] = (m[2] as string).toLowerCase();
  }
  return out;
}

/** Variables declared in the block that follows `selector {`. */
function blockVars(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) return {};
  const open = css.indexOf('{', start);
  const close =
    css.indexOf('\n  }', open) >= 0 && selector.startsWith('  ')
      ? css.indexOf('\n  }', open)
      : css.indexOf('\n}', open);
  const body = css.slice(open + 1, close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1] as string] = (m[2] as string).toLowerCase();
  }
  return out;
}

function walk(dir: string, exts: readonly string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p, exts);
    return exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

const RAW_PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow|accent|decoration)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/;

export function checkTokens(root = ROOT): TokenReport {
  const errors: string[] = [];
  const design = frontMatterColors(readFileSync(join(root, 'DESIGN.md'), 'utf8'));
  const css = readFileSync(join(root, 'src', 'ui', 'tokens.css'), 'utf8');

  const light = blockVars(css, '\n:root {');
  const dark = blockVars(css, ":root[data-theme='dark']");
  const system = blockVars(css, ':root:not([data-theme]) {');

  let values = 0;
  const compare = (
    name: string,
    got: Record<string, string>,
    map: Record<string, string>,
  ): void => {
    for (const [v, key] of Object.entries(map)) {
      const want = design[key];
      values++;
      if (!want) errors.push(`DESIGN.md has no colour "${key}" (needed for --${v} in ${name})`);
      else if (got[v] !== want)
        errors.push(`${name}: --${v} is ${got[v] ?? 'missing'}, DESIGN.md ${key} is ${want}`);
    }
  };
  compare('light :root', light, LIGHT);
  compare("dark :root[data-theme='dark']", dark, DARK);
  compare('system-dark media block', system, DARK);

  let pairs = 0;
  for (const [name, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [fg, bg, min, label] of PAIRS) {
      pairs++;
      const a = theme[fg];
      const b = theme[bg];
      if (!a || !b) continue; // already reported as missing above
      const ratio = wcagContrast(a, b);
      if (ratio < min)
        errors.push(`${name}: ${label} (${fg} on ${bg}) is ${ratio.toFixed(2)}:1, needs ${min}:1`);
    }
  }

  // No off-token colours in UI code.
  const allowed = new Set(Object.values(design));
  const files = [
    ...walk(join(root, 'src'), ['.ts', '.tsx', '.css']),
    ...walk(join(root, 'entrypoints'), ['.ts', '.tsx', '.html', '.css']),
  ].filter((f) => !f.endsWith('tokens.css') && !f.includes(`${join('src', 'engine')}`));
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const rel = relative(root, f).replaceAll('\\', '/');
    const raw = RAW_PALETTE.exec(text);
    if (raw) errors.push(`${rel}: raw palette utility "${raw[0]}" (use token classes)`);
    for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      if (!allowed.has(m[0].toLowerCase())) errors.push(`${rel}: off-token colour ${m[0]}`);
    }
  }
  return { errors, checked: { values, pairs, files: files.length } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, checked } = checkTokens();
  if (errors.length > 0) {
    console.error(errors.map((e) => `  ${e}`).join('\n'));
    console.error(`check-tokens: ${errors.length} problem(s)`);
    process.exitCode = 1;
  } else {
    console.log(
      `check-tokens: ok (${checked.values} values, ${checked.pairs} contrast pairs, ${checked.files} files scanned)`,
    );
  }
}
