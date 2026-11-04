/**
 * Background (MV3 service worker on Chrome, event page on Firefox). Thin by design: it validates
 * messages, routes engine work to the engine host, keeps the badge and per-tab summaries, runs the
 * daily TTL sweep, and registers the content script once the reader has granted site access.
 * ADR-0001 §3. No user data is logged here.
 */
import { browser } from 'wxt/browser';
import { chromeSettingsStore } from '../src/adapters/chromeSettings';
import { startExtensionEngine } from '../src/adapters/extensionEngine';
import { clearAllSummaries, clearSummary, saveSummary } from '../src/adapters/messaging';
import type { Engine } from '../src/core/engine';
import { badgeFor } from '../src/core/page';
import type { EngineReply } from '../src/host/handle';
import type { Message } from '../src/messaging/protocol';
import {
  isContentMessage,
  isEngineMessage,
  parseEngineEnvelope,
  parseMessage,
} from '../src/messaging/protocol';
import { bytesToBase64, fetchLocalBytes } from '../src/net/localAsset';

const HOSTS = ['https://*/*', 'http://*/*'];
const SCRIPT_ID = 'old-news-content';
const SCRIPT_FILE = 'content-scripts/content.js';
const OFFSCREEN_URL = 'offscreen.html';
const IDLE_ALARM = 'engine-idle';
const SWEEP_ALARM = 'ttl-sweep';
const ENGINE_IDLE_MINUTES = 5;
const BADGE_BG = '#1d7779';
const BADGE_FG = '#f6fefe';

const FONT_FILES = {
  newsreader: 'overlay-newsreader.woff2',
  hanken: 'overlay-hanken.woff2',
} as const;

const ok = (data: unknown = null): EngineReply => ({ ok: true, data });
const fail = (error: string): EngineReply => ({ ok: false, error });

