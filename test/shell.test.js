import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { diskPath, requestUrl, scope, SHELL, sw } from './shell-fixture.js';

const documentUrl = new URL('index.html', scope);
const html = readFileSync('index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const resources = [];
for (const [, tag, attributes] of html.matchAll(/<(link|script)\b((?:[^'">]|"[^"]*"|'[^']*')*)>/gi)) {
  const name = tag.toLowerCase() === 'link' ? 'href' : 'src';
  const attribute = [...attributes.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)]
    .find((match) => match[1].toLowerCase() === name);
  const reference = attribute?.[2] ?? attribute?.[3] ?? attribute?.[4];
  if (!reference) continue;
  const url = requestUrl(reference, documentUrl);
  if (url.origin === scope.origin) resources.push({ name, url });
}

function staticImports(file) {
  const src = readFileSync(file, 'utf8');
  const re = /(?:^|[;\s])(?:import|export)\b\s*(?:[^'"();]*?\s+from\s*)?(['"])([^'"]+)\1/g;
  return [...src.matchAll(re)].map((match) => match[2])
    .filter((specifier) => /^(?:\.\.?\/|\/|[a-z][a-z\d+.-]*:)/i.test(specifier));
}

function checkModule(url, seen) {
  if (seen.has(url.href)) return;
  seen.add(url.href);
  assert.ok(SHELL.has(url.href), `module not in SHELL: ${url.pathname.slice(1)}${url.search}`);
  for (const specifier of staticImports(diskPath(url))) {
    const dependency = requestUrl(specifier, url);
    if (dependency.origin === scope.origin) checkModule(dependency, seen);
  }
}

test('every SHELL entry exists on disk', () => {
  for (const entry of SHELL) {
    const url = new URL(entry);
    assert.equal(url.origin, scope.origin, `SHELL entry is not local: ${entry}`);
    assert.ok(existsSync(diskPath(url)), `SHELL entry missing on disk: ${entry}`);
  }
});

test('every local resource of index.html is in SHELL', () => {
  assert.ok(resources.length > 0, 'no local resource found in index.html');
  for (const { url } of resources) {
    assert.ok(SHELL.has(url.href), `not in SHELL: ${url.pathname.slice(1)}${url.search}`);
  }
});

test('modules reachable through static imports are in SHELL', () => {
  const seen = new Set();
  for (const { name, url } of resources) {
    if (name === 'src') checkModule(url, seen);
  }
});

test('cache name follows shell-v<n>', () => {
  assert.match(sw, /const CACHE = 'shell-v\d+';/);
});
