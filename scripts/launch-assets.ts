/**
 * Launch images (tests/e2e/launch.spec.ts) into docs/launch/, then the README GIF from the captured
 * playground frames. Needs ffmpeg on PATH for the GIF.
 *   pnpm launch-assets
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const run = (cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): number =>
  spawnSync(cmd, args, { stdio: 'inherit', shell: true, env }).status ?? 1;

const shots = run('pnpm', ['exec', 'playwright', 'test', 'launch.spec.ts', '--workers=1'], {
  ...process.env,
  OLD_NEWS_LAUNCH: '1',
});
if (shots !== 0) process.exit(shots);

// 37 frames at 50 ms (0 to 1800 ms), played at 20 fps, the last frame held 2.5 s, then loop.
// 960 px wide with a 96-colour palette keeps the file small enough for a README.
const frames = join('test-results', 'launch-frames', 'f%03d.png');
const out = join('docs', 'launch', 'dissolve.gif');
const filter =
  '[0:v]tpad=stop_mode=clone:stop_duration=2.5,scale=960:-1:flags=lanczos,split[a][b];' +
  '[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4';
process.exit(
  run('ffmpeg', [
    '-y',
    '-framerate',
    '20',
    '-i',
    `"${frames}"`,
    '-filter_complex',
    `"${filter}"`,
    '-loop',
    '0',
    `"${out}"`,
  ]),
);
