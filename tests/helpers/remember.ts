import type { Embedder } from '../../src/engine/embedder';
import { capFacts } from '../../src/engine/facts';
import { embedPrepared, prepareParagraph } from '../../src/engine/match';
import type { MemoryIndex } from '../../src/engine/memoryIndex';
import { entryFromRecord } from '../../src/engine/memoryIndex';
import type { ParagraphRecord } from '../../src/engine/types';
import { snippet } from '../../src/engine/normalize';

/** Builds paragraph records for texts as if they were read, and adds them to the index. */
export async function rememberPrepared(
  index: MemoryIndex,
  embedder: Embedder | null,
  articleId: string,
  texts: readonly string[],
  readAt = 1_000,
): Promise<ParagraphRecord[]> {
  const prepared = texts.map((text, ordinal) => prepareParagraph({ ordinal, text }));
  await embedPrepared(prepared, embedder);
  const records: ParagraphRecord[] = prepared
    .filter((p) => !p.skip)
    .map((p) => ({
      id: `${articleId}#${p.ordinal}`,
      articleId,
      ordinal: p.ordinal,
      snippet: snippet(p.text),
      minhash: p.minhash,
      bands: p.bands,
      vec: p.vec?.q ?? null,
      vecScale: p.vec?.scale ?? 0,
      facts: capFacts(p.facts),
      words: p.words,
      chars: p.chars,
      readAt,
      expiresAt: readAt + 30 * 86_400_000,
    }));
  for (const r of records) index.add(entryFromRecord(r));
  return records;
}
