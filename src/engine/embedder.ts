/** Embedding dimension of all-MiniLM-L6-v2. */
export const EMBED_DIM = 384;

/**
 * Sentence embedder. Implementations return one L2-normalised vector per input text.
 * The engine never imports transformers.js; the host injects an Embedder (src/embed/).
 */
export interface Embedder {
  readonly id: string;
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}
