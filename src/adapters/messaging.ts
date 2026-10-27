/**
 * Typed request helpers for extension pages and the content script. Every message goes to the
 * background, which validates it and routes engine messages to the engine host.
 */
import { browser } from 'wxt/browser';
import type { EngineReply } from '../host/handle';
import type { Message, PageStatus } from '../messaging/protocol';

/** Sends a message to the background and returns its payload; throws on a refusal. */
export async function request<T = null>(message: Message): Promise<T> {
  const reply = (await browser.runtime.sendMessage(message)) as EngineReply | undefined;
  if (!reply) throw new Error('Old News background did not answer.');
  if (!reply.ok) throw new Error(reply.error);
  return reply.data as T;
}

/** Per-tab status summaries, kept in chrome.storage.session so the popup paints instantly. */
const summaryKey = (tabId: number): string => `summary:${tabId}`;

export async function saveSummary(tabId: number, url: string, status: PageStatus): Promise<void> {
  await browser.storage.session.set({ [summaryKey(tabId)]: { url, status, at: Date.now() } });
}

export interface TabSummary {
  url: string;
  status: PageStatus;
  at: number;
}

export async function loadSummary(tabId: number): Promise<TabSummary | null> {
  const got = await browser.storage.session.get(summaryKey(tabId));
  return (got[summaryKey(tabId)] as TabSummary | undefined) ?? null;
}

export async function clearSummary(tabId: number): Promise<void> {
  await browser.storage.session.remove(summaryKey(tabId));
}

/** Clears every stored summary ("Forget everything"). */
export async function clearAllSummaries(): Promise<void> {
  const all = await browser.storage.session.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith('summary:'));
  if (keys.length > 0) await browser.storage.session.remove(keys);
}
