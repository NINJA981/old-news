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
import { chromium, test as base } from '@playwright/test';

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
  url.startsWith('data:') ||
  url.startsWith('blob:') ||
  url.startsWith('about:') ||
  url.startsWith('chrome://');

function startServer(): Promise<{ server: Server; origin: string }> {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const name = (req.url ?? '/').split('?')[0]?.replace(/^\//, '') ?? '';
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
