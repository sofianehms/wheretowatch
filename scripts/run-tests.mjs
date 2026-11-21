// Runs every test/**/*.test.js file with the Node test runner and fails when no test ran.
import { spawnSync } from 'node:child_process';
import { files } from './test-files.mjs';

if (files.length === 0) {
  console.error('No test files found: expected test/**/*.test.js. Refusing to pass with zero tests.');
  process.exit(1);
}

const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.error) {
  console.error(`Could not run tests: ${run.error.message}`);
  process.exit(1);
}

const count = (name) => Number((run.stdout.match(new RegExp(`^# ${name} (\\d+)`, 'm')) || [])[1] ?? NaN);
const total = count('tests');
const passed = count('pass');
const failed = count('fail');

if (run.status !== 0 || failed > 0) {
  console.error(`Tests failed (${Number.isNaN(failed) ? '?' : failed} failing).`);
  process.exit(1);
}
if (!(total > 0)) {
  console.error('The test runner reported 0 tests. Refusing to pass with zero tests.');
  process.exit(1);
}
if (!(passed > 0)) {
  console.error('The test runner reported 0 passing tests. At least one test must pass.');
  process.exit(1);
}
console.log(`OK: ${passed} test(s) passed.`);
