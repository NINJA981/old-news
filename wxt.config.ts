import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// Manifest decisions: docs/adr/0001-architecture.md §9 and SPEC.md §8.
// The e2e build adds one required host permission (the local fixture server) so tests can register the
// content script without a permission prompt. It is never part of a release build.
const E2E = process.env['OLD_NEWS_E2E'] === '1';

export default defineConfig({
  outDir: E2E ? '.output-e2e' : '.output',
  modules: ['@wxt-dev/module-react'],
  hooks: {
    // The content script is registered at runtime after the reader grants site access, so the
    // manifest must hold no required host permissions. WXT adds them from the script's matches.
    'build:manifestGenerated': (_wxt, manifest) => {
      if (E2E) manifest.host_permissions = ['http://127.0.0.1/*'];
      else delete manifest.host_permissions;
    },
  },
  vite: () => ({
    // The e2e build opens the overlay's shadow root so tests can read it; releases keep it closed.
    define: { __OLD_NEWS_E2E__: JSON.stringify(E2E) },
    plugins: [
      tailwindcss(),
      {
        // onnxruntime-web defaults its wasm location to `new URL('ort-wasm-*.wasm', import.meta.url)`,
        // which makes the bundler embed a 26.9 MB asyncify build that is never loaded. transformers.js
        // is pointed at the two builds in public/ort (src/embed/transformersEmbedder.ts), so the
        // default becomes an empty string and nothing is embedded.
        name: 'old-news:no-embedded-ort-wasm',
        enforce: 'pre',
        transform(code, id) {
          if (!id.includes('onnxruntime-web') || !code.includes('ort-wasm')) return null;
          const out = code.replace(
            /new URL\((["'])ort-wasm[^"']*\.wasm\1,\s*import\.meta\.url\)\.href/g,
            '""',
          );
          return out === code ? null : { code: out, map: null };
        },
      },
    ],
  }),
  manifest: ({ browser }) => ({
    name: 'Old News',
    description:
      "Fades the paragraphs you've already read, across sites, and lights up what changed. On-device, 0 network requests.",
    incognito: 'not_allowed',
    permissions: [
      'storage',
      'unlimitedStorage',
      'scripting',
      'tabs',
      'alarms',
      'activeTab',
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self'",
    },
    web_accessible_resources: [],
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+O' },
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'old-news@old-news.invalid',
              strict_min_version: '128.0',
              // Nothing is collected or transmitted (SPEC §8).
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {
          minimum_chrome_version: '120',
          // Cross-origin isolation lets the WASM backend use several threads (SharedArrayBuffer).
          // The engine page loads nothing cross-origin, so require-corp costs nothing.
          cross_origin_embedder_policy: { value: 'require-corp' },
          cross_origin_opener_policy: { value: 'same-origin' },
        }),
  }),
});
