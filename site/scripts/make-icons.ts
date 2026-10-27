/**
 * Renders the product glyph (three monoline strokes, the top two at 40% ink, the bottom one at full
 * ink; DESIGN.md "Iconography") into the favicon, PWA icons and the apple-touch icon.
 * Colours are DESIGN.md tokens: bg-dark #110e0b, text-dark #ece7df. Run `pnpm icons`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(SITE, 'public');
const BG = '#110e0b';
const INK = '#ece7df';

/** Glyph centred in a square of `size`, occupying `fraction` of it. */
function glyph(size: number, fraction: number, ink: string, bg: string | null, round = 0): string {
  const w = size * fraction;
  const x0 = (size - w) / 2;
  const gap = w * 0.3;
  const stroke = Math.max(2, w * 0.1);
  const y1 = size / 2 - gap;
  const y2 = size / 2;
  const y3 = size / 2 + gap;
  const line = (y: number, o: number): string =>
    `<path d="M${x0} ${y}H${x0 + w}" stroke="${ink}" stroke-width="${stroke}" stroke-linecap="round" opacity="${o}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    (bg ? `<rect width="${size}" height="${size}" rx="${round}" fill="${bg}"/>` : '') +
    line(y1, 0.4) +
    line(y2, 0.4) +
    line(y3, 1) +
    `</svg>`
  );
}

async function png(file: string, svg: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(file);
}

mkdirSync(join(PUBLIC, 'app-icons'), { recursive: true });
writeFileSync(join(PUBLIC, 'icon.svg'), glyph(64, 0.56, INK, BG, 14));
await png(join(PUBLIC, 'apple-touch-icon.png'), glyph(180, 0.52, INK, BG));
await png(join(PUBLIC, 'app-icons', 'icon-192.png'), glyph(192, 0.52, INK, BG, 36));
await png(join(PUBLIC, 'app-icons', 'icon-512.png'), glyph(512, 0.52, INK, BG, 96));
// Maskable: the glyph stays inside the central 80% safe zone and the background is full bleed.
await png(join(PUBLIC, 'app-icons', 'icon-maskable-512.png'), glyph(512, 0.4, INK, BG));
// Monochrome (themed icons on Android): glyph only, transparent background.
await png(join(PUBLIC, 'app-icons', 'icon-monochrome-512.png'), glyph(512, 0.4, '#000000', null));
console.log('icons written to public/');
