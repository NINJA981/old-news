/**
 * Package size report and budget gate (SPEC §5.3, ADR §3 budgets).
 *
 *   pnpm size            report .output/chrome-mv3 (run `pnpm zip` first for the packed size)
 *   pnpm size --record   write the report as the new baseline (scripts/size-baseline.json)
 *   pnpm size --check    fail if packed size grew > 5% over the baseline, or a budget is exceeded
 *
 * The README states the same numbers; update it whenever the baseline changes.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.output', 'chrome-mv3');
const BASELINE = join(ROOT, 'scripts', 'size-baseline.json');

/**
 * ADR §3 budgets, in gzipped bytes. The ADR's 15 KB sub-budget for the content bootstrap cannot hold
 * with Readability bundled inline (Readability is ~14 KB gz minified), so the gate is the ADR's 45 KB
 * total for the whole content bundle (bootstrap + Readability + overlay). See HANDOFF.md.
 */
const BUDGETS = { contentTotalGz: 45 * 1024, popupJsGz: 120 * 1024 };

interface Report {
  measuredAt: string;
  unpackedBytes: number;
  packedBytes: number | null;
  parts: Record<string, number>;
  contentScriptGzBytes: number;
  popupJsGzBytes: number;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function part(rel: string): string {
  if (rel.startsWith('models/') && rel.endsWith('.onnx')) return 'model (int8 MiniLM)';
  if (rel.startsWith('models/')) return 'tokenizer and config';
  if (rel.startsWith('ort/') && rel.endsWith('.wasm')) return 'ONNX Runtime wasm (base + JSPI)';
  if (rel.startsWith('ort/')) return 'ONNX Runtime loaders';
  if (rel.startsWith('fonts/')) return 'fonts (latin subsets)';
  if (rel.startsWith('content-scripts/')) return 'content script';
  if (extname(rel) === '.js') return 'extension JS';
  if (extname(rel) === '.css') return 'CSS';
  return 'html, manifest, other';
}

const gz = (path: string): number => gzipSync(readFileSync(path)).length;
const mb = (n: number): string => `${(n / 1_000_000).toFixed(2)} MB`;

export function measure(): Report {
  if (!existsSync(OUT)) throw new Error('No build found. Run `pnpm build` first.');
  const files = walk(OUT);
  const parts: Record<string, number> = {};
  let unpacked = 0;
  for (const f of files) {
    const size = statSync(f).size;
    unpacked += size;
    const key = part(relative(OUT, f).replaceAll('\\', '/'));
    parts[key] = (parts[key] ?? 0) + size;
  }
  const zip = readdirSync(join(ROOT, '.output')).find((n) => n.endsWith('-chrome.zip'));
  const content = join(OUT, 'content-scripts', 'content.js');
  const popupJs = files
    .filter((f) => /[\\/](chunks[\\/](popup|Button|hooks)-|popup)/.test(f) && f.endsWith('.js'))
    .reduce((a, f) => a + gz(f), 0);
  return {
    measuredAt: new Date().toISOString(),
    unpackedBytes: unpacked,
    packedBytes: zip ? statSync(join(ROOT, '.output', zip)).size : null,
    parts,
    contentScriptGzBytes: existsSync(content) ? gz(content) : 0,
    popupJsGzBytes: popupJs,
  };
}

function print(r: Report): void {
  console.log(
    `Unpacked: ${mb(r.unpackedBytes)}   Packed (zip): ${r.packedBytes ? mb(r.packedBytes) : 'run `pnpm zip`'}`,
  );
  for (const [k, v] of Object.entries(r.parts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(34)} ${mb(v)}`);
  }
  console.log(
    `Content script: ${(r.contentScriptGzBytes / 1024).toFixed(1)} KB gz (budget ${BUDGETS.contentTotalGz / 1024} KB for the whole content bundle)`,
  );
  console.log(
    `Popup JS:       ${(r.popupJsGzBytes / 1024).toFixed(1)} KB gz (budget ${BUDGETS.popupJsGz / 1024} KB)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = measure();
  print(report);
  if (process.argv.includes('--record')) {
    writeFileSync(BASELINE, `${JSON.stringify(report, null, 2)}\n`);
    console.log('Baseline recorded in scripts/size-baseline.json');
  }
  if (process.argv.includes('--check')) {
    const problems: string[] = [];
    if (report.contentScriptGzBytes > BUDGETS.contentTotalGz) {
      problems.push(
        `content script ${report.contentScriptGzBytes} B gz exceeds ${BUDGETS.contentTotalGz} B`,
      );
    }
    if (report.popupJsGzBytes > BUDGETS.popupJsGz) {
      problems.push(`popup JS ${report.popupJsGzBytes} B gz exceeds ${BUDGETS.popupJsGz} B`);
    }
    if (existsSync(BASELINE) && report.packedBytes !== null) {
      const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Report;
      if (base.packedBytes && report.packedBytes > base.packedBytes * 1.05) {
        problems.push(
          `packed size ${mb(report.packedBytes)} is > 5% over the baseline ${mb(base.packedBytes)}`,
        );
      }
    }
    if (problems.length > 0) {
      console.error(problems.map((p) => `  ${p}`).join('\n'));
      process.exitCode = 1;
    } else {
      console.log('size: within budget');
    }
  }
}
