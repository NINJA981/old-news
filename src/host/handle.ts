/** Routes validated engine messages to the EngineHost. Returns the response payload. */
import type { Message } from '../messaging/protocol';
import type { EngineHost } from './engineHost';

export type EngineReply = { ok: true; data: unknown } | { ok: false; error: string };

export async function handleEngineMessage(host: EngineHost, msg: Message): Promise<EngineReply> {
  try {
    switch (msg.type) {
      case 'page/analyse':
        return { ok: true, data: await host.analyse(msg.page, msg.paragraphs) };
      case 'page/ingest':
        return { ok: true, data: await host.ingest(msg.page, msg.paragraphs) };
      case 'page/read':
        return { ok: true, data: await host.markRead(msg.canonicalUrl, msg.ordinals) };
      case 'page/feedback':
        await host.addFeedback(msg.fingerprint, msg.oldParagraphId);
        return { ok: true, data: null };
      case 'memory/stats':
        return { ok: true, data: await host.stats() };
      case 'memory/wipe':
        return { ok: true, data: await host.wipe() };
      case 'memory/sweep':
        return { ok: true, data: await host.sweep() };
      case 'drift/list':
        return { ok: true, data: await host.listDrift(msg.storyId) };
      case 'stories/list':
        return { ok: true, data: await host.listStories() };
      case 'receipt/week':
        return { ok: true, data: await host.receipt() };
      default:
        return { ok: false, error: `not an engine message: ${msg.type}` };
    }
  } catch (err) {
    // Error messages never include paragraph text: engine errors come from storage or the model.
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
