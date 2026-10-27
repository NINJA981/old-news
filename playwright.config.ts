import { defineConfig } from '@playwright/test';

/**
 * E2E runs the built extension in Chromium (`pnpm test:e2e`). global-setup builds the e2e variant
 * into .output-e2e (one extra host permission for the local fixture server, never released).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
});
