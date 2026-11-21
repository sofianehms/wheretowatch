import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const sw = readFileSync('sw.js', 'utf8');
const shellSrc = sw.match(/const SHELL = \[([^\]]*)\]/);
assert.ok(shellSrc, 'SHELL array not found in sw.js');
const SHELL = [...shellSrc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

const isLocal = (u) => !/^([a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(u);
const clean = (u) => posix.normalize(u.split(/[?#]/)[0]);
const inShell = (p) => SHELL.map((s) => (s === './' ? 'index.html' : posix.normalize(s))).includes(p);

function staticImports(file) {
  const src = readFileSync(file, 'utf8');
  const re = /(?:^|[;\s])(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  return [...src.matchAll(re)].map((m) => m[1]).filter((s) => s.startsWith('.'));
}

function reachable(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const spec of staticImports(entry)) {
    reachable(posix.normalize(join(dirname(entry), spec)), seen);
  }
  return seen;
}

test('every SHELL entry exists on disk', () => {
  for (const entry of SHELL) {
    const p = entry === './' ? 'index.html' : clean(entry);
    assert.ok(existsSync(p), `SHELL entry missing on disk: ${entry}`);
  }
});

test('every local resource of index.html is in SHELL', () => {
  const html = readFileSync('index.html', 'utf8');
  const refs = [...html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter(isLocal);
  assert.ok(refs.length > 0, 'no local resource found in index.html');
  for (const ref of refs) {
    assert.ok(inShell(clean(ref)), `not in SHELL: ${ref}`);
  }
});

test('modules reachable through static imports are in SHELL', () => {
  const html = readFileSync('index.html', 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*?\bsrc="([^"]+)"/g)].map((m) => clean(m[1])).filter((s) => isLocal(s));
  for (const s of scripts) {
    for (const mod of reachable(s)) {
      assert.ok(inShell(mod), `module not in SHELL: ${mod}`);
    }
  }
});

test('cache name follows shell-v<n>', () => {
  assert.match(sw, /const CACHE = 'shell-v\d+';/);
});
