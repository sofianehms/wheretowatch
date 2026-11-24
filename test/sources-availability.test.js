import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'acorn';
import { createCache, TTL_BY_KIND } from '../src/api/cache.js';
import { createSources } from '../src/api/sources.js';
import { reconcile } from '../src/core/reconcile.js';
import { computeVerdict } from '../src/core/verdict.js';
import { fakeSource, fakeTitle } from './fakes/sources.js';

function countedSource(id) {
  const calls = { search: 0, availability: 0, coverage: 0 };
  const base = fakeSource(id);
  return {
    calls,
    source: fakeSource(id, {
      async searchTitles(...args) {
        calls.search++;
        return base.searchTitles(...args);
      },
      async getAvailability(...args) {
        calls.availability++;
        return { ...await base.getAvailability(...args), imdbId: fakeTitle.imdbId };
      },
      listCoveredCountries() {
        calls.coverage++;
        return ['fr'];
      },
    }),
  };
}

test('without an SA key only TMDB loads availability and coverage', async () => {
  const tmdb = countedSource('tmdb');
  const sa = countedSource('sa');
  const registry = createSources({
    sources: [tmdb.source, sa.source],
    isEnabled: ({ id }) => id === 'tmdb',
  });
  const { mode, snapshots, coverage } = await registry.loadAvailability(fakeTitle);
  assert.equal(mode, 'tmdbOnly');
  assert.deepEqual(snapshots.map(({ source }) => source), ['tmdb']);
  assert.equal(coverage.tmdb.status, 'fresh');
  assert.equal(tmdb.calls.availability, 1);
  assert.deepEqual(sa.calls, { search: 0, availability: 0, coverage: 0 });
});

test('both availability calls start before either settles and SA errors degrade to TMDB only', async () => {
  const controller = new AbortController();
  const error = new Error('SA failed');
  const tmdb = countedSource('tmdb');
  const enabled = tmdb.source.getAvailability;
  let finishTmdb;
  tmdb.source.getAvailability = async (title, { signal }) => {
    assert.equal(signal, controller.signal);
    await new Promise((resolve) => { finishTmdb = resolve; });
    return enabled(title, { signal });
  };
  let saCalls = 0;
  const sa = fakeSource('sa', {
    async getAvailability(title, { signal }) {
      assert.equal(title, fakeTitle);
      assert.equal(signal, controller.signal);
      saCalls++;
      throw error;
    },
  });
  const registry = createSources({ sources: [tmdb.source, sa] });
  const loading = registry.loadAvailability(fakeTitle, { signal: controller.signal });
  assert.equal(saCalls, 1);
  finishTmdb();
  const { mode, snapshots } = await loading;
  assert.equal(mode, 'tmdbOnly');
  assert.equal(snapshots[0].status, 'empty');
  assert.equal(snapshots[1].status, 'unavailable');
  assert.equal(snapshots[1].error, error);
});

test('IMDb disagreement removes SA offers and preserves the not-found response', async () => {
  const tmdb = countedSource('tmdb').source;
  const sa = fakeSource('sa');
  const base = await sa.getAvailability();
  const offer = { country: 'fr', serviceKey: 'netflix' };
  const registry = createSources({ sources: [tmdb, sa] });
  for (const imdbId of ['tt9999999', fakeTitle.imdbId, null]) {
    sa.getAvailability = async () => ({ ...base, status: 'offers', offers: [offer], imdbId });
    const result = await registry.loadAvailability({ ...fakeTitle, imdbId: null });
    const mismatch = imdbId === 'tt9999999';
    assert.equal(result.mode, mismatch ? 'tmdbOnly' : 'full');
    assert.equal(result.snapshots[1].status, mismatch ? 'notFound' : 'offers');
    assert.deepEqual(result.snapshots[1].offers, mismatch ? [] : [offer]);
  }
});

test('an IMDb ID from the selection cannot stand in for a failed TMDB details response', async () => {
  const tmdb = fakeSource('tmdb');
  const tmdbSnapshot = await tmdb.getAvailability();
  tmdb.getAvailability = async (title) => ({
    ...tmdbSnapshot, status: 'unavailable', imdbId: null, title,
  });
  const sa = fakeSource('sa');
  const saSnapshot = await sa.getAvailability();
  sa.getAvailability = async () => ({ ...saSnapshot, imdbId: 'tt9999999' });
  const registry = createSources({ sources: [tmdb, sa] });

  const { snapshots } = await registry.loadAvailability(fakeTitle);
  assert.equal(snapshots[1].status, saSnapshot.status);
});

test('coverage expires after seven days, falls back with its original date, and is unknown without history', async () => {
  const start = Date.UTC(2026, 10, 20);
  let time = start;
  const entries = new Map();
  const cache = createCache({
    now: () => time,
    storage: {
      get length() { return entries.size; },
      key: (index) => [...entries.keys()][index],
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key),
    },
  });
  const tmdb = countedSource('tmdb');
  const registry = createSources({ sources: [tmdb.source], cache, now: () => time });
  const fetchedAt = new Date(start).toISOString();
  const fresh = { status: 'fresh', countries: ['fr'], fetchedAt };
  assert.deepEqual((await registry.loadAvailability(fakeTitle)).coverage.tmdb, fresh);
  time += TTL_BY_KIND.metadata - 1;
  assert.deepEqual((await registry.loadAvailability(fakeTitle)).coverage.tmdb, fresh);
  assert.equal(tmdb.calls.coverage, 1);

  time++;
  tmdb.source.listCoveredCountries = () => { throw new Error('Coverage refresh failed'); };
  const stale = await registry.loadAvailability(fakeTitle);
  assert.deepEqual(stale.coverage.tmdb, { ...fresh, status: 'stale' });
  assert.equal(stale.snapshots[0].coveredCountries, 1);

  cache.clear();
  const unknown = await registry.loadAvailability(fakeTitle);
  assert.deepEqual(unknown.coverage.tmdb, { status: 'unknown' });
  assert.equal(unknown.snapshots[0].coveredCountries, null);
  const reconciled = reconcile({ ...unknown, serviceKey: 'netflix' });
  assert.equal(computeVerdict({ ...unknown, reconciled, serviceKey: 'netflix' }).count, null);
});

test('100 searches without selection make zero SA calls', async () => {
  const tmdb = countedSource('tmdb');
  const sa = countedSource('sa');
  const registry = createSources({ sources: [tmdb.source, sa.source] });
  for (let index = 0; index < 100; index++) {
    assert.deepEqual(await registry.searchTitles(`Godfather ${index}`), { titles: [fakeTitle], error: null });
  }
  assert.deepEqual(tmdb.calls, { search: 100, availability: 0, coverage: 0 });
  assert.deepEqual(sa.calls, { search: 0, availability: 0, coverage: 0 });
});

function checkArrays(node, file) {
  if (node.type === 'ArrayExpression') {
    const codes = node.elements.filter((element) => {
      const value = element?.type === 'TemplateLiteral' && element.expressions.length === 0
        ? element.quasis[0].value.cooked : element?.value;
      return typeof value === 'string' && /^[a-z]{2}$/i.test(value);
    });
    assert.ok(codes.length <= 20, `${file}:${node.loc.start.line} contains ${codes.length} country codes`);
  }

  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child?.type) checkArrays(child, file);
    }
  }
}

test('src contains no array with more than 20 country codes', () => {
  const src = new URL('../src/', import.meta.url);
  for (const file of readdirSync(src, { recursive: true })) {
    if (!/\.[cm]?js$/.test(file)) continue;
    const code = readFileSync(new URL(file, src), 'utf8');
    checkArrays(parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true }), file);
  }
});
