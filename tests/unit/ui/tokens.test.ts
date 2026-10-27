import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTokens } from '../../../scripts/check-tokens';

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'tokens-'));
  cpSync(join(process.cwd(), 'DESIGN.md'), join(root, 'DESIGN.md'));
  mkdirSync(join(root, 'src', 'ui'), { recursive: true });
  mkdirSync(join(root, 'entrypoints'), { recursive: true });
  cpSync(join(process.cwd(), 'src', 'ui', 'tokens.css'), join(root, 'src', 'ui', 'tokens.css'));
  return root;
}

describe('design tokens (AC-D1)', () => {
  it('tokens.css matches DESIGN.md, every contrast pair passes, and the UI uses only tokens', () => {
    const { errors, checked } = checkTokens();
    expect(errors).toEqual([]);
    expect(checked.values).toBe(60);
    expect(checked.files).toBeGreaterThan(10);
  });

  it('fails when a token value drifts from DESIGN.md', () => {
    const root = sandbox();
    const p = join(root, 'src', 'ui', 'tokens.css');
    writeFileSync(p, readFileSync(p, 'utf8').replace('--accent: #1d7779;', '--accent: #1d7770;'));
    expect(checkTokens(root).errors.join('\n')).toContain('--accent is #1d7770');
  });

  it('fails when a documented contrast pair drops below its floor', () => {
    const root = sandbox();
    const design = join(root, 'DESIGN.md');
    const css = join(root, 'src', 'ui', 'tokens.css');
    // Make light text-subtle too pale in both files, so parity passes but contrast does not.
    writeFileSync(
      design,
      readFileSync(design, 'utf8').replace('text-subtle: "#76706a"', 'text-subtle: "#b0aaa4"'),
    );
    writeFileSync(
      css,
      readFileSync(css, 'utf8').replace('--text-subtle: #76706a;', '--text-subtle: #b0aaa4;'),
    );
    expect(checkTokens(root).errors.join('\n')).toMatch(/light: subtle text .* needs 4\.5:1/);
  });

  it('flags raw palette utilities and off-token colours in UI code', () => {
    const root = sandbox();
    writeFileSync(
      join(root, 'entrypoints', 'bad.tsx'),
      'export const A = () => <p className="bg-white text-gray-600" style={{ color: "#ff00aa" }} />;\n',
    );
    const errors = checkTokens(root).errors.join('\n');
    expect(errors).toContain('raw palette utility');
    expect(errors).toContain('off-token colour #ff00aa');
  });
});
