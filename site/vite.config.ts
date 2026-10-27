import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { parseCssColor, solveFade } from '../src/paint/contrastFloor.ts';
import { landingBody, type LandingContext } from './src/landing/page.ts';
import { appShell } from './src/app/shell.ts';

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SITE, '..');

/** Light paper tokens from DESIGN.md: --surface and --text. The hero sheets are paper in both bands. */
function paperAlpha(): { seen: number; similar: number } {
  const bg = parseCssColor('#fefdfc')!;
  const ink = parseCssColor('#1e1a16')!;
  return {
    seen: solveFade(ink, bg, 'seen').opacity,
    similar: solveFade(ink, bg, 'similar').opacity,
  };
}

/**
 * onnxruntime-web defaults its wasm location to `new URL('ort-wasm-*.wasm', import.meta.url)`, which
 * makes the bundler embed a 26.9 MB asyncify build that is never loaded. The web app points
 * transformers.js at /ort/ instead (same fix as the extension's wxt.config.ts).
 */
function noEmbeddedOrtWasm(): Plugin {
  return {
    name: 'old-news-site:no-embedded-ort-wasm',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('onnxruntime-web') || !code.includes('ort-wasm')) return null;
      const out = code.replace(
        /new URL\((["'])ort-wasm[^"']*\.wasm\1,\s*import\.meta\.url\)\.href/g,
        '""',
      );
      return out === code ? null : { code: out, map: null };
    },
  };
}

/** Renders the landing body into index.html at build time, so the hero is real server HTML. */
function landing(env: Record<string, string>): Plugin {
  let build = false;
  return {
    name: 'old-news-landing',
    configResolved(c) {
      build = c.command === 'build';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.path === '/app/index.html') {
          if (!build) return html.replace('<!--@shell-->', '');
          html = html.replace('<!--@shell-->', appShell());
          const csp =
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
            "font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";
          return html.replace(
            '<meta charset="utf-8" />',
            `<meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
          );
        }
        if (ctx.path !== '/index.html') return html;
        const read = (p: string): unknown => JSON.parse(readFileSync(join(SITE, p), 'utf8'));
        const context: LandingContext = {
          views: read('src/generated/views.json') as LandingContext['views'],
          measured: read('src/generated/measured.json') as LandingContext['measured'],
          alpha: paperAlpha(),
          shots: existsSync(join(SITE, 'src/generated/shots.json'))
            ? (read('src/generated/shots.json') as LandingContext['shots'])
            : undefined,
          repoUrl: env['VITE_REPO_URL'] ?? '',
          storeUrl: env['VITE_STORE_URL'] ?? '',
        };
        let out = html.replace('<!--@landing-->', landingBody(context));
        if (build) {
          // The landing needs nothing from other origins, and says so in code.
          const csp =
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
            "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
          out = out.replace(
            '<meta charset="utf-8" />',
            `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
          );
        }
        return out;
      },
    },
  };
}

/**
 * Inlines the landing page's CSS (about 28 KB raw, 7 KB gz) so first paint does not wait on a second
 * round trip. The landing CSP already allows inline styles. The web app keeps its stylesheets as files.
 */
function inlineLandingCss(): Plugin {
  return {
    name: 'old-news-landing:inline-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.path !== '/index.html' || !ctx.bundle) return html;
        const bundle = ctx.bundle;
        return html.replace(
          /<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"[^>]*>/g,
          (tag, file: string) => {
            const asset = bundle[file];
            if (!asset || asset.type !== 'asset') return tag;
            return `<style>${String(asset.source)}</style>`;
          },
        );
      },
    },
  };
}

interface ManifestChunk {
  file: string;
  css?: string[];
  assets?: string[];
  imports?: string[];
  dynamicImports?: string[];
  isEntry?: boolean;
  name?: string;
}

/** Writes the service worker for /app/: a precache list from the build manifest, nothing remote. */
function appServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'old-news-app-sw',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle: {
      order: 'post',
      handler() {
        const manifestPath = join(outDir, '.vite', 'manifest.json');
        if (!existsSync(manifestPath)) return;
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
          string,
          ManifestChunk
        >;
        const entry = Object.values(manifest).find((c) => c.isEntry && c.name === 'app');
        if (!entry) throw new Error('app entry missing from the Vite manifest');

        const files = new Set<string>();
        const seen = new Set<string>();
        const visit = (key: string): void => {
          if (seen.has(key)) return;
          seen.add(key);
          const c = manifest[key];
          if (!c) return;
          files.add(`/${c.file}`);
          for (const f of c.css ?? []) files.add(`/${f}`);
          for (const f of c.assets ?? []) files.add(`/${f}`);
          for (const i of c.imports ?? []) visit(i);
          // Dynamic chunks the app needs offline (sample data). The optional model loader is cached on use.
          for (const d of c.dynamicImports ?? []) {
            const dc = manifest[d];
            if (dc && !/transformers|onnx|ort-/i.test(`${d} ${dc.file}`)) visit(d);
          }
        };
        const entryKey = Object.keys(manifest).find((k) => manifest[k] === entry)!;
        visit(entryKey);

        for (const f of [
          '/app/',
          '/app/manifest.webmanifest',
          '/icon.svg',
          '/app-icons/icon-192.png',
          '/app-icons/icon-512.png',
          '/fonts/newsreader-opsz-normal.woff2',
          '/fonts/hanken-grotesk-wght-normal.woff2',
        ]) {
          files.add(f);
        }
        const list = [...files].sort();
        // Hashed assets are immutable, so the version only needs to change when the list does.
        const hash = createHash('sha256');
        for (const f of list) {
          hash.update(f);
          const p = join(outDir, f.endsWith('/') ? `${f}index.html` : f);
          if (!f.startsWith('/assets/') && existsSync(p)) hash.update(readFileSync(p));
        }
        const version = hash.digest('hex').slice(0, 12);
        const template = readFileSync(join(SITE, 'sw-src', 'sw.js'), 'utf8');
        const sw = template
          .replace('__VERSION__', JSON.stringify(version))
          .replace('__PRECACHE__', JSON.stringify(list));
        writeFileSync(join(outDir, 'app', 'sw.js'), sw);
        console.log(`app service worker: ${list.length} precached files, version ${version}`);
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, SITE, 'VITE_');
  return {
    root: SITE,
    plugins: [noEmbeddedOrtWasm(), react(), landing(env), inlineLandingCss(), appServiceWorker()],
    resolve: {
      alias: {
        '@engine': resolve(ROOT, 'src/core/index.ts'),
        '@adapters': resolve(ROOT, 'src/adapters'),
        '@extract': resolve(ROOT, 'src/extract'),
        // Pure placement and timing maths of the extension's overlay (no DOM): chip placement,
        // the dissolve schedule, the pill countdown ticks. Reused, never re-implemented here.
        '@overlay': resolve(ROOT, 'src/overlay'),
      },
    },
    server: {
      fs: { allow: [ROOT] },
      port: 5173,
    },
    preview: { port: 4391, strictPort: true },
    build: {
      target: 'es2022',
      manifest: true,
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        input: {
          main: resolve(SITE, 'index.html'),
          app: resolve(SITE, 'app/index.html'),
        },
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
