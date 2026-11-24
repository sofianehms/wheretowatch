import assert from 'node:assert/strict';
import test from 'node:test';
import { createSources } from '../src/api/sources.js';
import { createTypeahead } from '../src/core/typeahead.js';
import { reconcile } from '../src/core/reconcile.js';
import { computeVerdict } from '../src/core/verdict.js';
import { DEFAULT_SERVICE } from '../src/data/services.js';
import { createSettings } from '../src/settings/keys.js';
import { fakeSource, fakeTitle } from './fakes/sources.js';

const offer = (source) => ({
  country: 'fr', serviceKey: DEFAULT_SERVICE, serviceName: 'Netflix', serviceLogoPath: null,
  offerType: 'subscription', source, link: null, quality: null, expiresOn: null, languages: [],
});

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = { search: 0, tmdb: 0, sa: 0 };
  const available = (id) => async () => {
    calls[id]++;
    return {
      source: id, status: 'offers', fetchedAt: '2026-11-21T10:00:00.000Z',
      coveredCountries: 2, offers: [offer(id)], error: null,
    };
  };
  const tmdb = fakeSource('tmdb', {
    async searchTitles() {
      calls.search++;
      return [fakeTitle];
    },
    getAvailability: available('tmdb'),
    listCoveredCountries: () => ['fr', 'us'],
  });
  const sa = fakeSource('sa', { getAvailability: available('sa'), listCoveredCountries: () => ['fr', 'us'] });
  const sources = createSources({ sources: [tmdb, sa] });
  const states = [];
  const typeahead = createTypeahead({ search: (query, { signal }) => sources.searchTitles(query, { signal }), onState: (state) => states.push(state) });
  const storage = new Map();
  const settings = createSettings({
    storage: {
      getItem: (name) => storage.get(name) ?? null,
      setItem: (name, value) => storage.set(name, String(value)),
      removeItem: (name) => storage.delete(name),
    },
    navigatorLike: { language: 'fr-FR' },
  });
  return { calls, sources, typeahead, states, settings, tick: (ms) => t.mock.timers.tick(ms) };
}

async function verdictFor({ sources, settings }, title) {
  const { snapshots, coverage } = await sources.loadAvailability(title);
  const serviceKey = settings.getPref('service') ?? DEFAULT_SERVICE;
  const reconciled = reconcile({ snapshots, coverage, serviceKey });
  return computeVerdict({ reconciled, snapshots, serviceKey, homeCountry: settings.getPref('country'), mediaType: title.mediaType });
}

test('typing sends no availability request, choosing a suggestion sends exactly one per source', async (t) => {
  const flow = setup(t);
  for (const value of ['Go', 'God', 'Godfather']) flow.typeahead.input(value);
  flow.tick(300);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flow.states.at(-1).status, 'results');
  assert.equal(flow.calls.search, 1);
  assert.deepEqual([flow.calls.tmdb, flow.calls.sa], [0, 0], 'no availability request while typing');

  const chosen = flow.states.at(-1).titles[0];
  const verdict = await verdictFor(flow, chosen);
  assert.deepEqual([flow.calls.tmdb, flow.calls.sa], [1, 1], 'one request per source on choice');
  assert.equal(verdict.kind, 'available');
});

test('the reference country drives the "at home" verdict and defaults to the browser language', async (t) => {
  const flow = setup(t);
  assert.equal(flow.settings.getPref('country'), 'fr');
  assert.equal((await verdictFor(flow, fakeTitle)).home.kind, 'available');

  flow.settings.setPref('country', 'us');
  assert.equal((await verdictFor(flow, fakeTitle)).home.kind, 'notFound');
});

test('the displayed service falls back to the default when none is chosen', (t) => {
  const { settings } = setup(t);
  assert.equal(settings.getPref('service') ?? DEFAULT_SERVICE, DEFAULT_SERVICE);
});
