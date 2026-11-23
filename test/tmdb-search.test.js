import assert from 'node:assert/strict';
import test from 'node:test';
import { createCache } from '../src/api/cache.js';
import { request } from '../src/api/http.js';
import { createTmdbSource } from '../src/api/tmdb.js';
import configuration from './fixtures/tmdb/images-configuration.js';
import regions from './fixtures/tmdb/regions.js';
import search from './fixtures/tmdb/search-multi.js';
import empty from './fixtures/tmdb/search-empty.js';
import rateLimit, { status as rateLimitStatus } from './fixtures/tmdb/error-429.js';

const credential = 'fixture-authorization';
const json = (body, options) => Response.json(body, options);

function setup(responses, { getToken = () => credential, getLocale } = {}) {
  const calls = [];
  const waits = [];
  const entries = new Map();
  const clock = { time: 1000 };
  const cache = createCache({
    now: () => clock.time,
    storage: {
      get length() { return entries.size; },
      key: (index) => [...entries.keys()][index],
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key),
    },
  });
  const source = createTmdbSource({
    cache, getToken, getLocale,
    http: (url, options) => request(url, {
      ...options,
      fetchImpl(url, { headers, signal }) {
        calls.push({ url: new URL(url), headers, signal });
        return responses.shift();
      },
      sleep: (ms) => waits.push(ms),
    }),
  });
  return { source, calls, waits, clock, cache, entries };
}

test('maps movies and series, removes people and limits suggestions to eight', async () => {
  const extra = { ...search.results[0], id: 999999 };
  const { source, calls } = setup([json({ results: [...search.results, extra] })]);
  assert.equal(source.id, 'tmdb');
  assert.deepEqual(source.capabilities, { search: true, availability: false, languages: false, instantSearch: true });
  await assert.rejects(source.getAvailability(), { message: 'not implemented' });
  const titles = await source.searchTitles('Glass & Garden');
  assert.equal(titles.length, 8);
  assert.ok(titles.every(({ mediaType }) => ['movie', 'tv'].includes(mediaType)));
  assert.ok(titles.every(({ tmdbId }) => tmdbId !== extra.id));
  assert.deepEqual(titles.slice(0, 2), [
    {
      mediaType: 'movie', tmdbId: 900001, imdbId: null, title: 'The Glass Orchard',
      year: 2024, posterPath: '/glass-orchard.jpg', ref: 'movie/900001',
    },
    {
      mediaType: 'tv', tmdbId: 900002, imdbId: null, title: 'Signal Garden',
      year: 2025, posterPath: null, ref: 'tv/900002',
    },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/3/search/multi');
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), {
    query: 'Glass & Garden', language: 'en', include_adult: 'false',
  });
  assert.equal(calls[0].headers.Authorization, `Bearer ${credential}`);
  assert.doesNotMatch(calls[0].url.href, /api_key|fixture-authorization/);
});

test('caches normalized queries in memory per locale for ten minutes', async () => {
  let locale = 'en';
  const { source, calls, clock, entries } = setup([json(search), json(empty), json(empty)], {
    getLocale: () => locale,
  });
  const titles = await source.searchTitles('Glass Garden');
  clock.time += 599_999;
  assert.deepEqual(await source.searchTitles('Glass Garden'), titles);
  assert.deepEqual(await source.searchTitles('  GLASS   garden '), titles);
  assert.equal(calls.length, 1);
  assert.equal(entries.size, 0);
  clock.time++;
  assert.deepEqual(await source.searchTitles('Glass Garden'), []);
  assert.deepEqual(await source.searchTitles('Glass Garden'), []);
  assert.equal(calls.length, 2);
  locale = 'fr';
  assert.deepEqual(await source.searchTitles('Glass Garden'), []);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url.searchParams.get('language'), 'fr');
});

test('rejects pasted credentials before fetching or caching the search', async () => {
  const { source, calls, cache } = setup([json(empty)]);
  await assert.rejects(source.searchTitles(credential), { type: 'auth' });
  await assert.rejects(source.searchTitles(`Glass ${credential} Garden`), { type: 'auth' });
  assert.equal(calls.length, 0);
  assert.equal(cache.stats().entries, 0);
  assert.deepEqual(await source.searchTitles('Glass Garden'), []);
  assert.equal(calls.length, 1);
});

test('rejects credentials that would be URL-encoded and queries containing api_key', async () => {
  const encoded = 'fixture+authorization';
  const { source, calls } = setup([], { getToken: () => encoded });
  await assert.rejects(source.searchTitles(`Glass ${encoded}`), { type: 'auth' });
  await assert.rejects(source.searchTitles('Glass api_key=fixture'), { type: 'auth' });
  assert.equal(calls.length, 0);
});