export default defineBackground(() => {
  let local: Promise<Engine> | null = null; // Firefox: the engine lives in this page

  // ---- Engine access -------------------------------------------------------------------------

  // Concurrent first requests (a page and the popup, say) must share one createDocument call:
  // Chrome allows a single offscreen document and rejects the second.
  let creating: Promise<void> | null = null;

  function ensureOffscreen(): Promise<void> {
    creating ??= (async () => {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      });
      if (contexts.length > 0) return;
      try {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_URL,
          reasons: [chrome.offscreen.Reason.WORKERS],
          justification: 'Runs the on-device matching engine and embedding model.',
        });
      } catch (err) {
        // Another context won the race; the document exists, which is all we need.
        if (!(err instanceof Error && /single offscreen document/i.test(err.message))) throw err;
      }
    })().finally(() => {
      creating = null;
    });
    return creating;
  }

  async function sendToOffscreen(message: Message): Promise<EngineReply> {
    // The document may still be starting: retry while its listener is not registered yet.
    let lastError: unknown;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const reply = (await browser.runtime.sendMessage({ target: 'engine', message })) as
          EngineReply | undefined;
        if (reply) return reply;
      } catch (err) {
        lastError = err;
      }
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
    return fail(lastError instanceof Error ? lastError.message : 'The engine did not answer.');
  }

  async function callEngine(message: Message): Promise<EngineReply> {
    if (import.meta.env.FIREFOX) {
      local ??= startExtensionEngine();
      return (await local).handle(message);
    }
    await ensureOffscreen();
    void browser.alarms.create(IDLE_ALARM, { delayInMinutes: ENGINE_IDLE_MINUTES });
    return sendToOffscreen(message);
  }

  async function closeEngineIfIdle(): Promise<void> {
    if (import.meta.env.FIREFOX) return;
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    if (contexts.length > 0) await chrome.offscreen.closeDocument();
  }

  // ---- Content script registration -----------------------------------------------------------

  async function syncContentScript(): Promise<void> {
    const granted = await browser.permissions.contains({ origins: HOSTS });
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (granted && existing.length === 0) {
      await browser.scripting.registerContentScripts([
        {
          id: SCRIPT_ID,
          js: [SCRIPT_FILE],
          matches: HOSTS,
          runAt: 'document_idle',
          persistAcrossSessions: true,
        },
      ]);
    } else if (!granted && existing.length > 0) {
      await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    }
  }

  // ---- Page status, badge, fonts, ingest -----------------------------------------------------

  async function onStatus(
    msg: Extract<Message, { type: 'page/status' }>,
    tabId: number | undefined,
  ) {
    if (tabId === undefined) return ok();
    // A full storage.session quota must not stop the badge.
    await saveSummary(tabId, msg.url, msg.status).catch(() => undefined);
    const text = badgeFor(msg.status);
    await browser.action.setBadgeText({ tabId, text });
    if (text) {
      await browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_BG });
      await browser.action.setBadgeTextColor?.({ tabId, color: BADGE_FG });
    }
    return ok();
  }

  async function font(family: keyof typeof FONT_FILES): Promise<EngineReply> {
    const url = browser.runtime.getURL(`/fonts/${FONT_FILES[family]}` as never);
    return ok(bytesToBase64(await fetchLocalBytes(url)));
  }

  async function inject(tabId: number): Promise<void> {
    await browser.scripting.executeScript({ target: { tabId }, files: [`/${SCRIPT_FILE}`] });
  }

  async function candidates(): Promise<EngineReply> {
    const tabs = await browser.tabs.query({ url: HOSTS, discarded: false });
    const found: unknown[] = [];
    for (const tab of tabs) {
      if (tab.id === undefined || tab.incognito) continue;
      try {
        await inject(tab.id);
        const probe = await browser.tabs.sendMessage(tab.id, { type: 'ingest/probe' });
        if (probe && typeof probe === 'object' && 'article' in probe && probe.article) {
          found.push({ tabId: tab.id, ...probe });
        }
      } catch {
        // Tabs we cannot reach (browser pages, no access) are simply not offered.
      }
    }
    return ok(found);
  }

  async function ingest(tabIds: readonly number[]): Promise<EngineReply> {
    const results: unknown[] = [];
    for (const tabId of tabIds) {
      try {
        await inject(tabId);
        results.push(await browser.tabs.sendMessage(tabId, { type: 'ingest/run' }));
      } catch {
        results.push({ remembered: 0 });
      }
    }
    return ok(results);
  }

  // ---- Router --------------------------------------------------------------------------------

  async function route(
    msg: Message,
    sender: { tab?: { id?: number }; url?: string },
  ): Promise<EngineReply> {
    const fromPage = !(sender.url ?? '').startsWith(browser.runtime.getURL('/'));
    if (fromPage && !isContentMessage(msg)) return fail('not allowed from a page');

    switch (msg.type) {
      case 'page/status':
        return onStatus(msg, sender.tab?.id);
      case 'font/get':
        return font(msg.family);
      case 'settings/changed':
        return ok();
      case 'app/open':
        await browser.tabs.create({ url: browser.runtime.getURL('/app.html') + msg.route });
        return ok();
      case 'ingest/candidates':
        return candidates();
      case 'ingest/tabs':
        return ingest(msg.tabIds);
      case 'ingest/probe':
      case 'ingest/run':
        return fail('addressed to a content script');
      case 'memory/wipe': {
        const reply = await callEngine(msg);
        await clearAllSummaries();
        return reply;
      }
      default:
        return isEngineMessage(msg) ? callEngine(msg) : fail('unknown message');
    }
  }

  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (parseEngineEnvelope(raw)) return undefined; // addressed to the engine host
    const msg = parseMessage(raw);
    if (!msg) return undefined;
    void route(msg, sender).then(sendResponse, (err: unknown) =>
      sendResponse(fail(err instanceof Error ? err.message : 'failed')),
    );
    return true;
  });

  // ---- Lifecycle -----------------------------------------------------------------------------

  // Alarms are not guaranteed to survive a browser restart (Firefox clears them), so the daily
  // sweep is re-created whenever the background starts and finds it missing.
  const ensureSweepAlarm = async (): Promise<void> => {
    if (!(await browser.alarms.get(SWEEP_ALARM))) {
      await browser.alarms.create(SWEEP_ALARM, { periodInMinutes: 24 * 60 });
    }
  };
  void ensureSweepAlarm();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    void ensureSweepAlarm();
    void syncContentScript();
    if (reason === 'install') {
      void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    }
  });

  browser.runtime.onStartup.addListener(() => {
    void ensureSweepAlarm();
    void syncContentScript();
    void callEngine({ type: 'memory/sweep' });
  });

  // A closed tab's status summary (which holds its URL) is dropped with it.
  browser.tabs.onRemoved.addListener((tabId) => void clearSummary(tabId).catch(() => undefined));

  browser.permissions.onAdded.addListener(() => void syncContentScript());
  browser.permissions.onRemoved.addListener(() => void syncContentScript());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SWEEP_ALARM) void callEngine({ type: 'memory/sweep' });
    if (alarm.name === IDLE_ALARM) void closeEngineIfIdle();
  });

  // Keep the settings cache warm so the first page load never waits on storage.
  void chromeSettingsStore().get();
});
