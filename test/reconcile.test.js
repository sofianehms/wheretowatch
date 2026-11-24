import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SERVICE_MAP } from '../src/data/services.js';
import { computeVerdict, verdictText } from '../src/core/verdict.js';
import { t } from '../src/i18n/strings.js';
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

test('conflict keeps one-sided availability for a shared service in covered countries', () => {
  const result = netflix(disagreement);
  assert.equal(result.confirmedCount, 0);
  assert.deepEqual(result.countries.map(({ country, state }) => [country, state]), [
    ['fr', 'conflict'], ['de', 'single'],
  ]);
  assert.deepEqual(result.countries[0].offers.sa, []);

  const bothCovered = netflix({
    ...disagreement,
    coverage: { ...disagreement.coverage, tmdb: { status: 'fresh', countries: ['fr', 'ca', 'de'] } },
  });
  assert.deepEqual(bothCovered.countries.map(({ country, state }) => [country, state]), [
    ['fr', 'conflict'], ['de', 'conflict'],
  ]);
});

test('verified services reported by one source stay single regardless of the other source’s coverage', () => {
  const { coverage, snapshots: [tmdb, sa] } = divergingTypes;
  for (const [reporting, other] of [[tmdb, sa], [sa, tmdb]]) {
    const offer = { ...reporting.offers[0], serviceName: 'Netflix' };
    const otherOffer = { ...other.offers[0], serviceKey: other.source === 'tmdb' ? 'tmdb:9902' : 'sa:lantern' };
    for (const otherSnapshot of [
      { ...other, status: 'empty', offers: [] },
      { ...other, offers: [otherOffer] },
    ]) {
      for (const countries of [['fr'], ['de']]) {
        const input = {
          snapshots: [{ ...reporting, offers: [offer] }, otherSnapshot],
          coverage: { ...coverage, [other.source]: { status: 'fresh', countries } },
        };
        const result = reconcileAll(input).get('netflix');
        assert.deepEqual(result, netflix(input));
        assert.equal(result.service.name, offer.serviceName);
        assert.deepEqual(Object.keys(result.service.sourceIds), [reporting.source]);
        assert.deepEqual(result.countries.map(({ country, state }) => [country, state]), [['fr', 'single']]);
      }
    }
  }
});

