/**
 * Runs the screenshot pass (tests/e2e/screenshots.spec.ts) and writes docs/screenshots/.
 *   pnpm screenshots
 */
import { spawnSync } from 'node:child_process';

const r = spawnSync('pnpm', ['exec', 'playwright', 'test', 'screenshots.spec.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, OLD_NEWS_SHOTS: '1' },
});
process.exit(r.status ?? 1);
