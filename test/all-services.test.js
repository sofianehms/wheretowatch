import assert from 'node:assert/strict';
import test from 'node:test';
import { offersAtHome } from '../src/render/all-services.js';
import { servicesState } from '../src/render/service-picker.js';

const offer = (source, serviceName, offerType = 'subscription', country = 'fr') => {
  const serviceId = source === 'tmdb' ? serviceName.length : serviceName;
  return { source, country, serviceKey: `${source}:${serviceId}`, serviceName, serviceId, offerType };
};
const snapshot = (source, offers) => ({ source, status: 'offers', fetchedAt: '2026-11-21T12:00:00Z', offers });
const snapshots = [
  snapshot('tmdb', [offer('tmdb', 'Canal+'), offer('tmdb', 'Apple TV', 'rent'), offer('tmdb', 'Mubi', 'subscription', 'us')]),
  snapshot('sa', [offer('sa', 'Canal+'), offer('sa', 'Canal+', 'buy')]),
];
const fresh = { status: 'fresh', countries: ['fr', 'us'] };

function atHome(input) {
  const { all } = servicesState(input, 'all', 'FR');
  return offersAtHome(all.reconciledAll, all.offers, all.home);
}

const expected = [
  { type: 'subscription', services: [{ name: 'Canal+', sources: ['tmdb', 'sa'] }] },
  { type: 'rent', services: [{ name: 'Apple TV', sources: ['tmdb'] }] },
  { type: 'buy', services: [{ name: 'Canal+', sources: ['sa'] }] },
];

test('all services lists every offer of the reference country, whatever the coverage knowledge', () => {
  const unknown = { status: 'unknown' };
  for (const coverage of [{ tmdb: fresh, sa: fresh }, { tmdb: unknown, sa: fresh }, { tmdb: fresh, sa: unknown }, {}]) {
    assert.deepEqual(atHome({ snapshots, coverage }), expected);
  }
});

test('all services names the only source in single-source mode', () => {
  assert.deepEqual(atHome({ snapshots: [snapshots[1]], coverage: { sa: fresh } }), [
    { type: 'subscription', services: [{ name: 'Canal+', sources: ['sa'] }] },
    { type: 'buy', services: [{ name: 'Canal+', sources: ['sa'] }] },
  ]);
});
