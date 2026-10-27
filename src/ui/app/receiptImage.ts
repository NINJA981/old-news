/**
 * Renders the weekly receipt to a PNG on a local canvas (SPEC F16, AC16.2). Nothing is uploaded:
 * the blob is handed to a download link. The card is always the light paper sheet, in every theme.
 */
import type { WeeklyReceipt } from '../../engine/receipt';
import { formatCount, receiptSentence } from '../../engine/present';

const W = 1200;
const H = 630;
const SCALE = 2;
// Paper-sheet tokens (DESIGN.md light palette).
const PAPER = '#fefdfc';
const INK = '#1e1a16';
const MUTED = '#5c5751';
const BORDER = '#dedad4';
const DRIFT = '#8d5406';
const SUBTLE = '#76706a';
const STRONG = '#847f78';
const TRACK = '#e6e2dd';
// Tier bar: the same order and fills as the app's TierBar (DESIGN.md "Tier bar").
const TIERS = [
  ['new', 'New', INK],
  ['changed', 'Changed', DRIFT],
  ['similar', 'Similar', SUBTLE],
  ['seen', 'Seen', STRONG],
] as const;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function receiptStats(r: WeeklyReceipt): { label: string; value: string }[] {
  return [
    { label: 'Words read', value: formatCount(r.words) },
    { label: 'Already read', value: `${r.knownPercent}%` },
    { label: 'Articles', value: formatCount(r.articles) },
    { label: 'Changed figures', value: formatCount(r.paragraphs.changed) },
  ];
}

export async function renderReceiptPng(r: WeeklyReceipt): Promise<Blob> {
  await Promise.all([
    document.fonts.load('500 44px "Newsreader Variable"'),
    document.fonts.load('600 28px "Hanken Grotesk Variable"'),
    document.fonts.load('450 18px "Hanken Grotesk Variable"'),
  ]).catch(() => undefined);
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a canvas.');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  const pad = 72;
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.font = '500 56px "Newsreader Variable", Georgia, serif';
  const lines = wrap(ctx, receiptSentence(r), W - pad * 2);
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + 56 + i * 64));

  // Tier bar of the week's paragraphs, 1 px gaps, radius 4 at the outer ends, then its legend.
  const barY = H - 300;
  const barW = W - pad * 2;
  const counts = r.paragraphs;
  const sum = counts.new + counts.changed + counts.similar + counts.seen;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(pad, barY, barW, 8, 4);
  ctx.clip();
  ctx.fillStyle = TRACK;
  ctx.fillRect(pad, barY, barW, 8);
  let bx = pad;
  for (const [key, , fill] of TIERS) {
    const n = counts[key];
    if (sum === 0 || n === 0) continue;
    const w = (n / sum) * barW;
    ctx.fillStyle = fill;
    ctx.fillRect(bx, barY, Math.max(0, w - 1), 8);
    bx += w;
  }
  ctx.restore();
  let lx = pad;
  ctx.font = '450 20px "Hanken Grotesk Variable", system-ui, sans-serif';
  for (const [key, label, fill] of TIERS) {
    ctx.fillStyle = fill;
    ctx.fillRect(lx, barY + 30, 8, 8);
    ctx.fillStyle = MUTED;
    ctx.fillText(label, lx + 16, barY + 40);
    lx += 16 + ctx.measureText(label).width + 8;
    ctx.fillStyle = INK;
    ctx.font = '600 20px "Hanken Grotesk Variable", system-ui, sans-serif';
    const v = String(counts[key]);
    ctx.fillText(v, lx, barY + 40);
    lx += ctx.measureText(v).width + 32;
    ctx.font = '450 20px "Hanken Grotesk Variable", system-ui, sans-serif';
  }

  const gridY = H - 200;
  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(pad, gridY - 24);
  ctx.lineTo(W - pad, gridY - 24);
  ctx.stroke();
  const stats = receiptStats(r);
  const colW = (W - pad * 2) / stats.length;
  stats.forEach((s, i) => {
    const x = pad + i * colW;
    ctx.fillStyle = MUTED;
    ctx.font = '450 20px "Hanken Grotesk Variable", system-ui, sans-serif';
    ctx.fillText(s.label, x, gridY + 12);
    ctx.fillStyle = s.label === 'Changed figures' ? DRIFT : INK;
    ctx.font = '600 44px "Hanken Grotesk Variable", system-ui, sans-serif';
    ctx.fillText(s.value, x, gridY + 64);
  });

  ctx.fillStyle = MUTED;
  ctx.font = '450 20px "Hanken Grotesk Variable", system-ui, sans-serif';
  ctx.fillText(
    `Old News, week ${r.week}. Counted on this computer from your own reading.`,
    pad,
    H - 48,
  );

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('The image could not be encoded.'))),
      'image/png',
    ),
  );
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
