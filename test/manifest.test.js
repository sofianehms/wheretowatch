import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
const html = readFileSync('index.html', 'utf8').replace(/<!--[^]*?-->/g, '');
const links = [...html.matchAll(/<link\b([^>]+)>/gi)].map(([, attributes]) =>
  Object.fromEntries([...attributes.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g)]
    .map(([, name, doubleQuoted, singleQuoted, unquoted]) =>
      [name.toLowerCase(), doubleQuoted ?? singleQuoted ?? unquoted])));
const shellSource = readFileSync('sw.js', 'utf8').match(/const SHELL = \[([^\]]*)\]/);
assert.ok(shellSource, 'SHELL array not found in sw.js');
const shell = new Set([...shellSource[1].matchAll(/(['"])(.*?)\1/g)].map(([, , path]) => path));

function checkIcon(path, sizes) {
  const file = readFileSync(path);
  assert.ok(shell.has(path), `Icon missing from SHELL: ${path}`);
  if (!path.endsWith('.png')) return;

  assert.deepEqual(file.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `Invalid PNG: ${path}`);
  assert.ok(file.length >= 33, `Incomplete PNG header: ${path}`);
  assert.equal(file.toString('ascii', 12, 16), 'IHDR', `Missing IHDR: ${path}`);
  assert.equal(`${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`, sizes, `Wrong PNG dimensions: ${path}`);
}

test('manifest declares the SVG and all required Android PNG icons', () => {
  for (const [src, sizes, type, purpose] of [
    ['icon.svg', 'any', 'image/svg+xml', 'any'],
    ['icons/icon-192.png', '192x192', 'image/png', 'any'],
    ['icons/icon-512.png', '512x512', 'image/png', 'any'],
    ['icons/icon-maskable-512.png', '512x512', 'image/png', 'maskable'],
  ]) {
    const icon = manifest.icons.find((entry) => entry.src === src);
    assert.ok(icon, `Icon missing from manifest: ${src}`);
    assert.deepEqual({ sizes: icon.sizes, type: icon.type, purpose: icon.purpose }, { sizes, type, purpose }, src);
  }
  for (const { src, sizes } of manifest.icons) checkIcon(src, sizes);
});

test('index.html links the manifest, SVG favicon and 180x180 Apple touch icon', () => {
  assert.ok(links.some((link) => link.rel === 'manifest' && link.href === 'manifest.webmanifest'));
  assert.ok(links.some((link) => link.rel === 'icon' && link.href === 'icon.svg'));
  const touchIcons = links.filter((link) => link.rel === 'apple-touch-icon');
  assert.deepEqual(touchIcons.map(({ href, sizes }) => [href, sizes]), [['icons/apple-touch-icon.png', '180x180']]);

  for (const link of links) {
    if (link.rel?.split(/\s+/).some((rel) => rel === 'icon' || rel.startsWith('apple-touch-icon'))) {
      checkIcon(link.href, link.sizes);
    }
  }
});
