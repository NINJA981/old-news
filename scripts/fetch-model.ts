/**
 * Developer-time model download (ADR-0001 §1). This is the ONLY network access in the project and
 * it runs in a developer's or CI's build, never in the shipped extension.
 *
 *   pnpm fetch-model            download (if missing) and verify every file against the manifest
 *   pnpm fetch-model --record   (re)write the manifest from what was downloaded (maintainers only)
 *
 * Files land in public/models/Xenova/all-MiniLM-L6-v2/ (gitignored). Each file is pinned to a
 * HuggingFace revision and a SHA-256 in scripts/model-manifest.json; a mismatch fails the build.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];
const MANIFEST = join(ROOT, 'scripts', 'model-manifest.json');
const OUT = join(ROOT, 'public', 'models', ...MODEL_ID.split('/'));

interface Manifest {
  model: string;
  revision: string;
  license: string;
  files: Record<string, { sha256: string; bytes: number }>;
}

const sha256 = (buf: Uint8Array): string => createHash('sha256').update(buf).digest('hex');

async function readManifest(): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(MANIFEST, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

async function download(file: string): Promise<Uint8Array> {
  const url = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/${file}`;
  console.log(`  downloading ${file}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${file}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main(): Promise<void> {
  const record = process.argv.includes('--record');
  const manifest = await readManifest();
  const next: Manifest = {
    model: MODEL_ID,
    revision: REVISION,
    license: 'Apache-2.0',
    files: {},
  };
  let failed = false;

  for (const file of FILES) {
    const dest = join(OUT, file);
    let bytes: Uint8Array;
    if (existsSync(dest) && !record) {
      bytes = new Uint8Array(await readFile(dest));
    } else {
      bytes = await download(file);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, bytes);
    }
    const digest = sha256(bytes);
    next.files[file] = { sha256: digest, bytes: bytes.length };
    const pinned = manifest?.files[file];
    if (record) continue;
    if (!pinned) {
      console.error(`  ${file}: no pinned SHA-256 in the manifest (run with --record to add it)`);
      failed = true;
    } else if (pinned.sha256 !== digest) {
      console.error(
        `  ${file}: SHA-256 mismatch\n    pinned ${pinned.sha256}\n    actual ${digest}`,
      );
      failed = true;
    } else {
      console.log(`  ${file}: ok (${bytes.length} bytes)`);
    }
  }

  if (record) {
    await writeFile(MANIFEST, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Recorded ${FILES.length} files in scripts/model-manifest.json`);
    return;
  }
  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log('Model files verified.');
}

await main();
