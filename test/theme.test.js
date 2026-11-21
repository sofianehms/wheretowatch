import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const boot = readFileSync('src/theme-boot.js', 'utf8');
const tokens = readFileSync('design/tokens.css', 'utf8');
const html = readFileSync('index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const manifest = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
const darkBg = tokens.match(/:root\s*\{[^}]*?--color-bg:\s*(#[0-9a-f]{6})/i)?.[1].toLowerCase();

test('theme-boot.js reads wtw.theme with the three values, in a try/catch, without import', () => {
  assert.match(boot, /wtw\.theme/);
  for (const value of ['dark', 'light', 'auto']) assert.match(boot, new RegExp(`'${value}'`));
  assert.match(boot, /try\s*\{[^]*localStorage[^]*\}\s*catch/);
  assert.match(boot, /--color-bg/);
  assert.doesNotMatch(boot, /^\s*(import|export)\b/m);
});

test('tokens.css declares dark on :root, light under data-theme, auto under prefers-color-scheme', () => {
  assert.ok(darkBg, 'dark --color-bg not found on :root');
  assert.match(tokens, /:root\s*\{\s*color-scheme:\s*dark;/);
  assert.match(tokens, /:root\[data-theme="light"\]\s*\{\s*color-scheme:\s*light;/);
  assert.match(tokens, /@media \(prefers-color-scheme: light\)\s*\{\s*:root\[data-theme="auto"\]\s*\{\s*color-scheme:\s*light;/);
});

test('index.html loads theme-boot.js synchronously after the stylesheets and before any module', () => {
  const bootAt = html.search(/<script\b[^>]*src="src\/theme-boot\.js"[^>]*>/);
  assert.ok(bootAt > 0, 'theme-boot.js not loaded');
  const tag = html.slice(bootAt, html.indexOf('>', bootAt));
  assert.doesNotMatch(tag, /\b(defer|async|type=)/);
  assert.ok(bootAt < html.indexOf('</head>'), 'theme-boot.js must be in <head>');
  assert.ok(bootAt > html.lastIndexOf('rel="stylesheet"'), 'theme-boot.js must follow the stylesheets');
  const moduleAt = html.search(/<script\b[^>]*type="module"/);
  assert.ok(moduleAt === -1 || bootAt < moduleAt);
  assert.equal(html.match(/<meta\s+name="theme-color"/g)?.length, 1);
});

test('manifest colors equal the dark --color-bg', () => {
  assert.equal(manifest.theme_color.toLowerCase(), darkBg);
  assert.equal(manifest.background_color.toLowerCase(), darkBg);
  assert.match(html, new RegExp(`<meta name="theme-color" content="${darkBg}">`, 'i'));
});
