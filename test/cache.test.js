import assert from 'node:assert/strict';
import test from 'node:test';
import { createCache, TTL_BY_KIND } from '../src/api/cache.js';

const day = 86_400_000;
const prefix = 'wtw.cache.';
const metadata = { kind: 'metadata', source: 'tmdb' };

function fixture() {
  const data = new Map();
  const storage = {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const clock = { time: 0 };
  const options = { storage, now: () => clock.time };
  return { cache: createCache(options), storage, clock, options };
}

for (const [kind, ttl] of Object.entries({
  availability: day,
  metadata: 7 * day,
  config: 7 * day,
  suggestions: 600_000,
})) {
  test(`NFR-010: ${kind} expires after ${ttl} ms and preserves fetchedAt in getStale`, () => {
    const { cache, clock } = fixture();
    clock.time = 5;
    cache.set('key', false, { kind, source: 'tmdb' });
    assert.equal(TTL_BY_KIND[kind], ttl);
    clock.time += ttl - 1;
    assert.deepEqual(cache.get('key'), { value: false, kind, source: 'tmdb', fetchedAt: 5, stale: false });
    clock.time++;
    assert.equal(cache.get('key'), null);
    assert.deepEqual(cache.getStale('key'), { value: false, kind, source: 'tmdb', fetchedAt: 5, stale: true });
    assert.equal(cache.getStale('missing'), null);
  });
}

test('NFR-010: suggestions stay in memory and persisted metadata survives a new instance', () => {
  const { cache, storage, options } = fixture();
  cache.set('lookup', ['a'], { kind: 'suggestions' });
  assert.equal(storage.length, 0);
  assert.equal(cache.stats().entries, 1);
  assert.equal(createCache(options).get('lookup'), null);
  cache.set('lookup', 'persisted', metadata);
  assert.equal(createCache(options).get('lookup').value, 'persisted');
  cache.set('lookup', ['b'], { kind: 'suggestions' });
  assert.equal(storage.length, 0);
  assert.deepEqual(cache.get('lookup').value, ['b']);
});

test('NFR-010: persist at most 200 entries and evict the oldest fetchedAt', () => {
  const { cache, clock, storage } = fixture();
  for (let index = 0; index < 201; index++) {
    clock.time = index === 50 ? -1 : index;
    cache.set(String(index), index, metadata);
  }
  assert.equal(storage.length, 200);
  assert.equal(cache.stats().entries, 200);
  assert.equal(cache.get('50'), null);
  assert.equal(cache.get('0').value, 0);
  cache.set('0', 'updated', metadata);
  assert.equal(cache.get('0').value, 'updated');
  assert.equal(cache.get('1').value, 1);
});

test('NFR-010: keep persisted size strictly below 2 MB at two bytes per character', () => {
  const { cache, storage, clock } = fixture();
  cache.set('old', 'é'.repeat(600_000), metadata);
  clock.time++;
  cache.set('new', 'x'.repeat(600_000), metadata);
  assert.equal(cache.get('old'), null);
  const key = prefix + 'new';
  const raw = storage.getItem(key);
  const bytes = 2 * (key.length + raw.length);
  assert.deepEqual(cache.stats(), { entries: 1, bytes });
  assert.ok(bytes < 2_000_000);
  cache.set('new', 'x'.repeat(600_000 + (2_000_000 - bytes) / 2), metadata);
  assert.equal(storage.getItem(key), raw);
});

test('NFR-010: quota failure evicts the oldest entry and retries once', () => {
  const { cache, storage, clock } = fixture();
  cache.set('old', 1, metadata);
  clock.time++;
  cache.set('keep', 2, metadata);
  const write = storage.setItem;
  let attempts = 0;
  storage.setItem = (key, value) => {
    if (++attempts === 1) throw new DOMException('Full', 'QuotaExceededError');
    write(key, value);
  };
  cache.set('new', 3, metadata);
  assert.equal(attempts, 2);
  assert.equal(cache.get('old'), null);
  assert.equal(cache.get('keep').value, 2);
  assert.equal(cache.get('new').value, 3);
});

test('NFR-010: an always-full storage never throws from set and stops after two attempts', () => {
  const { cache, storage } = fixture();
  let attempts = 0;
  storage.setItem = () => {
    attempts++;
    throw new DOMException('Full', 'QuotaExceededError');
  };
  assert.doesNotThrow(() => cache.set('key', 1, metadata));
  assert.equal(attempts, 2);
  assert.equal(cache.getStale('key'), null);
});

test('NFR-010: TMDB is purged after six calendar months even on a stale read', () => {
  const { cache, storage, clock } = fixture();
  clock.time = Date.UTC(2025, 7, 31);
  cache.set('stale', 1, metadata);
  cache.set('fresh', 2, metadata);
  cache.set('suggestion', 3, { ...metadata, kind: 'suggestions' });
  cache.set('sa', 4, { ...metadata, source: 'sa' });
  clock.time = Date.UTC(2026, 1, 28);
  assert.equal(cache.getStale('stale').stale, true);
  clock.time++;
  assert.equal(cache.getStale('stale'), null);
  assert.equal(cache.get('fresh'), null);
  assert.equal(cache.getStale('suggestion'), null);
  assert.equal(storage.getItem(prefix + 'stale'), null);
  assert.equal(storage.getItem(prefix + 'fresh'), null);
  assert.equal(cache.getStale('sa').value, 4);
});

test('NFR-010 and FR-026: clear both levels without touching keys outside the prefix', () => {
  const { storage, options } = fixture();
  const cache = createCache({ ...options, prefix: 'custom.' });
  storage.setItem(prefix + 'other', 'other');
  storage.setItem('unrelated', 'keep');
  cache.set('one', 1, metadata);
  cache.set('two', 2, metadata);
  cache.set('search', [], { kind: 'suggestions' });
  cache.clear();
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
  assert.equal(cache.get('search'), null);
  assert.equal(storage.length, 2);
  assert.equal(storage.getItem(prefix + 'other'), 'other');
  assert.equal(storage.getItem('unrelated'), 'keep');
});

test('invalid entries and unwritable values are cache misses', () => {
  const { cache, storage } = fixture();
  storage.setItem(prefix + 'corrupt', '{');
  assert.equal(cache.get('corrupt'), null);
  cache.set('unsupported', 1, { kind: 'toString' });
  cache.set('undefined', undefined, metadata);
  cache.set('bigint', 1n, metadata);
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
});

test('blocked storage does not throw, and suggestions still work in memory', () => {
  const blocked = () => { throw new DOMException('Blocked', 'SecurityError'); };
  const cache = createCache({ storage: {
    get length() { return blocked(); },
    getItem: blocked,
    setItem: blocked,
    removeItem: blocked,
  } });
  cache.set('metadata', 1, metadata);
  assert.equal(cache.getStale('metadata'), null);
  cache.set('search', [], { kind: 'suggestions' });
  assert.deepEqual(cache.get('search').value, []);
  cache.clear();
  assert.equal(cache.get('search'), null);
});
