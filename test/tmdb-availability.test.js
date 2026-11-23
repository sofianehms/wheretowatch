import assert from 'node:assert/strict';
import test from 'node:test';
import { createCache, TTL_BY_KIND } from '../src/api/cache.js';
import { request } from '../src/api/http.js';
import { createTmdbSource } from '../src/api/tmdb.js';
import movieDetails from './fixtures/tmdb/movie-details.js';
import movieProviders from './fixtures/tmdb/movie-watch-providers.js';
import seriesDetails from './fixtures/tmdb/series-details.js';
import seriesProviders from './fixtures/tmdb/series-watch-providers.js';
import emptyProviders from './fixtures/tmdb/watch-providers-empty.js';
import notFound from './fixtures/tmdb/error-404.js';

const movie = { mediaType: 'movie', tmdbId: movieDetails.id, imdbId: null, ref: 'movie/900001' };
const series = { mediaType: 'tv', tmdbId: seriesDetails.id, imdbId: null, ref: 'tv/900002' };

function setup(respond) {
  const calls = [];
  const entries = new Map();
  const clock = { time: Date.UTC(2026, 10, 23) };
  const now = () => clock.time;
  const cache = createCache({
    now,
    storage: {
      get length() { return entries.size; },
      key: (index) => [...entries.keys()][index],
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key),
    },
  });
  const source = createTmdbSource({
    cache, now, getToken: () => 'fixture-authorization',
    http: (url, options) => request(url, {
      ...options,
      fetchImpl(url) {
        const { pathname, search } = new URL(url);
        const endpoint = pathname + search;
        calls.push(endpoint);
        return respond(endpoint);
      },
    }),
  });
  return { source, calls, clock };
}

const movieResponse = (endpoint) => Response.json(
  endpoint.endsWith('/watch/providers') ? movieProviders : movieDetails,
);

test('starts both movie requests in parallel and normalizes offers with provider names and logos', async () => {
  let releaseDetails;
  const pendingDetails = new Promise((resolve) => { releaseDetails = resolve; });
  const { source, calls, clock } = setup((endpoint) =>
    endpoint.endsWith('/watch/providers') ? Response.json(movieProviders) : pendingDetails);
  const pending = source.getAvailability(movie);
  assert.deepEqual(calls, [
    '/3/movie/900001?append_to_response=external_ids',
    '/3/movie/900001/watch/providers',
  ]);
  releaseDetails(Response.json(movieDetails));
  const snapshot = await pending;
  assert.equal(snapshot.status, 'offers');
  assert.equal(snapshot.source, 'tmdb');
  assert.equal(snapshot.error, null);
  assert.equal(snapshot.fetchedAt, new Date(clock.time).toISOString());
  assert.equal(snapshot.coveredCountries, 2);
  assert.deepEqual(snapshot.title, { ...movie, imdbId: 'tt99000001' });
  assert.equal(movie.imdbId, null);
  assert.deepEqual(snapshot.offers.map(({ country, serviceKey, offerType }) =>
    [country, serviceKey, offerType]), [
    ['us', 'netflix', 'subscription'],
    ['us', 'tmdb:9901', 'free'],
    ['us', 'tmdb:9902', 'rent'],
    ['us', 'tmdb:9902', 'buy'],
    ['fr', 'netflix', 'subscription'],
  ]);
  for (const offer of snapshot.offers) {
    const region = movieProviders.results[offer.country.toUpperCase()];
    const provider = Object.values(region).flat().find(({ provider_name }) => provider_name === offer.serviceName);
    assert.ok(provider);
    assert.equal(offer.serviceLogoPath, provider.logo_path);
    assert.equal(offer.link, region.link);
  }
});

