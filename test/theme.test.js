import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_THEME, THEME_KEY, THEMES, applyTheme } from '../src/theme.js';

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
  assert.doesNotMatch(html, /<meta name="theme-color"[^>]*content=/i, 'theme-color is filled from --color-bg by the boot script');
});

test('theme-boot.js sets data-theme and fills theme-color from the computed --color-bg', () => {
  const run = (stored) => {
    const attrs = {};
    const meta = { setAttribute: (k, v) => { attrs.meta = v; } };
    const root = { setAttribute: (k, v) => { attrs[k] = v; } };
    const sandbox = {
      window: {},
      document: { documentElement: root, querySelector: () => meta },
      getComputedStyle: () => ({ getPropertyValue: () => ' sample-bg ' }),
      localStorage: { getItem: () => { if (stored === 'throw') throw new Error('denied'); return stored; } },
    };
    vm.runInNewContext(boot, sandbox);
    return attrs;
  };
  assert.deepEqual(run(null), { 'data-theme': 'dark', meta: 'sample-bg' });
  assert.equal(run('light')['data-theme'], 'light');
  assert.equal(run('auto')['data-theme'], 'auto');
  assert.equal(run('bogus')['data-theme'], 'dark');
  assert.equal(run('throw')['data-theme'], 'dark');
});

test('theme.js and theme-boot.js share the storage key, the values and the default', () => {
  assert.equal(THEME_KEY, 'wtw.theme');
  assert.match(boot, new RegExp(`'${THEME_KEY.replace('.', '\\.')}'`));
  assert.deepEqual(THEMES, ['dark', 'light', 'auto']);
  for (const value of THEMES) assert.match(boot, new RegExp(`'${value}'`));
  assert.equal(DEFAULT_THEME, 'dark');
  assert.match(boot, /var theme = 'dark'/);
});

function fakeDocument(bg) {
  const attrs = {};
  const meta = { content: null, setAttribute(k, v) { this.content = v; } };
  const listeners = new Set();
  const query = {
    addEventListener: (type, fn) => listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
  };
  const doc = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    querySelector: () => meta,
    defaultView: {
      getComputedStyle: () => ({ getPropertyValue: () => ` ${bg.value} ` }),
      matchMedia: () => query,
    },
  };
  return { doc, attrs, meta, listeners };
}

test('applyTheme sets data-theme, fills theme-color and rejects unknown values', () => {
  const bg = { value: 'sample-bg' };
  const { doc, attrs, meta } = fakeDocument(bg);
  applyTheme('light', doc);
  assert.equal(attrs['data-theme'], 'light');
  assert.equal(meta.content, 'sample-bg');
  applyTheme('bogus', doc);
  assert.equal(attrs['data-theme'], 'dark');
});

test('applyTheme follows the system only in Auto mode and stops when the theme changes', () => {
  const bg = { value: 'one' };
  const { doc, meta, listeners } = fakeDocument(bg);
  applyTheme('auto', doc);
  assert.equal(listeners.size, 1);
  bg.value = 'two';
  for (const fn of listeners) fn();
  assert.equal(meta.content, 'two');
  applyTheme('light', doc);
  assert.equal(listeners.size, 0);
  applyTheme('auto', doc);
  applyTheme('auto', doc);
  assert.equal(listeners.size, 1);
  applyTheme('dark', doc);
  assert.equal(listeners.size, 0);
});
