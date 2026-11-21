import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const fixtures = new URL('./fixtures/', import.meta.url);
const sensitivePatterns = [
  [/\beyJ[\w.-]*/, 'JWT prefix'],
  [/[a-f0-9]{32}/i, '32-character hexadecimal sequence'],
  [/\bapi_key\b/i, 'API key field'],
];

for (const source of ['tmdb', 'sa']) {
  const directory = new URL(source + '/', fixtures);
  const files = readdirSync(directory).filter((file) => file.endsWith('.js')).sort();
  assert.ok(files.length > 0, `No fixtures found for ${source}`);

  for (const file of files) {
    test(`loads ${source}/${file} without credential-like content`, async () => {
      const url = new URL(file, directory);
      const content = readFileSync(url, 'utf8');
      for (const [pattern, label] of sensitivePatterns) {
        assert.ok(!pattern.test(content), `Fixture source contains a ${label}`);
      }

      const { default: data } = await import(url);
      assert.ok(data && typeof data === 'object', 'Expected a default response object');
      const payload = JSON.stringify(data);
      for (const [pattern, label] of sensitivePatterns) {
        assert.ok(!pattern.test(payload), `Fixture data contains a ${label}`);
      }
    });
  }
}

test('disagreement fixtures describe the same title in a country covered by both sources', async () => {
  const { default: tmdb } = await import('./fixtures/tmdb/disagreement.js');
  const { default: sa } = await import('./fixtures/sa/disagreement.js');
  const { default: countries } = await import('./fixtures/sa/countries.js');

  assert.equal(sa.tmdbId, `movie/${tmdb.id}`);
  assert.ok(countries.fr.services.some(({ id }) => id === 'netflix'));
  assert.ok(tmdb.results.FR.flatrate.some(({ provider_id }) => provider_id === 8));
  assert.ok(sa.streamingOptions.fr.every(({ service }) => service.id !== 'netflix'));
});

test('not-found fixtures describe a tracked title without any Netflix offer', async () => {
  const { default: tmdb } = await import('./fixtures/tmdb/not-found.js');
  const { default: sa } = await import('./fixtures/sa/not-found.js');

  assert.equal(sa.tmdbId, `movie/${tmdb.id}`);
  assert.ok(sa.title);
  const providers = Object.values(tmdb.results)
    .flatMap((country) => Object.values(country).filter(Array.isArray).flat());
  const options = Object.values(sa.streamingOptions).flat();
  assert.ok(providers.length > 0 && options.length > 0);
  assert.ok(providers.every(({ provider_id }) => provider_id !== 8));
  assert.ok(options.every(({ service }) => service.id !== 'netflix'));
});
