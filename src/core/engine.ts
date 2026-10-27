/**
 * One-call assembly of the engine for any host: the Chrome offscreen document, the Firefox
 * background page, Node (corpus eval) and the phone-friendly web app in site/. The caller
 * supplies the only environment-specific parts: an embedder (or null) and a database name.
 */
import type { Embedder } from '../engine/embedder';
import { EngineHost } from '../host/engineHost';
import type { EngineReply } from '../host/handle';
import { handleEngineMessage } from '../host/handle';
import { isEngineMessage, parseMessage } from '../messaging/protocol';
import type { Db } from '../store/db';
import { DB_NAME, openOldNewsDb } from '../store/db';

export interface EngineOptions {
  /** IndexedDB database name (tests use a unique one per case). */
  dbName?: string;
  /** Already-open database; takes precedence over `dbName`. */
  db?: Db;
  embedder: Embedder | null;
  now?: () => number;
}

export interface Engine {
  host: EngineHost;
  db: Db;
  /** Validates an untrusted message and routes it to the host. Unknown messages are refused. */
  handle(raw: unknown): Promise<EngineReply>;
  close(): void;
}

export async function createEngine(opts: EngineOptions): Promise<Engine> {
  const db = opts.db ?? (await openOldNewsDb(opts.dbName ?? DB_NAME));
  const host = new EngineHost({ db, embedder: opts.embedder, now: opts.now });
  return {
    host,
    db,
    async handle(raw) {
      const msg = parseMessage(raw);
      if (!msg) return { ok: false, error: 'invalid message' };
      if (!isEngineMessage(msg)) return { ok: false, error: `not an engine message: ${msg.type}` };
      return handleEngineMessage(host, msg);
    },
    close() {
      db.close();
    },
  };
}
