import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { diskPath, SHELL } from './shell-fixture.js';

const budget = 50_000;
const imageExtension = /\.(?:apng|avif|bmp|gif|ico|jpe?g|png|svgz?|tiff?|webp)$/i;

test('package.json has no runtime dependencies field', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(!Object.hasOwn(manifest, 'dependencies'), 'Remove the dependencies field from package.json.');
});

test('the gzipped shell stays within the weight budget', (t) => {
  const files = new Set([...SHELL].map((entry) => diskPath(new URL(entry))));
  let bytes = 0;
  for (const file of files) {
    if (!imageExtension.test(file)) bytes += gzipSync(readFileSync(file)).length;
  }
  t.diagnostic(`Shell weight: ${bytes} / ${budget} bytes gzipped (excluding images).`);
  assert.ok(bytes <= budget, 'The gzipped shell exceeds the weight budget.');
});
