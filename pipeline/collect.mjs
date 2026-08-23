// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Download the IBTrACS basin files into pipeline/cache/. Idempotent: a file already present
// and plausibly sized is left alone unless FORCE=1, so re-running aggregate.mjs during
// development does not re-pull 113 MB.

import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, USER_AGENT } from './sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'pipeline', 'cache');

/** Anything smaller than this is a courtesy error page, not a basin file. */
const MIN_BYTES = 5_000_000;

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function fetchFile(file) {
  const target = join(CACHE, file.name);
  const existing = await sizeOf(target);
  if (existing >= MIN_BYTES && process.env.FORCE !== '1') {
    process.stdout.write(`  cached  ${file.name} (${existing.toLocaleString()} bytes)\n`);
    return target;
  }

  process.stdout.write(`  fetch   ${file.name} ...`);
  const response = await fetch(file.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${file.url} returned HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));

  const size = await sizeOf(target);
  // A truncated download parses perfectly and silently loses the most recent seasons, so the
  // size floor is a real gate, not a nicety.
  if (size < MIN_BYTES) {
    throw new Error(`${file.name} is only ${size} bytes — refusing a truncated basin file`);
  }
  process.stdout.write(` ${size.toLocaleString()} bytes\n`);
  return target;
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  process.stdout.write('IBTrACS v04r01 (NOAA NCEI)\n');
  for (const file of SOURCES.ibtracs.files) await fetchFile(file);
  process.stdout.write('collect: done\n');
}

main().catch((error) => {
  process.stderr.write(`collect failed: ${error.message}\n`);
  process.exit(1);
});
