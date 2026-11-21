// Runs every test/**/*.test.js file with the Node test runner and fails when no test ran.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function collect(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return collect(p);
    return e.name.endsWith('.test.js') ? [p] : [];
  });
}

const files = collect('test').sort();
if (files.length === 0) {
  console.error('No test files found: expected test/**/*.test.js. Refusing to pass with zero tests.');
  process.exit(1);
}

const run = spawnSync(process.execPath, ['--test', ...files], { encoding: 'utf8' });
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);

const count = (name) => Number((run.stdout.match(new RegExp(`^# ${name} (\\d+)`, 'm')) || [])[1] ?? NaN);
const total = count('tests');
const failed = count('fail');

if (run.status !== 0 || failed > 0) {
  console.error(`Tests failed (${Number.isNaN(failed) ? '?' : failed} failing).`);
  process.exit(1);
}
if (!(total > 0)) {
  console.error('The test runner reported 0 tests. Refusing to pass with zero tests.');
  process.exit(1);
}
console.log(`OK: ${total} test(s) passed.`);
