import { execSync } from 'node:child_process';

/** Builds the e2e variant of the extension (see wxt.config.ts OLD_NEWS_E2E). */
export default function globalSetup(): void {
  execSync('pnpm exec tsx scripts/copy-assets.ts && pnpm exec wxt build', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, OLD_NEWS_E2E: '1' },
  });
}