test('handles blank queries, missing metadata and pre-aborted searches', async () => {
  const { source, calls } = setup([json({ results: [{ media_type: 'tv', name: 'No date' }] })]);
  assert.deepEqual(await source.searchTitles('  '), []);
  await assert.rejects(source.searchTitles('No date', { signal: AbortSignal.abort() }), { type: 'aborted' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await source.searchTitles('No date'), [{
    mediaType: 'tv', tmdbId: null, imdbId: null, title: 'No date', year: null, posterPath: null, ref: null,
  }]);
});

test('surfaces 401 without retrying or caching it and skips requests with missing credentials', async () => {
  const { source, calls } = setup([json({}, { status: 401 }), json(empty)]);
  await assert.rejects(source.searchTitles('Glass'), { type: 'auth', status: 401 });
  assert.equal(calls.length, 1);
  assert.deepEqual(await source.searchTitles('Glass'), []);
  assert.equal(calls.length, 2);
  const missing = setup([], { getToken: () => null });
  await assert.rejects(missing.source.searchTitles('Glass'), { type: 'auth' });
  assert.equal(missing.calls.length, 0);
});

test('honors Retry-After and makes at most one retry', async () => {
  const limited = () => json(rateLimit, { status: rateLimitStatus, headers: { 'Retry-After': '2' } });
  const { source, calls, waits } = setup([limited(), json(search), limited(), limited()]);
  assert.equal((await source.searchTitles('Glass')).length, 8);
  assert.deepEqual(waits, [2000]);
  assert.deepEqual(calls[0].url, calls[1].url);
  await assert.rejects(source.searchTitles('Garden'), { type: 'rateLimited', status: 429 });
  assert.deepEqual(waits, [2000, 2000]);
  assert.equal(calls.length, 4);
});

test('surfaces a 429 without retrying when Retry-After exceeds the wait budget', async () => {
  const { source, calls, waits } = setup([
    json(rateLimit, { status: rateLimitStatus, headers: { 'Retry-After': '30' } }),
    json(search),
  ]);
  await assert.rejects(source.searchTitles('Glass'), { type: 'rateLimited', status: 429 });
  assert.equal(calls.length, 1);
  assert.deepEqual(waits, []);
});

test('caches dynamic region codes and image configuration for seven days with fetchedAt', async () => {
  const updated = { results: [{ iso_3166_1: 'JP' }] };
  const { source, calls, clock, cache } = setup([
    json(regions), json(configuration), json(updated), json(configuration),
  ]);
  const codes = await source.listCoveredCountries();
  assert.deepEqual(codes, regions.results.map(({ iso_3166_1 }) => iso_3166_1.toLowerCase()));
  assert.deepEqual(await source.getImageConfiguration(), configuration.images);
  assert.equal(calls[0].url.pathname, '/3/watch/providers/regions');
  assert.equal(calls[1].url.pathname, '/3/configuration');
  assert.equal(cache.get('tmdb.regions').fetchedAt, clock.time);
  assert.equal(cache.get('tmdb.configuration').fetchedAt, clock.time);
  clock.time += 7 * 86_400_000 - 1;
  assert.deepEqual(await source.listCoveredCountries(), codes);
  assert.deepEqual(await source.getImageConfiguration(), configuration.images);
  assert.equal(calls.length, 2);
  clock.time++;
  assert.deepEqual(await source.listCoveredCountries(), ['jp']);
  assert.deepEqual(await source.getImageConfiguration(), configuration.images);
  assert.equal(cache.get('tmdb.regions').fetchedAt, clock.time);
  assert.equal(calls.length, 4);
  for (const { url, headers } of calls) {
    assert.equal(url.search, '');
    assert.equal(headers.Authorization, `Bearer ${credential}`);
    assert.doesNotMatch(url.href, /api_key|fixture-authorization/);
  }
});

test('allows image configuration fallback after HTTP failure or missing image settings', async () => {
  const { source } = setup([json({}, { status: 503 }), json({}), json(configuration)]);
  assert.equal(await source.getImageConfiguration(), null);
  assert.equal(await source.getImageConfiguration(), null);
  assert.deepEqual(await source.getImageConfiguration(), configuration.images);
});

test('keeps regions and image configuration for the visit when the cache stores nothing', async () => {
  const paths = [];
  const source = createTmdbSource({
    cache: { get: () => undefined, set() {} },
    getToken: () => credential,
    http: async (url) => {
      const { pathname } = new URL(url);
      paths.push(pathname);
      return pathname.endsWith('/regions') ? regions : configuration;
    },
  });
  const codes = await source.listCoveredCountries();
  assert.deepEqual(await source.listCoveredCountries(), codes);
  assert.deepEqual(await source.getImageConfiguration(), configuration.images);
  assert.deepEqual(await source.getImageConfiguration(), configuration.images);
  assert.deepEqual(paths, ['/3/watch/providers/regions', '/3/configuration']);
});
