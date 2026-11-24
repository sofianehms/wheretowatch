import assert from 'node:assert/strict';
import test from 'node:test';
import { TTL_BY_KIND } from '../src/api/cache.js';
import { compose } from '../src/compose.js';
import { reconcile } from '../src/core/reconcile.js';
import { computeVerdict, verdictText } from '../src/core/verdict.js';
import { t as translate } from '../src/i18n/strings.js';
import countries from './fixtures/sa/countries.js';
import rateLimited from './fixtures/sa/error-429.js';
import show from './fixtures/sa/movie.js';
import exhausted from './fixtures/sa/quota-exhausted.js';
import details from './fixtures/tmdb/movie-details.js';
import providers from './fixtures/tmdb/movie-watch-providers.js';

const title = { mediaType: 'movie', tmdbId: details.id, ref: show.tmdbId };
const otherTitle = { ...title, tmdbId: 900002, ref: 'movie/900002' };

function setup(t, { enableSa = true } = {}) {
  const entries = new Map();
  const storage = {
    get length() { return entries.size; },
    key: (i) => [...entries.keys()][i],
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  let time = Date.UTC(2026, 10, 23);
  const now = () => time;
  const { cache, quota, settings, sources: registry, checkKey } = compose({ storage, now });
  settings.setKey('tmdb', 'fixture-tmdb');
  if (enableSa) settings.setKey('sa', 'fixture-sa');
  const saCalls = [];
  const responses = {
    sa: (path) => Response.json(path.endsWith('/countries') ? countries : show),
    tmdb: (path) => Response.json(path.endsWith('/providers') ? providers : details),
  };
  t.mock.method(globalThis, 'fetch', (url) => {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'api.movieofthenight.com') {
      saCalls.push(pathname);
      return responses.sa(pathname);
    }
    assert.equal(hostname, 'api.themoviedb.org');
    return responses.tmdb(pathname);
  });
  cache.set('tmdb.regions', ['fr', 'us'], { kind: 'metadata', source: 'tmdb' });
  return {
    cache, quota, responses, saCalls, checkKey, registry,
    expire: () => { time += TTL_BY_KIND.availability; },
  };
}

const bySource = (result, id) => result.snapshots.find(({ source }) => source === id);

function verdict(result) {
  const serviceKey = 'netflix';
  const reconciled = reconcile({ ...result, serviceKey });
  return computeVerdict({ ...result, reconciled, serviceKey });
}

test('6.5 counter at 100% prevents any SA request and retains the TMDB answer', async (t) => {
  const { quota, registry, saCalls } = setup(t);
  for (let i = 0; i < quota.status().limit; i++) quota.record();
  const result = await registry.loadAvailability(title);
  assert.equal(result.mode, 'tmdbOnly');
  assert.equal(result.reason, 'quota');
  assert.equal(verdict(result).kind, 'available');
  assert.deepEqual(saCalls, []);
});

for (const [name, body] of [['generic rate limit', rateLimited], ['exhausted quota', exhausted]]) {
  test(`6.5 HTTP 429 (${name}) blocks all subsequent SA calls in the same cycle`, async (t) => {
    const { quota, registry, responses, saCalls, checkKey } = setup(t);
    responses.sa = () => Response.json(body, { status: 429 });
    const first = await registry.loadAvailability(title);
    assert.equal(first.reason, 'quota');
    assert.equal(quota.canCall(), false);
    assert.equal((await registry.loadAvailability(otherTitle)).reason, 'quota');
    assert.equal(await checkKey('sa', 'fixture-sa'), 'quota');
    assert.deepEqual(saCalls, ['/v4/shows/movie/900001']);
  });
}

test('6.5 quota block with stale SA cache returns its languages and original date', async (t) => {
  const { quota, registry, expire, saCalls } = setup(t);
  const fresh = bySource(await registry.loadAvailability(title), 'sa');
  expire();
  quota.markExhausted();
  const result = await registry.loadAvailability(title);
  assert.equal(result.mode, 'full');
  assert.equal(result.reason, 'quota');
  assert.deepEqual(bySource(result, 'sa'), { ...fresh, stale: true, reason: 'quota' });
  const answer = verdict(result);
  assert.equal(answer.stale, true);
  assert.match(verdictText(answer, translate), /not refreshed/i);
  assert.deepEqual(saCalls, ['/v4/shows/movie/900001', '/v4/countries']);
});

