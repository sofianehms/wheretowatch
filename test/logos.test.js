import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { serviceLogoUrl } from '../src/core/images.js';
import { SERVICE_MAP, SHOW_SERVICE_LOGOS } from '../src/data/services.js';
import { offersAtHome } from '../src/render/all-services.js';
import { serviceLogo } from '../src/render/service-logo.js';
import { servicesState } from '../src/render/service-picker.js';

// The setting is passed explicitly where both values matter, so this file passes whichever one is built.
const configuration = { secure_base_url: 'https://image.tmdb.org/t/p/', logo_sizes: ['w92', 'w45', 'original'] };

test('no logo URL is produced when logos are turned off', () => {
  for (const current of [null, undefined, {}, configuration]) {
    assert.equal(serviceLogoUrl('/pebble-cinema.png', current, false), null);
  }
});

test('the logo URL uses the smallest size from the image host allowed by the application', () => {
  const url = 'https://image.tmdb.org/t/p/w45/pebble-cinema.png';
  assert.equal(serviceLogoUrl('/pebble-cinema.png', null, true), url);
  assert.equal(serviceLogoUrl('/pebble-cinema.png', configuration, true), url);
  assert.equal(serviceLogoUrl('/pebble-cinema.png', { ...configuration, logo_sizes: ['original', 'w154', 'w92'] }, true),
    'https://image.tmdb.org/t/p/w92/pebble-cinema.png');
  assert.equal(serviceLogoUrl('/pebble-cinema.png', { ...configuration, secure_base_url: 'https://images.example/t/p/' }, true), url);
});

test('a missing or unusable path gives no URL', () => {
  for (const path of [null, undefined, '', 'logo.png', 'https://images.example/logo.png', '/a/b.png', '/original.png']) {
    assert.equal(serviceLogoUrl(path, configuration, true), null, String(path));
  }
});

test('the rendered logo follows the build setting and carries the service name', (t) => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener() {},
    }),
  };
  t.after(() => { globalThis.document = previous; });
  assert.equal(serviceLogo({ name: 'Pebble Cinema' }, configuration), null);
  const image = serviceLogo({ name: 'Pebble Cinema', logoPath: '/pebble-cinema.png' }, configuration);
  if (!SHOW_SERVICE_LOGOS) {
    assert.equal(image, null);
    return;
  }
  assert.equal(image.attributes.alt, 'Pebble Cinema');
  assert.equal(image.src, 'https://image.tmdb.org/t/p/w45/pebble-cinema.png');
});

const offer = (source, serviceName, serviceLogoPath) => ({
  source, country: 'fr', serviceKey: source === 'tmdb' ? `tmdb:${serviceName.length}` : `sa:${serviceName}`,
  serviceName, serviceId: source === 'tmdb' ? serviceName.length : serviceName, serviceLogoPath, offerType: 'subscription',
});
const loaded = (logoPath) => ({
  snapshots: ['tmdb', 'sa'].map((source) => ({
    source, status: 'offers', fetchedAt: '2026-11-21T12:00:00Z',
    offers: [offer(source, 'Pebble Cinema', source === 'tmdb' ? logoPath : null)],
  })),
  coverage: { tmdb: { status: 'fresh', countries: ['fr'] }, sa: { status: 'fresh', countries: ['fr'] } },
});

for (const [name, logoPath] of [['with a logo', '/pebble-cinema.png'], ['without a logo', null]]) {
  test(`a service ${name} keeps its name in the picker and the all-services list`, () => {
    const { options, all } = servicesState(loaded(logoPath), 'all', 'FR');
    const [row] = offersAtHome(all.reconciledAll, all.offers, all.home)[0].services;
    for (const entry of [options.find((option) => option.name === 'Pebble Cinema'), row]) {
      assert.equal(entry.name, 'Pebble Cinema');
      assert.equal(entry.logoPath, logoPath ?? undefined);
    }
  });
}

const imageFile = /\.(?:apng|avif|bmp|gif|ico|jpe?g|png|svgz?|tiff?|webp)$/i;
const plain = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

test('no service image file is stored in the repository', () => {
  const ignored = new Set(['.git', '.verify', 'node_modules']);
  const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    if (entry.isDirectory()) return walk(`${directory}/${entry.name}`);
    return imageFile.test(entry.name) ? [`${directory}/${entry.name}`] : [];
  });
  const names = Object.values(SERVICE_MAP).flatMap(({ key, name, saServiceId }) => [key, name, saServiceId].map(plain));
  assert.ok(names.length > 0);
  assert.deepEqual(walk('.').filter((file) => names.some((name) => plain(file.replace(imageFile, '')).includes(name))), []);
});

test('only the URL builder reads the setting, so changing it is a one-line change', () => {
  const readers = readdirSync('src', { recursive: true })
    .filter((file) => file.endsWith('.js') && readFileSync(`src/${file}`, 'utf8').includes('SHOW_SERVICE_LOGOS'));
  assert.deepEqual(readers.sort(), ['core/images.js', 'data/services.js']);
});
