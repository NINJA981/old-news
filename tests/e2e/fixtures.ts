/**
 * Shared e2e fixtures: the built extension in a persistent Chromium context, a local fixture
 * server on 127.0.0.1, and a request recorder (SPEC AC17.4: nothing leaves the machine).
 */
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { chromium, expect, test as base } from '@playwright/test';
import type { PageTheme } from '../fixtures/story-page';
import { loadStoryArticle, renderInfinitePage, renderStoryPage } from '../fixtures/story-page';

export const EXTENSION_DIR = resolve(process.cwd(), '.output-e2e', 'chrome-mv3');
const LAYOUTS = resolve(process.cwd(), 'tests', 'fixtures', 'layouts');

export interface RecordedRequest {
  url: string;
  external: boolean;
}

interface Fixtures {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  siteUrl: string;
  requests: RecordedRequest[];
  /** Opens an extension page (popup.html, app.html, ...) in a tab. */
  openExtensionPage: (name: string) => Promise<Page>;
}

const isLocal = (url: string, siteOrigin: string): boolean =>
  url.startsWith('chrome-extension://') ||
  url.startsWith(siteOrigin) ||
  // Loopback never leaves the machine (other local servers a test starts, e.g. the web app's build).
  /^https?:\/\/127\.0\.0\.1(:|\/)/.test(url) ||
  url.startsWith('data:') ||
  url.startsWith('blob:') ||
  url.startsWith('about:') ||
  url.startsWith('chrome://');

function startServer(): Promise<{ server: Server; origin: string }> {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const name = url.pathname.replace(/^\//, '');
      // /story/<story>/<article>.html?theme=light|dark|tint renders an authored story article.
      const story = /^story\/([\w-]+)\/(\w+)\.html$/.exec(name);
      // /infinite/<storyA>/<a>/<storyB>/<b>.html: article A, then __loadNext() appends article B.
      const inf = /^infinite\/([\w-]+)\/(\w+)\/([\w-]+)\/(\w+)\.html$/.exec(name);
      if (inf) {
        const a = loadStoryArticle(inf[1] as string, inf[2] as string);
        const b = loadStoryArticle(inf[3] as string, inf[4] as string);
        if (!a || !b) return void res.writeHead(404).end('not found');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return void res.end(renderInfinitePage(a, b, 'light'));
      }
      if (story) {
        const article = loadStoryArticle(story[1] as string, story[2] as string);
        if (!article) return void res.writeHead(404).end('not found');
        const theme = (url.searchParams.get('theme') ?? 'light') as PageTheme;
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return void res.end(renderStoryPage(article, theme));
      }
      try {
        const body = readFileSync(join(LAYOUTS, name.replace(/[^a-zA-Z0-9_.-]/g, '')));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  siteUrl: async ({}, use) => {
    const { server, origin } = await startServer();
    await use(origin);
    server.close();
  },
  // eslint-disable-next-line no-empty-pattern
  requests: async ({}, use) => {
    await use([]);
  },
  context: async ({ siteUrl, requests }, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'old-news-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    context.on('request', (r) => {
      requests.push({ url: r.url(), external: !isLocal(r.url(), siteUrl) });
    });
    await use(context);
    await context.close();
    // AC17.4: nothing leaves the machine in ANY test, whether or not the test asserted it.
    const leaked = requests.filter((r) => r.external).map((r) => r.url);
    expect(leaked, 'requests that left the machine (AC17.4)').toEqual([]);
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  openExtensionPage: async ({ context, extensionId }, use) => {
    await use(async (name) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${name}`);
      return page;
    });
  },
});

export { expect } from '@playwright/test';