test('6.5 a failed SA refresh preserves stale data and does not cache it as fresh', async (t) => {
  const { cache, registry, expire, responses, saCalls } = setup(t);
  const fresh = bySource(await registry.loadAvailability(title), 'sa');
  expire();
  responses.sa = () => Response.json(rateLimited, { status: 429 });
  const fallback = await registry.loadAvailability(title);
  assert.deepEqual(bySource(fallback, 'sa'), { ...fresh, stale: true, reason: 'quota' });
  assert.equal(cache.get('sa.shows.movie/900001'), null);
  assert.deepEqual(await registry.loadAvailability(title), fallback);
  assert.equal(saCalls.length, 3);
});

test('6.5 an SA server failure uses stale data without another request during the cooldown', async (t) => {
  const { registry, expire, responses, quota, saCalls } = setup(t);
  const fresh = bySource(await registry.loadAvailability(title), 'sa');
  expire();
  responses.sa = () => Response.json({}, { status: 503 });
  const result = await registry.loadAvailability(title);
  assert.equal(result.reason, 'error');
  assert.deepEqual(bySource(result, 'sa'), { ...fresh, stale: true, reason: 'error' });
  assert.deepEqual(await registry.loadAvailability(title), result);
  assert.equal(saCalls.length, 3);
  assert.equal(quota.canCall(), true);
});

test('6.5 quota exhausted without stale SA cache returns TMDB-only mode', async (t) => {
  const { registry, responses } = setup(t);
  responses.sa = () => Response.json(exhausted, { status: 429 });
  const result = await registry.loadAvailability(title);
  assert.equal(result.mode, 'tmdbOnly');
  assert.equal(result.reason, 'quota');
  assert.equal(bySource(result, 'sa').status, 'unavailable');
  assert.equal(bySource(result, 'sa').stale, undefined);
  assert.deepEqual(verdict(result).sources, ['tmdb']);
});

test('6.5 a missing SA key exposes the noKey reason', async (t) => {
  const { registry, saCalls } = setup(t, { enableSa: false });
  const result = await registry.loadAvailability(title);
  assert.equal(result.mode, 'tmdbOnly');
  assert.equal(result.reason, 'noKey');
  assert.deepEqual(saCalls, []);
});

test('6.5 an unrecognized SA title retains the TMDB answer and the source notice', async (t) => {
  const { registry, responses } = setup(t);
  responses.sa = () => Response.json({}, { status: 404 });
  const result = await registry.loadAvailability(title);
  assert.equal(result.mode, 'tmdbOnly');
  assert.equal(result.reason, 'error');
  assert.equal(bySource(result, 'sa').status, 'notFound');
  assert.equal(verdict(result).kind, 'available');
});

for (const [type, respond] of [
  ['network', () => { throw new TypeError('Connection failed'); }],
  ['server', () => Response.json({}, { status: 503 })],
]) {
  test(`6.5 TMDB ${type} failure uses stale offers and preserves their retrieval date`, async (t) => {
    const { registry, expire, responses } = setup(t, { enableSa: false });
    const fresh = bySource(await registry.loadAvailability(title), 'tmdb');
    expire();
    responses.tmdb = respond;
    const result = await registry.loadAvailability(title);
    assert.equal(result.reason, 'error');
    assert.deepEqual(bySource(result, 'tmdb'), { ...fresh, stale: true, reason: 'error' });
    assert.match(verdictText(verdict(result), translate), /not refreshed/i);
  });
}

test('6.5 TMDB down without cache gives an explicit error even with an SA offer', async (t) => {
  const { registry, responses } = setup(t);
  responses.tmdb = () => Response.json({}, { status: 503 });
  const result = await registry.loadAvailability(title);
  assert.equal(result.reason, 'error');
  assert.equal(bySource(result, 'sa').status, 'offers');
  assert.equal(verdict(result).kind, 'error');
  assert.match(verdictText(verdict(result), translate), /Try again/i);
});

test('6.5 an invalid TMDB key bypasses stale cache and prompts for keys even with SA offers', async (t) => {
  const { registry, expire, responses } = setup(t);
  await registry.loadAvailability(title);
  expire();
  responses.tmdb = () => Response.json({}, { status: 401 });
  const result = await registry.loadAvailability(title);
  assert.equal(result.reason, 'error');
  assert.equal(bySource(result, 'tmdb').error.type, 'auth');
  assert.equal(bySource(result, 'tmdb').stale, undefined);
  assert.equal(bySource(result, 'sa').status, 'offers');
  assert.equal(verdict(result).kind, 'error');
  assert.match(verdictText(verdict(result), translate), /Check your API keys/);
});

test('a 429 during an SA key check also blocks later title requests', async (t) => {
  const { responses, saCalls, checkKey, registry } = setup(t);
  responses.sa = () => Response.json(rateLimited, { status: 429 });
  await checkKey('sa', 'fixture-sa');
  const result = await registry.loadAvailability(title);
  assert.equal(result.reason, 'quota');
  assert.deepEqual(saCalls, ['/v4/countries']);
});
