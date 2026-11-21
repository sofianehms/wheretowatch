import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const sw = readFileSync('sw.js', 'utf8');
const shellSrc = sw.match(/const SHELL = \[([^\]]*)\]/);
assert.ok(shellSrc, 'SHELL array not found in sw.js');

export const scope = new URL('https://shell.example/');

export function requestUrl(reference, base) {
  const url = new URL(reference, base);
  url.hash = '';
  return url;
}

export function diskPath(url) {
  return url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
}

export const SHELL = new Set([...shellSrc[1].matchAll(/(['"])(.*?)\1/g)]
  .map((match) => requestUrl(match[2], scope).href));
