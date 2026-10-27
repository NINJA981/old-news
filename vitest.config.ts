import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  define: { __OLD_NEWS_E2E__: false },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/fixture/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 20_000,
  },
});
