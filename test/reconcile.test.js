import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcile, reconcileAll } from '../src/core/reconcile.js';
import {
  disagreement, divergingTypes, outsideSaCoverage, saAbsent, saNotRecognized,
} from './fixtures/reconcile/scenarios.js';

function netflix(input) {
  return reconcile({ ...input, serviceKey: 'netflix' });
}

test('confirmed counts a country once when both sources report the service', () => {
  const [tmdb, sa] = divergingTypes.snapshots;
  const result = netflix({
    ...divergingTypes,
    snapshots: [tmdb, { ...sa, offers: [tmdb.offers[0], tmdb.offers[0]].map((offer) => ({ ...offer, source: 'sa' })) }],
  });
  assert.equal(result.confirmedCount, 1);
  assert.equal(result.countries.length, 1);
  assert.equal(result.countries[0].state, 'confirmed');
  assert.equal(result.countries[0].offers.sa.length, 2);
  assert.deepEqual(result.countries[0].types.sa, ['subscription']);
});

test('diverging types retain each source’s offers, types and snapshot dates', () => {
  const [tmdb, sa] = divergingTypes.snapshots;
  const { countries, confirmedCount } = netflix(divergingTypes);
  assert.equal(confirmedCount, 1);
  assert.deepEqual(countries, [{
    country: 'fr',
    state: 'confirmed',
    offers: { tmdb: [tmdb.offers[0]], sa: sa.offers },
    types: { tmdb: ['subscription'], sa: ['rent'] },
    fetchedAt: { tmdb: tmdb.fetchedAt, sa: sa.fetchedAt },
  }]);
});

test('conflict keeps one-sided availability when the other source recognizes the title and covers the country', () => {
  const result = netflix(disagreement);
  assert.equal(result.confirmedCount, 0);
  assert.deepEqual(result.countries.map(({ country, state }) => [country, state]), [
    ['fr', 'conflict'], ['de', 'single'],
  ]);
  assert.deepEqual(result.countries[0].offers.sa, []);

  const [tmdb, sa] = disagreement.snapshots;
  const empty = netflix({ ...disagreement, snapshots: [{ ...tmdb, status: 'empty', offers: [] }, sa],
    coverage: { ...disagreement.coverage, tmdb: { status: 'fresh', countries: ['de'] } } });
  assert.equal(empty.countries[0].state, 'conflict');
});

test('outsideSaCoverage uses a known SA list for TMDB-only offers', () => {
  const result = netflix(outsideSaCoverage);
  assert.equal(result.countries[0].state, 'outsideSaCoverage');
  assert.deepEqual(result.coveredCountries, new Set(['fr', 'ca', 'de']));
});

test('single identifies TMDB when SA is absent, unavailable or does not recognize the title', () => {
  const [tmdb, sa] = saNotRecognized.snapshots;
  const unavailable = { ...saNotRecognized, snapshots: [tmdb, { ...sa, status: 'unavailable' }] };
  for (const input of [saAbsent, saNotRecognized, unavailable]) {
    const result = netflix(input);
    assert.equal(result.countries[0].state, 'single');
    assert.deepEqual(result.countries[0].offers, { tmdb: [tmdb.offers[0]], sa: [] });
    assert.equal(result.confirmedCount, 0);
    assert.deepEqual(result.coveredCountries, new Set(['fr', 'ca']));
  }
  assert.equal(netflix(saAbsent).countries[0].fetchedAt.sa, null);
});

test('covered countries are deduplicated and change with the lists', () => {
  const original = netflix(disagreement);
  const changed = netflix({
    ...disagreement,
    coverage: { ...disagreement.coverage, tmdb: { status: 'fresh', countries: ['FR', 'ca', ' jp ', 'invalid'] } },
  });
  assert.deepEqual(original.coveredCountries, new Set(['fr', 'ca', 'de']));
  assert.deepEqual(changed.coveredCountries, new Set(['fr', 'ca', 'jp', 'de']));
  assert.equal(changed.coveredCountries.size, original.coveredCountries.size + 1);
});

test('unknown coverage contributes to neither country counts nor service groups', () => {
  const input = {
    ...divergingTypes,
    coverage: { ...divergingTypes.coverage, sa: { status: 'unknown', countries: ['fr', 'de'] } },
  };
  const result = netflix(input);
  assert.equal(result.confirmedCount, 0);
  assert.deepEqual(result.coveredCountries, new Set(['fr', 'ca']));
  assert.equal(result.countries[0].state, 'single');
  assert.deepEqual(result.countries[0].offers.sa, []);

  const unknown = { ...input, coverage: {} };
  assert.deepEqual(netflix(unknown), { countries: [], coveredCountries: new Set(), confirmedCount: 0 });
  assert.equal(reconcileAll(unknown).size, 0);
});

test('reconcileAll groups offers by service with the same result as individual reconciliation', () => {
  const results = reconcileAll(disagreement);
  assert.deepEqual([...results.keys()], ['netflix', 'prime-video']);
  for (const [serviceKey, result] of results) {
    assert.deepEqual(result, reconcile({ ...disagreement, serviceKey }));
    assert.ok(result.countries.every(({ offers }) =>
      [...offers.tmdb, ...offers.sa].every((offer) => offer.serviceKey === serviceKey)));
  }
  const missing = reconcile({ ...disagreement, serviceKey: 'missing' });
  assert.deepEqual(missing, { countries: [], coveredCountries: new Set(['fr', 'ca', 'de']), confirmedCount: 0 });
});
