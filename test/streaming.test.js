import assert from 'node:assert/strict';
import test from 'node:test';
import { createCache } from '../src/api/cache.js';
import { request } from '../src/api/http.js';
import { createQuota } from '../src/api/quota.js';
import { createStreamingSource } from '../src/api/streaming.js';
import countries from './fixtures/sa/countries.js';
import movie from './fixtures/sa/movie.js';
import series from './fixtures/sa/series.js';
import noOptions from './fixtures/sa/no-options.js';
import notFound from './fixtures/sa/error-404.js';
import rateLimited from './fixtures/sa/error-429.js';
import exhausted from './fixtures/sa/quota-exhausted.js';

const sampleKey = 'example-streaming-key';
const day = 86_400_000;
const title = { ref: movie.tmdbId };
const tv = { ref: series.tmdbId };

function fixture(respond = () => Response.json(movie), limit = 1000) {
  let time = Date.parse('2027-01-15T00:00:00Z');
  const entries = new Map();
  const storage = {
    get length() { return entries.size; },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  const now = () => time;
  const quota = createQuota({ storage, now, config: { limit } });
  const cache = createCache({ storage, now });
  const calls = [];
  const create = (getKey = () => sampleKey) => createStreamingSource({
    cache, quota, getKey,
    http: (url, options) => request(url, {
      ...options,
      fetchImpl(url, { headers, redirect }) {
        calls.push(url);
        assert.equal(new URL(url).search, '');
        assert.ok(!url.includes(sampleKey));
        assert.deepEqual(headers, { 'X-API-Key': sampleKey });
        assert.equal(redirect, 'error');
        return respond(url);
      },
    }),
  });
  return { source: create(), create, quota, calls, advance: (ms) => { time += ms; } };
}

test('fetches a typed title once per 24 hours and normalizes offers from all countries', async () => {
  const show = structuredClone(movie);
  show.streamingOptions.US = show.streamingOptions.us;
  delete show.streamingOptions.us;
  show.streamingOptions.USA = show.streamingOptions.US;
  show.streamingOptions.US[0].subtitles[0] = {
    locale: { language: 'eng', region: 'US' }, closedCaptions: true,
  };
  show.streamingOptions.US[0].audios.push({});
  show.streamingOptions.US.push({ type: 'subscription' });
  const { source, create, quota, calls, advance } = fixture(() => Response.json(show));
  assert.deepEqual(source.capabilities, {
    search: false, availability: true, languages: true, instantSearch: false,
  });
  assert.equal(source.id, 'sa');
  assert.equal(calls.length, 0);
  const [first, concurrent] = await Promise.all([
    source.getAvailability(title), source.getAvailability(title),
  ]);
  assert.deepEqual(first, concurrent);
  assert.equal(first.status, 'offers');
  assert.equal(first.imdbId, movie.imdbId);
  assert.equal(first.error, null);
  assert.deepEqual(first.offers.map(({ country }) => country).sort(), ['fr', 'us']);
  assert.deepEqual(first.offers.find(({ country }) => country === 'us'), {
    country: 'us', serviceKey: 'netflix', serviceName: 'Netflix', serviceLogoPath: null,
    offerType: 'subscription', source: 'sa', link: movie.streamingOptions.us[0].link,
    quality: 'uhd', expiresOn: new Date(1801440000 * 1000).toISOString(),
    languages: [
      { kind: 'audio', language: 'eng', region: null, closedCaptions: false },
      { kind: 'audio', language: 'fra', region: null, closedCaptions: false },
      { kind: 'subtitle', language: 'eng', region: 'US', closedCaptions: true },
      { kind: 'subtitle', language: 'fra', region: null, closedCaptions: false },
    ],
  });
  advance(day - 1);
  assert.deepEqual(await create().getAvailability(title), first);
  assert.deepEqual(calls, ['https://api.movieofthenight.com/v4/shows/movie/900001']);
  advance(1);
  await source.getAvailability(title);
  assert.equal(calls.length, 2);
  assert.equal(quota.status().used, 2);
});

test('caches countries for seven days and uses the quota for both endpoints', async () => {
  const { source, calls, quota, advance } = fixture((url) =>
    Response.json(url.endsWith('/countries') ? countries : series));
  assert.deepEqual(await source.listCoveredCountries(), ['fr', 'us']);
  advance(7 * day - 1);
  assert.deepEqual(await source.listCoveredCountries(), ['fr', 'us']);
  assert.equal((await source.getAvailability(tv)).status, 'offers');
  assert.equal(quota.status().used, 2);
  advance(1);
  await source.listCoveredCountries();
  assert.deepEqual(calls, [
    'https://api.movieofthenight.com/v4/countries',
    'https://api.movieofthenight.com/v4/shows/tv/900002',
    'https://api.movieofthenight.com/v4/countries',
  ]);
  assert.equal(quota.status().used, 3);
});

test('serves cached results while quota blocks new requests', async () => {
  const { source, calls } = fixture(undefined, 1);
  const first = await source.getAvailability(title);
  assert.deepEqual(await source.getAvailability(title), first);
  assert.equal((await source.getAvailability(tv)).error.type, 'quota');
  await assert.rejects(source.listCoveredCountries(), { type: 'quota' });
  assert.equal(calls.length, 1);
});

for (const [name, body] of [['generic rate limit', rateLimited], ['quota exhaustion', exhausted]]) {
  test(`stops calls for the cycle after a 429 with ${name}`, async () => {
    const { source, quota, calls, advance } = fixture(() => Response.json(body, { status: 429 }));
    const result = await source.getAvailability(title);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error.type, 'quota');
    assert.equal(result.error.status, 429);
    assert.equal(quota.status().used, 1);
    assert.equal(quota.status().blocked, true);
    assert.equal((await source.getAvailability(tv)).error.type, 'quota');
    await assert.rejects(source.listCoveredCountries(), { type: 'quota' });
    assert.equal(calls.length, 1);
    advance(17 * day);
    await source.getAvailability(title);
    assert.equal(calls.length, 2);
  });
}

