import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { createCache } from '../src/api/cache.js';
import { createQuota } from '../src/api/quota.js';
import { renderAbout, STORED_ITEMS } from '../src/render/about.js';
import { renderFooter } from '../src/render/attribution.js';
import { createSettings } from '../src/settings/keys.js';
import { THEME_KEY } from '../src/theme.js';
import { diskPath, requestUrl, scope, SHELL } from './shell-fixture.js';

// The few DOM operations the renderers use, enough to read back what a page says.
class Node {
  constructor(tag) {
    Object.assign(this, { tag, children: [], attributes: {}, className: '' });
  }
  set textContent(value) { this.children = [value]; }
  get textContent() { return this.children.map((child) => child.textContent ?? child).join(''); }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, listener) { this[`on${type}`] = listener; }
  all() { return [this, ...this.children.flatMap((child) => child.all?.() ?? [])]; }
}
globalThis.document = { createElement: (tag) => new Node(tag), createElementNS: (_, tag) => new Node(tag) };

function render(options = { onClear() {} }) {
  const slots = { header: new Node('div'), main: new Node('div'), footer: new Node('div') };
  renderAbout(slots, options);
  const nodes = Object.values(slots).flatMap((slot) => slot.all());
  return { nodes, text: (tag) => nodes.filter((node) => node.tag === tag).map((node) => node.textContent) };
}

function memoryStorage() {
  const entries = new Map();
  return {
    entries,
    get length() { return entries.size; },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (name) => entries.get(name) ?? null,
    setItem: (name, value) => void entries.set(name, String(value)),
    removeItem: (name) => void entries.delete(name),
  };
}

const listed = (name) => STORED_ITEMS.some((item) => (item.endsWith('*') ? name.startsWith(item.slice(0, -1)) : item === name));

test('the page carries the three attributions word for word, with the Movie of the Night link', () => {
  const { nodes, text } = render();
  const paragraphs = text('p');
  for (const notice of [
    'This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.',
    'Availability data: JustWatch',
    'Streaming availability information is provided by Streaming Availability API by Movie of the Night',
  ]) assert.ok(paragraphs.includes(notice), notice);
  assert.ok(nodes.some((node) => node.attributes.href === 'https://www.movieofthenight.com/about/api'));
});

test('the page has one h1 and the expected sections', () => {
  const { text } = render();
  assert.deepEqual(text('h1'), ['About and privacy']);
  assert.deepEqual(text('h2'), ['What this site does', 'Data sent and to whom', 'Stored on your device',
    'Editorial policy', 'Attributions', 'Trademarks', 'Publisher']);
});

test('the page states that there is no cookie and names every recipient', () => {
  const body = render().text('div').join(' ');
  assert.match(body, /No cookie, no tracking/);
  for (const recipient of ['api.themoviedb.org', 'image.tmdb.org', 'api.movieofthenight.com', 'GitHub', 'IP address']) {
    assert.ok(body.includes(recipient), recipient);
  }
});

test('every stored item is listed with a purpose', () => {
  const items = render().text('li');
  for (const name of STORED_ITEMS) {
    const item = items.find((line) => line.startsWith(`${name} `));
    assert.ok(item, `${name} is not listed`);
    assert.ok(!item.endsWith('undefined') && item.length > name.length + 1, `${name} has no description`);
  }
});

test('every name the settings, the cache and the quota write is listed', () => {
  const source = readFileSync('src/settings/keys.js', 'utf8');
  const names = (constant) => [...source.match(new RegExp(`const ${constant} = \\[([^\\]]*)\\]`))[1]
    .matchAll(/'([^']+)'/g)].map(([, name]) => name);
  const storage = memoryStorage();
  const settings = createSettings({ storage, navigatorLike: {} });
  for (const provider of names('providers')) settings.setKey(provider, 'value', { verified: false });
  for (const preference of names('preferences')) settings.setPref(preference, 'value');
  createCache({ storage }).set('movie/1', {}, { kind: 'metadata', source: 'tmdb' });
  createQuota({ storage }).record();

  const written = [...storage.entries.keys()];
  assert.ok(written.some((name) => name.startsWith('wtw.cache.')));
  assert.deepEqual(written.filter((name) => !listed(name)), []);
  assert.ok(listed(THEME_KEY));
  // Nothing listed that the code cannot write.
  assert.deepEqual(STORED_ITEMS.filter((item) => !written.some((name) => name === item || (item.endsWith('*') && name.startsWith(item.slice(0, -1))))), []);
});

test('every "wtw." name spelled out in the code is listed', () => {
  const files = readdirSync('src', { recursive: true })
    .filter((file) => file.endsWith('.js') && !file.startsWith('i18n'));
  const literals = files.flatMap((file) => [...readFileSync(`src/${file}`, 'utf8').matchAll(/['"`](wtw\.[\w.]+)/g)].map(([, name]) => name));
  assert.ok(literals.includes('wtw.quota'));
  // A name ending with a dot is a prefix: it must start at least one listed item.
  assert.deepEqual(literals.filter((name) => (name.endsWith('.')
    ? name !== 'wtw.' && !STORED_ITEMS.some((item) => item.startsWith(name))
    : !listed(name))), []);
});

test('"Clear my data" calls the handler', () => {
  let pressed = null;
  const { nodes } = render({ onClear: (button) => { pressed = button; } });
  const button = nodes.find((node) => node.tag === 'button');
  assert.equal(button.textContent, 'Clear my data');
  button.onclick();
  assert.equal(pressed, button);
  assert.match(readFileSync('src/about.js', 'utf8'), /settings\.clearAll\(\)/);
});

test('the footer links to the page', () => {
  const container = new Node('div');
  renderFooter(container);
  const link = container.all().find((node) => node.attributes.href === 'about.html');
  assert.equal(link.textContent, 'About and privacy');
});

test('the page, its modules and its stylesheets are in the offline shell', () => {
  const html = readFileSync('about.html', 'utf8');
  const references = [...html.matchAll(/<(?:link rel="(?:stylesheet|icon|manifest)"|script)[^>]*?\b(?:href|src)="([^"]+)"/g)].map(([, path]) => path);
  assert.ok(references.includes('src/about.js'));
  for (const path of ['about.html', 'src/render/about.js', 'src/i18n/en/about.js', ...references]) {
    assert.ok(SHELL.has(requestUrl(path, scope).href), `not in SHELL: ${diskPath(requestUrl(path, scope))}`);
  }
});
