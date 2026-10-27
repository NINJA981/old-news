import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/fixture/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 20_000,
  },
});
