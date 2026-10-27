import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DARK, LIGHT } from '../../../src/overlay/tokens';

function colors(): Record<string, string> {
  const md = readFileSync(join(process.cwd(), 'DESIGN.md'), 'utf8');
  const out: Record<string, string> = {};
  for (const m of md.matchAll(/^ {2}([a-z0-9-]+):\s*"(#[0-9a-fA-F]{6})"/gm)) {
    out[m[1] as string] = (m[2] as string).toLowerCase();
  }
  return out;
}

describe('overlay palette mirrors DESIGN.md', () => {
  const c = colors();
  const pairs: [keyof typeof LIGHT, string][] = [
    ['surface', 'surface'],
    ['surface2', 'surface-2'],
    ['border', 'border'],
    ['borderStrong', 'border-strong'],
    ['text', 'text'],
    ['textMuted', 'text-muted'],
    ['textSubtle', 'text-subtle'],
    ['accent', 'accent'],
    ['onAccent', 'on-accent'],
    ['drift', 'drift'],
    ['driftSoft', 'drift-soft'],
    ['danger', 'danger'],
  ];
  it.each(pairs)('light %s', (key, name) => {
    expect(LIGHT[key]).toBe(c[name]);
  });
  it.each(pairs)('dark %s', (key, name) => {
    expect(DARK[key]).toBe(c[`${name}-dark`]);
  });
});
