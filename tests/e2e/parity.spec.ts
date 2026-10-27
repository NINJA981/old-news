/**
 * Parity (Stage 4): the web app (site/, served from its production build) and the extension (the
 * built MV3 package, real model) run the SAME engine source, but with different embedders (the web
 * app uses build-time vectors for the bundled samples) and different front ends. This test reads
 * every bundled sample story, article by article in the authored reading order, through both, and
 * requires the same answer for every paragraph: tier, fingerprint, the outlet the tag names, and
 * the changed figures the chip shows. It is the guard against the two products drifting apart.
 *
 * The web app side is driven through its paste flow (the sample texts are in its vector table, so it
 * takes the precomputed-embedder path, exactly as the samples do). Needs `site/dist`
 * (`pnpm --dir site build`); global-setup builds it when it is missing.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { pageOf, paragraphsOf, send, story, type StoryArticle } from './helpers';

const SITE_DIST = resolve(process.cwd(), 'site', 'dist');
const STORIES = ['port-alder-fire', 'kessel-valley-rail', 'sleep-blogs'];

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function serveSite(): Promise<{ server: Server; origin: string }> {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      let file = normalize(join(SITE_DIST, pathname));
      if (!file.startsWith(SITE_DIST)) return void res.writeHead(403).end();
      if (pathname.endsWith('/')) file = join(file, 'index.html');
      if (!existsSync(file)) return void res.writeHead(404).end('not found');
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => {
      done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

/** What both products must agree on, per paragraph. */
interface Row {
  ordinal: number;
  tier: string;
  fingerprint: string;
  outlet: string;
  figures: string[];
}

interface ExtParagraph {
  ordinal: number;
  tier: string;
  fingerprint: string;
  provenance: { siteName: string } | null;
  drift: { before: string; after: string }[];
}

/** The chip shows at most two figures; the head of each is "{before} → {after}". */
const figureHead = (d: { before: string; after: string }): string =>
  `${d.before || 'not mentioned'} → ${d.after || 'not mentioned'}`;

async function extensionRows(
  ext: Page,
  a: StoryArticle,
): Promise<{ rows: Row[]; degraded: boolean }> {
  const r = await send<{ paragraphs: ExtParagraph[]; degraded: boolean }>(ext, {
    type: 'page/analyse',
    page: pageOf(a),
    paragraphs: paragraphsOf(a),
  });
  expect(r.ok, r.error).toBe(true);
  const read = await send(ext, {
    type: 'page/read',
    canonicalUrl: a.url,
    ordinals: a.paragraphs.map((_, i) => i),
  });
  expect(read.ok, read.error).toBe(true);
  const rows = [...r.data.paragraphs]
    .sort((x, y) => x.ordinal - y.ordinal)
    .map((p) => {
      const faded = p.tier === 'seen' || p.tier === 'similar';
      return {
        ordinal: p.ordinal,
        tier: p.tier,
        fingerprint: p.fingerprint,
        // The web app shows the outlet on faded and changed rows only.
        outlet: faded || p.tier === 'changed' ? (p.provenance?.siteName ?? '') : '',
        figures: p.drift.slice(0, 2).map(figureHead),
      };
    });
  return { rows, degraded: r.data.degraded };
}

async function webRows(web: Page): Promise<Row[]> {
  return web.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.reader .on-row, .on-row')].map((row) => ({
      ordinal: Number(row.dataset['ord']),
      // The web app labels engine-skipped paragraphs "skipped"; the extension reports them as new.
      tier: row.dataset['tier'] === 'skipped' ? 'new' : (row.dataset['tier'] ?? ''),
      fingerprint: row.dataset['fp'] ?? '',
      outlet: row.dataset['outlet'] ?? '',
      figures: [...row.querySelectorAll('.on-chips .on-chip b')].map((b) =>
        (b.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
    })),
  );
}

test.describe('web app and extension give the same answers (parity)', () => {
  test.beforeAll(() => {
    if (!existsSync(join(SITE_DIST, 'app', 'index.html'))) {
      throw new Error('site/dist is missing: run `pnpm --dir site build` first.');
    }
  });

  test('every paragraph of every bundled sample story: same tier, fingerprint, outlet and changed figures', async ({
    context,
    openExtensionPage,
  }) => {
    test.setTimeout(420_000);
    const { server, origin } = await serveSite();
    try {
      const ext = await openExtensionPage('app.html');
      const web = await context.newPage();
      await web.goto(`${origin}/app/`);

      const seen: Record<string, number> = {};
      let compared = 0;
      let first = true;
      let tabs = 0;

      for (const id of STORIES) {
        const s = story(id);
        for (const key of s.order) {
          const a = s.articles[key] as StoryArticle;
          const want = await extensionRows(ext, a);
          expect(want.degraded, `${id}/${key}: the extension ran with the real model`).toBe(false);

          if (!first) await web.getByRole('button', { name: 'Add article' }).first().click();
          await web.getByLabel('Paste an article').fill(a.paragraphs.join('\n\n'));
          await web.getByLabel('Source name (optional)').fill(a.siteName);
          await web.getByRole('button', { name: 'Add article' }).last().click();
          first = false;
          tabs++;
          await expect(
            web
              .getByRole('navigation', { name: 'Articles in this session' })
              .locator('.art-tab:not(.art-add)'),
          ).toHaveCount(tabs, { timeout: 60_000 });
          await expect(web.locator('.on-row')).toHaveCount(a.paragraphs.length, {
            timeout: 60_000,
          });

          const got = await webRows(web);
          expect(got, `${id}/${key}`).toEqual(want.rows);
          for (const r of got) seen[r.tier] = (seen[r.tier] ?? 0) + 1;
          compared += got.length;
        }
      }

      // The comparison is only worth something if it exercised every tier.
      expect(compared).toBeGreaterThan(40);
      for (const tier of ['new', 'seen', 'similar', 'changed']) {
        expect(seen[tier] ?? 0, `the sample stories include "${tier}" paragraphs`).toBeGreaterThan(
          0,
        );
      }
    } finally {
      server.close();
    }
  });
});
