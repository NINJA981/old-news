import { describe, expect, it } from 'vitest';
import { explainTooShort, parsePasted } from '../../src/app/parse.ts';

const P = (n: number): string =>
  `Paragraph number ${n} is long enough for the engine to compare it with others, said officials.`;

describe('parsePasted', () => {
  it('splits on blank lines and takes a short headline as the title', () => {
    const r = parsePasted(
      `Warehouse fire closes harbour\n\n${P(1)}\n\n${P(2)}\n\n${P(3)}`,
      'Fenwick Wire',
    );
    expect(r.title).toBe('Warehouse fire closes harbour');
    expect(r.paragraphs).toHaveLength(3);
    expect(r.comparable).toBe(3);
    expect(r.siteName).toBe('Fenwick Wire');
  });

  it('does not mistake a first paragraph for a title', () => {
    const r = parsePasted(`${P(1)}\n\n${P(2)}`);
    expect(r.title).toBe('');
    expect(r.paragraphs).toHaveLength(2);
  });

  it('splits on single newlines when there are no blank lines', () => {
    const r = parsePasted(`${P(1)}\n${P(2)}\n${P(3)}`);
    expect(r.paragraphs).toHaveLength(3);
  });

  it('joins hard-wrapped lines inside one paragraph', () => {
    const r = parsePasted(`${P(1)}\nand it carried on onto a second line\n\n${P(2)}`);
    expect(r.paragraphs).toHaveLength(2);
    expect(r.paragraphs[0]).toContain('onto a second line');
  });

  it('reads a markdown heading as the title', () => {
    const r = parsePasted(`# Port Alder\n\n${P(1)}\n\n${P(2)}`);
    expect(r.title).toBe('Port Alder');
  });

  it('counts only paragraphs the engine will compare', () => {
    const r = parsePasted(`Short line.\n\n${P(1)}`);
    expect(r.paragraphs).toHaveLength(2);
    expect(r.comparable).toBe(1);
  });
});

describe('explainTooShort', () => {
  it('explains the rule in plain words and passes enough text', () => {
    expect(explainTooShort(parsePasted(P(1)))).toMatch(/at least 2/);
    expect(explainTooShort(parsePasted(`${P(1)}\n\n${P(2)}`))).toBeNull();
  });
});
