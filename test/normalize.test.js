import assert from 'node:assert/strict';
import test from 'node:test';
import { country, offerType, serviceKey } from '../src/core/normalize.js';

test('normalizes alpha-2 country code casing and surrounding whitespace', () => {
  for (const [raw, expected] of [['FR', 'fr'], ['uS', 'us'], ['jp', 'jp'], [' GB ', 'gb']]) {
    assert.equal(country(raw), expected);
  }
  for (const invalid of [undefined, null, 33, '', 'F', 'FRA', 'F1', 'ÉS']) {
    assert.equal(country(invalid), null);
  }
});

test('normalizes every TMDB offer type', () => {
  for (const [raw, expected] of Object.entries({
    flatrate: 'subscription', ads: 'free', free: 'free', rent: 'rent', buy: 'buy',
  })) {
    assert.equal(offerType('tmdb', raw), expected);
  }
});

test('normalizes every Streaming Availability offer type', () => {
  for (const [raw, expected] of Object.entries({
    subscription: 'subscription', free: 'free', rent: 'rent', buy: 'buy', addon: 'subscription',
  })) {
    assert.equal(offerType('sa', raw), expected);
  }
});

test('returns null for unsupported sources and offer types', () => {
  assert.equal(offerType('tmdb', 'subscription'), null);
  assert.equal(offerType('sa', 'flatrate'), null);
  assert.equal(offerType('sa', 'constructor'), null);
  assert.equal(offerType('tmdb', null), null);
  assert.equal(offerType('unknown', 'buy'), null);
});

test('resolves the registered service to the same key and name from both sources', () => {
  const expected = { key: 'netflix', name: 'Netflix' };
  assert.deepEqual(serviceKey('tmdb', 8, 'Netflix TMDB'), expected);
  assert.deepEqual(serviceKey('sa', 'netflix', 'Netflix SA'), expected);
});

test('namespaces unknown service IDs and preserves the original names', () => {
  assert.deepEqual(serviceKey('tmdb', 9902, 'Pebble Cinema'), {
    key: 'tmdb:9902', name: 'Pebble Cinema',
  });
  assert.deepEqual(serviceKey('sa', '9902', 'Pebble cinéma'), {
    key: 'sa:9902', name: 'Pebble cinéma',
  });
  assert.deepEqual(serviceKey('tmdb', 9902, 'Netflix'), {
    key: 'tmdb:9902', name: 'Netflix',
  });
});

test('returns null when a source or service ID cannot identify a service', () => {
  assert.equal(serviceKey('unknown', 8, 'Netflix'), null);
  assert.equal(serviceKey('tmdb', undefined, 'Netflix'), null);
  assert.equal(serviceKey('sa', '', 'Netflix'), null);
});
