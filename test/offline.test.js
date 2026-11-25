import assert from 'node:assert/strict';
import test from 'node:test';
import { TTL_BY_KIND } from '../src/api/cache.js';
import { compose } from '../src/compose.js';
import show from './fixtures/sa/movie.js';
import countries from './fixtures/sa/countries.js';
import details from './fixtures/tmdb/movie-details.js';
import providers from './fixtures/tmdb/movie-watch-providers.js';

const ref = show.tmdbId;
const title = { mediaType: 'movie', tmdbId: details.id, ref };
const otherRef = 'movie/900002';
const start = Date.UTC(2026, 10, 19, 12);

// A visit online fills the cache, then every request is forbidden.
async function visited(t, { enableSa = true } = {}) {
  const entries = new Map();
  const storage = {
    get length() { return entries.size; },
    key: (index) => [...entries.keys()][index],
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  let time = start;
  const app = compose({ storage, now: () => time });
  app.settings.setKey('tmdb', 'fixture-tmdb');
  if (enableSa) app.settings.setKey('sa', 'fixture-sa');
  const fetchMock = t.mock.method(globalThis, 'fetch', (url) => {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'api.movieofthenight.com') return Response.json(pathname.endsWith('/countries') ? countries : show);
    if (pathname.endsWith('/regions')) return Response.json({ results: [{ iso_3166_1: 'FR' }, { iso_3166_1: 'US' }] });
    return Response.json(pathname.endsWith('/providers') ? providers : details);
  });
  app.cache.set('tmdb.regions', ['fr', 'us'], { kind: 'metadata', source: 'tmdb' });
  const online = await app.sources.loadAvailability(title);
  fetchMock.mock.mockImplementation(() => { throw new Error('no request is allowed offline'); });
  fetchMock.mock.resetCalls();
  return { ...app, online, entries, fetchMock, advance: (ms) => { time += ms; } };
}

test('a viewed title is listed and read again without any request', async (t) => {
  const app = await visited(t);
  const [entry, ...others] = await app.sources.listCachedTitles();
  assert.equal(others.length, 0);
  assert.equal(entry.title.ref, ref);
  assert.equal(entry.title.title, details.title);

  const saved = await app.sources.readCachedTitle(ref);
  assert.deepEqual(saved.snapshots.map(({ source }) => source), ['tmdb', 'sa']);
  for (const snapshot of saved.snapshots) {
    const before = app.online.snapshots.find(({ source }) => source === snapshot.source);
    assert.deepEqual(snapshot.offers, before.offers);
    assert.equal(snapshot.fetchedAt, before.fetchedAt);
    assert.equal(snapshot.stale, false);
  }
  assert.equal(app.fetchMock.mock.callCount(), 0);
});

test('expired data stays readable, marked stale and with its retrieval date', async (t) => {
  const app = await visited(t);
  app.advance(30 * TTL_BY_KIND.availability);
  const saved = await app.sources.readCachedTitle(ref);
  assert.ok(saved.snapshots.every((snapshot) => snapshot.stale));
  assert.equal(saved.snapshots[0].fetchedAt, new Date(start).toISOString());
  // The title is dated by its oldest source.
  assert.equal(saved.fetchedAt, saved.snapshots.map((snapshot) => snapshot.fetchedAt).sort()[0]);
  assert.equal(saved.coverage.tmdb.status, 'stale');
  assert.deepEqual(saved.coverage.tmdb.countries, ['fr', 'us']);
  assert.equal((await app.sources.listCachedTitles()).length, 1);
  assert.equal(app.fetchMock.mock.callCount(), 0);
});

test('without the second key only the first source is read', async (t) => {
  const app = await visited(t);
  app.settings.removeKey('sa');
  const saved = await app.sources.readCachedTitle(ref);
  assert.deepEqual(saved.snapshots.map(({ source }) => source), ['tmdb']);
});

test('a title never viewed, or erased, is neither listed nor read', async (t) => {
  const app = await visited(t, { enableSa: false });
  assert.equal(await app.sources.readCachedTitle(otherRef), null);
  // A name without availability data is not a viewed title.
  app.cache.set(`tmdb.details.${otherRef}`, { imdbId: null, title: { title: 'Only a name' } }, { kind: 'metadata', source: 'tmdb' });
  assert.deepEqual((await app.sources.listCachedTitles()).map((entry) => entry.title.ref), [ref]);
  app.cache.clear();
  assert.deepEqual(await app.sources.listCachedTitles(), []);
  assert.equal(await app.sources.readCachedTitle(ref), null);
  assert.equal(app.fetchMock.mock.callCount(), 0);
});

test('a title the first source did not find is read with that answer', async (t) => {
  const app = await visited(t, { enableSa: false });
  app.cache.set(`tmdb.notFound.${otherRef}`, {
    fetchedAt: '2026-11-18T08:00:00.000Z', details: { imdbId: null, title: { mediaType: 'movie', tmdbId: 900002, title: 'The Quiet Orchard' } },
  }, { kind: 'availability', source: 'tmdb' });
  const saved = await app.sources.readCachedTitle(otherRef);
  assert.equal(saved.title.title, 'The Quiet Orchard');
  assert.equal(saved.snapshots[0].status, 'notFound');
  assert.equal(saved.fetchedAt, '2026-11-18T08:00:00.000Z');
});
