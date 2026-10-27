/**
 * Real product screenshots for the landing page, taken from docs/screenshots/ (produced by the
 * extension's own `pnpm screenshots` run, Playwright against the built extension on the fixture
 * stories). This only crops and re-encodes them as WebP; nothing is drawn or retouched.
 * Output: public/shots/*.webp plus src/generated/shots.json (sizes, for width/height attributes).
 * Run `pnpm shots` after the screenshots are regenerated.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(SITE, '..', 'docs', 'screenshots');
const OUT = join(SITE, 'public', 'shots');

interface Shot {
  name: string;
  from: string;
  /** Crop box in source pixels; omitted = the whole image. */
  crop?: { left: number; top: number; width: number; height: number };
  alt: string;
}

const SHOTS: Shot[] = [
  {
    name: 'popup-dark',
    from: 'popup-mixed-dark.png',
    alt: 'The Old News toolbar popup on the third article about the bridge collapse: 4 of 23 paragraphs are new to you, with a tier bar of 3 new, 1 changed, 0 similar and 19 seen. Under What changed, the figure 12 became 14. Under Read earlier, Calder Courier. Requests sent: 0.',
  },
  {
    name: 'onboarding-tabs-dark',
    from: 'onboarding-tabs-dark-1440.png',
    crop: { left: 432, top: 36, width: 576, height: 532 },
    alt: 'Old News onboarding, step 2 of 3, Remember open tabs: two open article tabs, from Fenwick Wire and Calder Courier, are ticked, with the buttons Remember these 2 tabs and Skip.',
  },
];

mkdirSync(OUT, { recursive: true });
const meta: Record<string, { src: string; width: number; height: number; alt: string }> = {};
for (const s of SHOTS) {
  let img = sharp(join(SRC, s.from));
  if (s.crop) img = img.extract(s.crop);
  const file = `${s.name}.webp`;
  const info = await img.webp({ quality: 86, effort: 6 }).toFile(join(OUT, file));
  meta[s.name] = { src: `/shots/${file}`, width: info.width, height: info.height, alt: s.alt };
  console.log(`shots: ${file} ${info.width}x${info.height} ${(info.size / 1024).toFixed(1)} KB`);
}
writeFileSync(join(SITE, 'src', 'generated', 'shots.json'), JSON.stringify(meta, null, 1) + '\n');
