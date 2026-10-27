/** Shared e2e helpers: messaging through an extension page, story fixtures, content-script setup. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Worker } from '@playwright/test';
import { expect } from './fixtures';

export interface Reply<T = unknown> {
  ok: boolean;
  data: T;
  error?: string;
}

export async function send<T>(page: Page, message: unknown): Promise<Reply<T>> {
  return page.evaluate((m) => chrome.runtime.sendMessage(m) as Promise<Reply<T>>, message);
}

export interface StoryArticle {
  url: string;
  siteName: string;
  title: string;
  paragraphs: string[];
  labels: { tier: string }[];
}

export function story(id: string): { order: string[]; articles: Record<string, StoryArticle> } {
  const raw = JSON.parse(
    readFileSync(
      join(process.cwd(), 'tests', 'fixtures', 'corpus', 'stories', `${id}.json`),
      'utf8',
    ),
  ) as { readingOrder: string[]; articles: Record<string, StoryArticle> };
  return { order: raw.readingOrder, articles: raw.articles };
}

export const pageOf = (a: StoryArticle) => ({
  url: a.url,
  canonicalUrl: a.url,
  siteName: a.siteName,
  title: a.title,
  kind: 'news',
});
export const paragraphsOf = (a: StoryArticle) =>
  a.paragraphs.map((text, ordinal) => ({ ordinal, text }));

/** Remembers the given articles of a story as already read (install-time ingest path). */
export async function remember(ext: Page, storyId: string, keys: string[]): Promise<void> {
  const s = story(storyId);
  for (const key of keys) {
    const a = s.articles[key] as StoryArticle;
    const r = await send(ext, {
      type: 'page/ingest',
      page: pageOf(a),
      paragraphs: paragraphsOf(a),
    });
    expect(r.ok, r.error).toBe(true);
  }
}

export async function registerContentScript(worker: Worker): Promise<void> {
  await worker.evaluate(() =>
    chrome.scripting.registerContentScripts([
      {
        id: 'e2e-content',
        js: ['content-scripts/content.js'],
        matches: ['http://127.0.0.1/*'],
        runAt: 'document_idle',
      },
    ]),
  );
}

export async function summaryFor(
  worker: Worker,
  urlPart: string,
): Promise<{ status: Record<string, unknown> } | null> {
  return worker.evaluate(async (part) => {
    const tabs = (await chrome.tabs.query({})).filter((t) => t.url?.includes(part));
    const id = tabs[0]?.id;
    if (id === undefined) return null;
    const got = await chrome.storage.session.get(`summary:${id}`);
    return (got[`summary:${id}`] as { status: Record<string, unknown> } | undefined) ?? null;
  }, urlPart);
}

export async function badgeFor(worker: Worker, urlPart: string): Promise<string | null> {
  return worker.evaluate(async (part) => {
    const tabs = (await chrome.tabs.query({})).filter((t) => t.url?.includes(part));
    const id = tabs[0]?.id;
    return id === undefined ? null : chrome.action.getBadgeText({ tabId: id });
  }, urlPart);
}

/** Waits until the overlay finished painting (the pill shows its result copy). */
export async function waitForOverlay(page: Page): Promise<void> {
  await expect(page.locator('.pill.on')).toBeVisible({
    timeout: 30_000,
  });
}
