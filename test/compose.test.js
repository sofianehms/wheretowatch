import test from 'node:test';
import assert from 'node:assert/strict';

import { compose } from '../src/compose.js';

function fakeStorage() {
  const entries = new Map();
  return {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (name) => entries.get(name) ?? null,
    setItem: (name, value) => void entries.set(name, String(value)),
    removeItem: (name) => void entries.delete(name),
  };
}

test('compose builds the services around one storage', () => {
  const storage = fakeStorage();
  const app = compose({ storage, navigatorLike: { language: 'en-GB' } });
  for (const name of ['store', 'cache', 'quota', 'settings', 'sources', 'checkKey']) assert.ok(app[name], name);
  assert.equal(app.store.get().settingsOpen, false);
  assert.equal(app.quotaLimit(), 1000);
  assert.equal(app.sources.searchSource, null);

  app.settings.setKey('tmdb', 'token');
  assert.equal(storage.getItem('wtw.key.tmdb'), 'token');
});

test('clearing data removes every wtw. entry, including the quota counter', () => {
  const storage = fakeStorage();
  const app = compose({ storage, navigatorLike: { language: 'en-GB' } });
  app.settings.setKey('tmdb', 'token');
  app.settings.setKey('sa', 'key');
  app.settings.setPref('theme', 'light');
  app.quota.record();
  storage.setItem('other.entry', 'kept');
  assert.ok(storage.getItem('wtw.quota'));

  app.settings.clearAll();

  const remaining = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  assert.deepEqual(remaining, ['other.entry']);
});

test('checkKey sends the Streaming Availability test through the quota', async () => {
  const storage = fakeStorage();
  const app = compose({ storage, navigatorLike: { language: 'en-GB' } });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: { ...options.headers } });
    return new Response('{}', { status: 200 });
  };
  assert.equal(await app.checkKey('sa', 'key', { fetchImpl }), 'valid');
  assert.equal(app.quota.status().used, 1);
  assert.equal(await app.checkKey('tmdb', 'token', { fetchImpl }), 'valid');
  assert.equal(app.quota.status().used, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.movieofthenight.com/v4/countries');
  assert.equal(calls[0].headers['X-API-Key'], 'key');
  assert.equal(calls[1].url, 'https://api.themoviedb.org/3/configuration');
  assert.equal(calls[1].headers.Authorization, 'Bearer token');
  assert.equal(calls[1].headers['X-API-Key'], undefined);
});