test('keeps the title cooldown when the quota cycle resets within 24 hours', async () => {
  const { source, calls, advance } = fixture(() => Response.json(rateLimited, { status: 429 }));
  advance(17 * day - 1);
  assert.equal((await source.getAvailability(title)).error.type, 'quota');
  advance(1);
  assert.equal((await source.getAvailability(title)).error.type, 'quota');
  assert.equal(calls.length, 1);
  await source.getAvailability(tv);
  assert.equal(calls.length, 2);
});

test('a 429 from the countries endpoint blocks title requests until the server reset', async () => {
  const { source, quota, calls, advance } = fixture(() => Response.json(rateLimited, {
    status: 429,
    headers: {
      'retry-after': '1',
      'x-quota-granted': '1000',
      'x-quota-used': '35',
      'x-quota-reset': '2027-02-03T00:00:00Z',
    },
  }));
  await assert.rejects(source.listCoveredCountries(), { type: 'quota', status: 429 });
  assert.equal(quota.status().used, 35);
  advance(17 * day);
  assert.equal((await source.getAvailability(title)).error.type, 'quota');
  assert.deepEqual(calls, ['https://api.movieofthenight.com/v4/countries']);
  advance(2 * day);
  assert.equal(quota.canCall(), true);
});

test('synchronizes server quota, persists its reset, and blocks at the reported limit', async () => {
  const { source, quota, calls, advance } = fixture(() => Response.json(countries, {
    headers: {
      'x-quota-granted': '25', 'x-quota-used': '25', 'x-quota-reset': '2027-02-03T00:00:00Z',
    },
  }));
  await source.listCoveredCountries();
  assert.equal(quota.status().used, 25);
  assert.equal(quota.status().limit, 25);
  assert.equal(quota.status().nextReset, Date.parse('2027-02-03T00:00:00Z'));
  advance(17 * day);
  assert.equal((await source.getAvailability(title)).error.type, 'quota');
  assert.equal(calls.length, 1);
  advance(2 * day);
  assert.equal(quota.status().used, 0);
  assert.equal(quota.canCall(), true);
});

test('caches both 404 and successful empty responses as distinct outcomes', async () => {
  const { source, calls } = fixture((url) => url.endsWith(title.ref)
    ? Response.json(notFound, { status: 404 })
    : Response.json(noOptions));
  const missing = await source.getAvailability(title);
  assert.equal(missing.status, 'notFound');
  assert.deepEqual(await source.getAvailability(title), missing);
  const empty = await source.getAvailability(tv);
  assert.equal(empty.status, 'empty');
  assert.equal(empty.imdbId, null);
  assert.deepEqual(await source.getAvailability(tv), empty);
  assert.equal(calls.length, 2);
});

test('rejects invalid references, missing keys, and pre-aborted requests without spending quota', async () => {
  const { source, create, calls, quota } = fixture();
  assert.equal((await source.getAvailability({ ref: 'movie/1?country=us' })).status, 'notFound');
  assert.equal((await source.getAvailability(title, { signal: AbortSignal.abort() })).error.type, 'aborted');
  assert.equal((await create(() => null).getAvailability(title)).error.type, 'auth');
  assert.equal((await create(() => '900001').getAvailability(title)).error.type, 'auth');
  assert.equal(calls.length, 0);
  assert.equal(quota.status().used, 0);
});

test('caches dispatched failures and restores the typed error', async () => {
  const { source, calls, quota } = fixture(() => Response.json({}, { status: 503 }));
  for (let index = 0; index < 2; index++) {
    const result = await source.getAvailability(title);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error.type, 'server');
    assert.equal(result.error.status, 503);
  }
  assert.equal(calls.length, 1);
  assert.equal(quota.status().used, 1);
});
