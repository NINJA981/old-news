// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NETWORK_GLOBALS = [
  {
    name: 'fetch',
    message: 'Network access is banned. Only src/net/localAsset.ts may call fetch (SPEC §8).',
  },
  { name: 'XMLHttpRequest', message: 'Network access is banned (SPEC §8).' },
  { name: 'WebSocket', message: 'Network access is banned (SPEC §8).' },
  { name: 'EventSource', message: 'Network access is banned (SPEC §8).' },
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      '.output/',
      '.output-e2e/',
      '.wxt/',
      'public/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      'site/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.webextensions },
    },
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'fetch', message: 'Network access is banned (SPEC §8).' },
        { object: 'globalThis', property: 'fetch', message: 'Network access is banned (SPEC §8).' },
        { object: 'self', property: 'fetch', message: 'Network access is banned (SPEC §8).' },
        {
          object: 'navigator',
          property: 'sendBeacon',
          message: 'Network access is banned (SPEC §8).',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The one module allowed to call fetch; it asserts chrome-extension:// URLs.
    files: ['src/net/localAsset.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // Developer-time scripts (model download, reports) run in Node, never in the extension.
    files: ['scripts/**/*.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-console': 'off' },
  },
  {
    // The engine is pure: no DOM, no extension APIs, no model runtime, no storage (ADR §2).
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...NETWORK_GLOBALS,
        { name: 'chrome', message: 'src/engine is pure: no extension APIs.' },
        { name: 'browser', message: 'src/engine is pure: no extension APIs.' },
        { name: 'document', message: 'src/engine is pure: no DOM.' },
        { name: 'window', message: 'src/engine is pure: no DOM.' },
        { name: 'indexedDB', message: 'src/engine is pure: storage lives in src/store.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@huggingface/*',
                'idb',
                'wxt',
                'wxt/*',
                'react',
                'react-dom',
                '**/store/*',
                '**/embed/*',
                '**/extract/*',
                '**/paint/*',
              ],
              message: 'src/engine is pure (ADR §2).',
            },
          ],
        },
      ],
    },
  },
  {
    // The in-page bundle stays vanilla and small (ADR §4.1).
    files: ['entrypoints/content/**/*.ts', 'src/extract/**/*.ts', 'src/paint/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'react/*',
                'radix-ui',
                'motion',
                'motion/*',
                'tailwindcss',
                '@huggingface/*',
                'idb',
              ],
              message:
                'No React, Radix, Motion, Tailwind, model runtime or IndexedDB in the content script (ADR §4.1).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  prettier,
);