test('outsideSaCoverage uses a known SA list for TMDB-only countries of a shared service', () => {
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

test('unknown coverage retains service metadata and excludes country rows and counts', () => {
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
  const resultWithoutCoverage = netflix(unknown);
  assert.deepEqual(resultWithoutCoverage.countries, []);
  assert.deepEqual(resultWithoutCoverage.coveredCountries, new Set());
  assert.equal(resultWithoutCoverage.confirmedCount, 0);
  assert.equal(resultWithoutCoverage.coverage.sa.status, 'unknown');
  assert.deepEqual([...reconcileAll(unknown).keys()], ['netflix', 'tmdb:9902']);
});

test('reconcileAll groups offers by service with the same result as individual reconciliation', () => {
  const results = reconcileAll(disagreement);
  assert.deepEqual([...results.keys()], ['netflix', 'tmdb:9902', 'sa:lantern']);
  for (const [serviceKey, result] of results) {
    assert.deepEqual(result, reconcile({ ...disagreement, serviceKey }));
    assert.ok(result.countries.every(({ offers }) =>
      [...offers.tmdb, ...offers.sa].every((offer) => offer.serviceKey === serviceKey)));
  }
  const missing = reconcile({ ...disagreement, serviceKey: 'missing' });
  assert.deepEqual(missing.countries, []);
  assert.deepEqual(missing.coveredCountries, new Set(['fr', 'ca', 'de']));
  assert.equal(missing.confirmedCount, 0);
});

const syntheticKey = 'pebble-cinema';
const mapping = {
  key: syntheticKey,
  name: 'Pebble Registry Name',
  tmdbProviderId: 9902,
  saServiceId: '9902',
};
const tmdbOffer = {
  ...divergingTypes.snapshots[0].offers[0],
  serviceKey: 'tmdb:9902',
  serviceId: 9902,
  serviceName: 'Pebble Cinema',
  serviceLogoPath: '/pebble-cinema.png',
};
const saOffer = {
  ...divergingTypes.snapshots[1].offers[0],
  serviceKey: 'sa:9902',
  serviceId: '9902',
  serviceName: 'Pebble Cinema',
};
const synthetic = {
  coverage: divergingTypes.coverage,
  snapshots: divergingTypes.snapshots.map((snapshot, index) => ({
    ...snapshot, offers: [snapshot.offers[0], index === 0 ? tmdbOffer : saOffer],
  })),
};

test('keeps unmapped services single even when both sources return the same name and ID text', () => {
  const grouped = reconcileAll(synthetic);
  assert.deepEqual([...grouped.keys()], ['netflix', 'tmdb:9902', 'sa:9902']);
  const tmdbOnly = grouped.get('tmdb:9902');
  assert.deepEqual(tmdbOnly.service, {
    key: 'tmdb:9902', name: 'Pebble Cinema', sourceIds: { tmdb: 9902 }, serviceLogoPath: '/pebble-cinema.png',
  });
  assert.equal(tmdbOnly.countries[0].state, 'single');
  assert.equal(grouped.get('sa:9902').countries[0].state, 'single');
  assert.equal(grouped.get('netflix').countries[0].state, 'confirmed');
  const verdict = computeVerdict({ ...synthetic, reconciled: tmdbOnly, serviceKey: 'tmdb:9902' });
  assert.match(verdictText(verdict, t), /Available on Pebble Cinema/);
});

test('only a verified map entry joins the two source identifiers, including cached offers', () => {
  const cached = {
    ...synthetic,
    snapshots: [
      { ...synthetic.snapshots[0], offers: [synthetic.snapshots[0].offers[0], { ...tmdbOffer, serviceId: undefined }] },
      synthetic.snapshots[1],
    ],
  };
  const serviceMap = { ...SERVICE_MAP, [syntheticKey]: mapping };
  assert.deepEqual(reconcileAll({ ...cached, serviceMap }), reconcileAll(cached));

  serviceMap[syntheticKey] = { ...mapping, verifiedBy: 'Synthetic provider fixtures' };
  const grouped = reconcileAll({ ...cached, serviceMap });
  assert.deepEqual([...grouped.keys()], ['netflix', syntheticKey]);
  const result = grouped.get(syntheticKey);
  assert.equal(result.service.name, tmdbOffer.serviceName);
  assert.deepEqual(result.service.sourceIds, { tmdb: 9902, sa: '9902' });
  assert.equal(result.countries[0].state, 'confirmed');
  assert.equal(result.confirmedCount, 1);
  assert.equal(result.countries[0].offers.tmdb.length, 1);
  assert.equal(result.countries[0].offers.sa.length, 1);
  assert.deepEqual(result, reconcile({ ...cached, serviceMap, serviceKey: syntheticKey }));
});

test('the TMDB watch-provider link is kept per country even when the service has no TMDB offer', () => {
  const offer = {
    source: 'tmdb', country: 'fr', serviceKey: 'tmdb:2', serviceName: 'Apple TV', serviceId: 2, serviceLogoPath: null, offerType: 'rent',
    link: 'https://www.themoviedb.org/movie/11/watch?locale=FR', quality: null, expiresOn: null, languages: [],
  };
  const result = netflix({
    coverage: { tmdb: { status: 'fresh', countries: ['fr'] } },
    snapshots: [{ source: 'tmdb', status: 'offers', fetchedAt: null, coveredCountries: null, error: null, offers: [offer] }],
  });
  assert.equal(result.countries.length, 0);
  assert.equal(result.tmdbLinks.get('fr'), 'https://www.themoviedb.org/movie/11/watch?locale=FR');
});
