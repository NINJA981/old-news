import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Newest modification time under `dir` (0 when it does not exist). */
function newest(dir: string): number {
  if (!existsSync(dir)) return 0;
  let t = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    t = Math.max(t, entry.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

/**
 * Builds the e2e variant of the extension (see wxt.config.ts OLD_NEWS_E2E), and the web app's
 * production build when it is missing or older than the engine or the site source (the parity test
 * serves site/dist next to the extension, so a stale build would compare against old engine code).
 */
export default function globalSetup(): void {
  const root = process.cwd();
  execSync('pnpm exec tsx scripts/copy-assets.ts && pnpm exec wxt build', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, OLD_NEWS_E2E: '1' },
  });
  const built = join(root, 'site', 'dist', 'app', 'index.html');
  const sources = Math.max(newest(join(root, 'src')), newest(join(root, 'site', 'src')));
  if (!existsSync(built) || statSync(built).mtimeMs < sources) {
    execSync('pnpm build', { cwd: join(root, 'site'), stdio: 'inherit' });
  }
}
