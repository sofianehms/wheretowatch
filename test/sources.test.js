import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../src/api/http.js';
import { createSources } from '../src/api/sources.js';
import { fakeSource, fakeTitle } from './fakes/sources.js';

test('selects adapters supplied for the configured keys and defaults to TMDB search', () => {
  const tmdb = fakeSource('tmdb');
  const sa = fakeSource('sa');

  const tmdbOnly = createSources({ sources: [tmdb] });
  assert.deepEqual(tmdbOnly.activeSources, [tmdb]);
  assert.equal(tmdbOnly.searchSource, tmdb);

  const both = createSources({ sources: [sa, tmdb] });
  assert.deepEqual(both.activeSources, [sa, tmdb]);
  assert.equal(both.searchSource, tmdb);
  assert.equal(both.searchError, null);
  assert.deepEqual(both.activeSources[0].listCoveredCountries(), ['FR']);
});

test('missing TMDB returns a typed auth error without falling back to SA search', async () => {
  const sa = fakeSource('sa');
  for (const sources of [[], [sa]]) {
    const registry = createSources({ sources });
    assert.deepEqual(registry.activeSources, sources);
    assert.equal(registry.searchSource, null);
    assert.ok(registry.searchError instanceof HttpError);
    assert.equal(registry.searchError.type, 'auth');
    assert.deepEqual(await registry.searchTitles('Godfather'), { titles: [], error: registry.searchError });
  }
});

test('SA-only mode selects SA for search and availability even when TMDB is configured', async () => {
  const signal = new AbortController().signal;
  const sa = fakeSource('sa', {
    async searchTitles(query, options) {
      assert.equal(query, 'Godfather');
      assert.equal(options.signal, signal);
      return [fakeTitle];
    },
  });
  const tmdb = fakeSource('tmdb');
  const registry = createSources({ sources: [tmdb, sa], mode: 'sa-only' });

  assert.deepEqual(registry.activeSources, [sa]);
  assert.equal(registry.searchSource, sa);
  assert.equal(registry.searchSource.capabilities.instantSearch, false);
  assert.deepEqual(await registry.searchTitles('Godfather', { signal }), { titles: [fakeTitle], error: null });
  assert.deepEqual(await registry.getAvailability(fakeTitle), [await sa.getAvailability()]);
  assert.equal(createSources({ sources: [tmdb], mode: 'sa-only' }).searchError.type, 'auth');
});

test('capabilities gate search and availability independently', async () => {
  const tmdb = fakeSource('tmdb', {
    capabilities: { search: false, availability: true, languages: false, instantSearch: false },
  });
  const sa = fakeSource('sa', {
    capabilities: { search: true, availability: false, languages: false, instantSearch: false },
  });
  const registry = createSources({ sources: [tmdb, sa] });

  assert.equal(registry.searchSource, null);
  assert.equal(registry.searchError.type, 'auth');
  assert.deepEqual(await registry.getAvailability(fakeTitle), [await tmdb.getAvailability()]);
});

test('isolates one provider failure and preserves the other snapshot', async () => {
  const signal = new AbortController().signal;
  const error = new HttpError('offline');
  const tmdb = fakeSource('tmdb', {
    async searchTitles() {
      throw error;
    },
    getAvailability(title, options) {
      assert.equal(title, fakeTitle);
      assert.equal(options.signal, signal);
      throw error;
    },
  });
  const sa = fakeSource('sa');
  const registry = createSources({ sources: [tmdb, sa] });
  const [failed, healthy] = await registry.getAvailability(fakeTitle, { signal });

  assert.deepEqual(failed, {
    source: 'tmdb',
    status: 'unavailable',
    fetchedAt: new Date(failed.fetchedAt).toISOString(),
    coveredCountries: null,
    offers: [],
    error,
  });
  assert.deepEqual(healthy, await sa.getAvailability());
  assert.deepEqual(await registry.searchTitles('Godfather'), { titles: [], error });
});
