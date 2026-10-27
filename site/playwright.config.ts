import { defineConfig } from '@playwright/test';

/**
 * E2E for the landing page and the web app, against the production build served by `vite preview`
 * (the service worker only exists in a build). Run `pnpm build` first, then `pnpm test:e2e`.
 *
 * Projects: `legacy` is the Stage 3b suite (it opens its own contexts); `phone` (375x812, touch)
 * and `desktop` (1440x900) run the same Stage 4 specs at both sizes: web app flows, axe on every
 * surface, PWA installability and the site smoke test.
 */
const STAGE4 = /\/(webapp|a11y|pwa|smoke|marks)\.spec\.ts$/;

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
  projects: [
    { name: 'legacy', testMatch: /\/site\.spec\.ts$/ },
    {
      name: 'phone',
      testMatch: STAGE4,
      use: {
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      },
    },
    { name: 'desktop', testMatch: STAGE4, use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'pnpm exec vite preview --port 4391 --strictPort',
    url: 'http://localhost:4391/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
