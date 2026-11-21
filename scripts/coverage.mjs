import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { files } from './test-files.mjs';

const threshold = 90;

function sourceFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.(?:[cm]?js)$/.test(entry.name) ? [path] : [];
  });
}

if (files.length === 0) {
  console.error('No test files found: expected test/**/*.test.js.');
  process.exit(1);
}

const run = spawnSync(process.execPath, [
  '--test', '--experimental-test-coverage',
  '--test-reporter=spec', '--test-reporter-destination=stderr',
  '--test-reporter=lcov', '--test-reporter-destination=stdout',
  ...files,
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 16 * 1024 * 1024 });

if (run.error || run.status !== 0) {
  console.error(run.error?.message ?? 'The coverage test run failed.');
  process.exit(1);
}
if (!run.stdout.startsWith('TN:')) {
  console.error('The test runner did not produce an LCOV report.');
  process.exit(1);
}

const coverage = new Map();
for (const record of run.stdout.split('end_of_record')) {
  const file = record.match(/^SF:(.+)$/m)?.[1];
  const found = record.match(/^LF:(\d+)$/m)?.[1];
  const hit = record.match(/^LH:(\d+)$/m)?.[1];
  if (file && found !== undefined && hit !== undefined) {
    coverage.set(resolve(file), { found: Number(found), hit: Number(hit) });
  }
}

for (const directory of ['src/core', 'src/api']) {
  const sources = sourceFiles(directory);
  if (sources.length === 0) {
    console.log(`${directory}: skipped (no JavaScript files)`);
    continue;
  }

  let found = 0;
  let hit = 0;
  for (const file of sources) {
    const counts = coverage.get(resolve(file));
    // The reporter omits modules that the tests never load.
    if (counts) {
      found += counts.found;
      hit += counts.hit;
    } else {
      const source = readFileSync(file, 'utf8');
      if (source) found += source.replace(/\r?\n$/, '').split(/\r?\n/).length;
    }
  }

  const rate = found === 0 ? 100 : (100 * hit) / found;
  console.log(`${directory}: ${rate.toFixed(2)}% line coverage (${hit}/${found}, minimum ${threshold}%)`);
  if (rate < threshold) process.exitCode = 1;
}
