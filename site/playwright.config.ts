import { defineConfig } from '@playwright/test';

/**
 * E2E for the landing page and the web app, against the production build served by `vite preview`
 * (the service worker only exists in a build). Run `pnpm build` first, then `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { baseURL: 'http://localhost:4391' },
  webServer: {
    command: 'pnpm exec vite preview --port 4391 --strictPort',
    url: 'http://localhost:4391/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
