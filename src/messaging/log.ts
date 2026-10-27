/**
 * Logging with redaction (ADR-0001 §7, §9). Paragraph text, snippets, titles and URLs never
 * reach a log line. Logging is off in production builds; tests construct a logger explicitly.
 */

const REDACT_KEYS = new Set([
  'text',
  'snippet',
  'title',
  'url',
  'canonicalUrl',
  'paragraphs',
  'before',
  'after',
  'context',
  'raw',
]);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    if (ArrayBuffer.isView(value)) return `[${value.constructor.name}]`;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.has(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export function createLogger(
  enabled: boolean,
  sink: Pick<Console, 'warn' | 'error'> = console,
): Logger {
  return {
    warn(msg, data) {
      if (enabled) sink.warn(`[old-news] ${msg}`, data === undefined ? '' : redact(data));
    },
    error(msg, data) {
      if (enabled) sink.error(`[old-news] ${msg}`, data === undefined ? '' : redact(data));
    },
  };
}

/** Enabled in development builds only. */
export const log = createLogger(import.meta.env?.DEV === true);