test('uses series endpoints and preserves a missing IMDb identifier', async () => {
  const { source, calls } = setup((endpoint) => Response.json(
    endpoint.endsWith('/watch/providers') ? seriesProviders : seriesDetails,
  ));
  const snapshot = await source.getAvailability(series);
  assert.deepEqual(calls, [
    '/3/tv/900002?append_to_response=external_ids',
    '/3/tv/900002/watch/providers',
  ]);
  assert.equal(snapshot.status, 'offers');
  assert.deepEqual(snapshot.title, series);
  assert.equal(snapshot.coveredCountries, 1);
  assert.equal(snapshot.offers.length, 2);
  for (const offer of snapshot.offers) {
    const region = seriesProviders.results.FR;
    const provider = [...region.flatrate, ...region.ads].find(({ provider_name }) => provider_name === offer.serviceName);
    assert.ok(provider);
    assert.equal(offer.serviceLogoPath, provider.logo_path);
    assert.equal(offer.link, region.link);
  }
});

test('returns empty when no country has offers', async () => {
  const { source, calls } = setup((endpoint) => Response.json(
    endpoint.endsWith('/watch/providers') ? emptyProviders : { id: emptyProviders.id },
  ));
  const title = { ...movie, tmdbId: emptyProviders.id, ref: 'movie/900003' };
  const snapshot = await source.getAvailability(title);
  assert.equal(snapshot.status, 'empty');
  assert.equal(snapshot.coveredCountries, 0);
  assert.deepEqual(snapshot.offers, []);
  assert.equal(snapshot.error, null);
  assert.deepEqual(await source.getAvailability(title), snapshot);
  assert.equal(calls.length, 2);
});

for (const missing of ['details', 'providers']) {
  test(`returns notFound for a 404 from ${missing}`, async () => {
    const { source } = setup((endpoint) => {
      const part = endpoint.endsWith('/watch/providers') ? 'providers' : 'details';
      return part === missing ? Response.json(notFound, { status: 404 }) : movieResponse(endpoint);
    });
    const snapshot = await source.getAvailability(movie);
    assert.equal(snapshot.status, 'notFound');
    assert.equal(snapshot.error, null);
    assert.equal(snapshot.coveredCountries, null);
    assert.deepEqual(snapshot.offers, []);
  });
}

test('returns unavailable with the network error type and retries only the failed endpoint', async () => {
  let fail = true;
  const { source, calls } = setup((endpoint) => {
    if (fail && endpoint.endsWith('/watch/providers')) throw new TypeError('Network failure');
    return movieResponse(endpoint);
  });
  const snapshot = await source.getAvailability(movie);
  assert.equal(snapshot.status, 'unavailable');
  assert.equal(snapshot.error.type, 'network');
  assert.deepEqual(snapshot.offers, []);
  fail = false;
  assert.equal((await source.getAvailability(movie)).status, 'offers');
  assert.equal(calls.length, 3);
  assert.equal(calls[2], '/3/movie/900001/watch/providers');
});

test('forwards cancellation to both requests', async () => {
  const { source, calls } = setup(() => new Promise(() => {}));
  const controller = new AbortController();
  const pending = source.getAvailability(movie, { signal: controller.signal });
  assert.equal(calls.length, 2);
  controller.abort();
  const snapshot = await pending;
  assert.equal(snapshot.status, 'unavailable');
  assert.equal(snapshot.error.type, 'aborted');
});

test('reuses both cached responses for 24 hours and refreshes details independently after seven days', async () => {
  const { source, calls, clock } = setup(movieResponse);
  const started = clock.time;
  const snapshot = await source.getAvailability(movie);
  clock.time += TTL_BY_KIND.availability - 1;
  assert.deepEqual(await source.getAvailability({ ...movie }), snapshot);
  assert.equal(calls.length, 2);

  clock.time++;
  const refreshed = await source.getAvailability(movie);
  assert.equal(refreshed.fetchedAt, new Date(clock.time).toISOString());
  assert.equal(calls.length, 3);
  assert.equal(calls[2], '/3/movie/900001/watch/providers');

  clock.time = started + TTL_BY_KIND.metadata - 1;
  const beforeMetadataExpiry = await source.getAvailability(movie);
  assert.equal(calls.length, 4);
  assert.equal(calls[3], '/3/movie/900001/watch/providers');

  clock.time++;
  assert.deepEqual(await source.getAvailability(movie), beforeMetadataExpiry);
  assert.deepEqual(calls.slice(4), ['/3/movie/900001?append_to_response=external_ids']);
});
