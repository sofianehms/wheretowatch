import assert from 'node:assert/strict';
import test from 'node:test';
import { byKey, bySaId, byTmdbId, DEFAULT_SERVICE, SERVICE_MAP, SHOW_SERVICE_LOGOS } from '../src/data/services.js';
import tmdbServices from './fixtures/tmdb/movie-services.js';
import saCountries from './fixtures/sa/countries.js';

test('requires identifier provenance for every mapping', () => {
  assert.equal(DEFAULT_SERVICE, 'netflix');
  assert.equal(typeof SHOW_SERVICE_LOGOS, 'boolean');

  for (const [key, service] of Object.entries(SERVICE_MAP)) {
    assert.equal(service.key, key);
    assert.equal(typeof service.verifiedBy, 'string');
    assert.ok(service.verifiedBy.trim(), `Missing identifier provenance for ${key}`);
  }
});

test('finds the same entry by key and both provider identifiers', () => {
  const service = SERVICE_MAP[DEFAULT_SERVICE];
  const tmdb = tmdbServices.results.find(({ provider_name }) => provider_name === 'Netflix');
  const sa = saCountries.fr.services.find(({ name }) => name === 'Netflix');
  assert.equal(service.name, 'Netflix');
  assert.equal(service.tmdbProviderId, 8);
  assert.equal(service.saServiceId, 'netflix');
  assert.equal(byKey(DEFAULT_SERVICE), service);
  assert.equal(byTmdbId(tmdb.provider_id), service);
  assert.equal(bySaId(sa.id), service);
});

test('returns null for unknown keys and provider identifiers', () => {
  assert.equal(byKey('unlisted'), null);
  assert.equal(byKey('constructor'), null);
  assert.equal(byTmdbId(9902), null);
  assert.equal(byTmdbId('8'), null);
  assert.equal(bySaId('unlisted'), null);
});
