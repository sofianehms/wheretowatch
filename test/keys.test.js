import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createCache } from '../src/api/cache.js';
import { createQuota } from '../src/api/quota.js';
import { createSettings } from '../src/settings/keys.js';

function fixture() {
  const data = new Map();
  const storage = {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => data.set(name, String(value)),
    removeItem: (name) => data.delete(name),
  };
  return { data, storage };
}

test('keys and preferences use the app prefix and support reading and removal', () => {
  const { data, storage } = fixture();
  const settings = createSettings({ storage });
  for (const provider of ['tmdb', 'sa']) {
    const value = randomUUID();
    assert.equal(settings.hasKey(provider), false);
    settings.setKey(provider, value);
    assert.equal(data.has(`wtw.key.${provider}`), true);
    assert.equal(settings.getKey(provider) === value, true);
    assert.equal(settings.hasKey(provider), true);
    settings.removeKey(provider);
    assert.equal(settings.getKey(provider), null);
  }

  for (const [name, value] of Object.entries({ country: 'ca', service: 'example', theme: 'light', lang: 'fr' })) {
    settings.setPref(name, value);
    assert.equal(data.get(`wtw.${name}`), value);
    assert.equal(settings.getPref(name), value);
  }
  settings.setPref('service', null);
  assert.equal(settings.getPref('service'), null);
});

test('theme uses the wtw.theme storage name specified for early theme boot', () => {
  const { storage } = fixture();
  const settings = createSettings({ storage });
  storage.setItem('wtw.theme', 'auto');
  assert.equal(settings.getPref('theme'), 'auto');
  settings.setPref('theme', 'light');
  assert.equal(storage.getItem('wtw.theme'), 'light');
});

test('defaults use the locale region, with US as fallback', () => {
  const { storage } = fixture();
  for (const [language, country] of [['fr-FR', 'fr'], ['en', 'us'], ['zh-Hant-TW', 'tw'], ['invalid_locale', 'us']]) {
    const settings = createSettings({ storage, navigatorLike: { language } });
    assert.equal(settings.getPref('country'), country);
    assert.equal(settings.getPref('service'), null);
    assert.equal(settings.getPref('theme'), 'dark');
    assert.equal(settings.getPref('lang'), null);
  }
});

test('storage read errors fall back to missing keys and preference defaults', () => {
  const storage = { get getItem() { throw new Error('Storage denied'); } };
  const settings = createSettings({ storage, navigatorLike: { language: 'fr-FR' } });
  assert.equal(settings.getKey('tmdb'), null);
  assert.equal(settings.hasKey('sa'), false);
  assert.equal(settings.getPref('country'), 'fr');
  assert.equal(settings.getPref('service'), null);
  assert.equal(settings.getPref('theme'), 'dark');
  assert.equal(settings.getPref('lang'), null);
});

test('a write error does not expose the supplied value or the original error', () => {
  const value = randomUUID();
  const storage = { setItem: (_, attemptedValue) => { throw new Error(attemptedValue); } };
  const settings = createSettings({ storage });
  assert.throws(() => settings.setKey('tmdb', value), (error) => {
    assert.equal(error.message, 'Could not save settings.');
    assert.equal(error.cause, undefined);
    assert.equal(error.stack.includes(value), false);
    return true;
  });
});

test('persistence is requested once after saving a key and rejection does not affect the save', async () => {
  const { storage } = fixture();
  let requests = 0;
  const navigatorLike = { storage: { async persist() {
    requests += 1;
    throw new Error('Persistence denied');
  } } };
  const settings = createSettings({ storage, navigatorLike });
  settings.setPref('theme', 'auto');
  assert.equal(requests, 0);
  settings.setKey('tmdb', randomUUID());
  settings.setKey('sa', randomUUID());
  await Promise.resolve();
  assert.equal(requests, 1);
  assert.equal(settings.hasKey('tmdb'), true);
  assert.equal(settings.hasKey('sa'), true);
});

test('clearAll removes all app entries, clears in-memory cache, and resets quota', (t) => {
  const { data, storage } = fixture();
  const cache = createCache({ storage });
  const quota = createQuota({ storage });
  const reset = t.mock.method(quota, 'reset');
  const settings = createSettings({ storage, cache, quota });
  settings.setKey('tmdb', randomUUID());
  settings.setKey('sa', randomUUID());
  settings.setPref('theme', 'light');
  storage.setItem('wtw.older-entry', 'old');
  storage.setItem('unrelated', 'keep');
  cache.set('title', [], { kind: 'metadata', source: 'tmdb' });
  cache.set('search', [], { kind: 'suggestions' });
  quota.record();
  quota.markExhausted();

  settings.clearAll();

  assert.deepEqual([...data.keys()], ['unrelated']);
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
  assert.equal(reset.mock.callCount(), 1);
  assert.equal(quota.status().used, 0);
  assert.equal(quota.canCall(), true);
});

test('clearAll removes every app entry even when removal reorders the keys', () => {
  const { data, storage } = fixture();
  storage.removeItem = (name) => {
    if (!data.delete(name)) return;
    const rest = [...data].reverse();
    data.clear();
    for (const [key, value] of rest) data.set(key, value);
  };
  const settings = createSettings({ storage });
  for (const name of ['wtw.key.tmdb', 'wtw.review', 'wtw.a', 'wtw.b', 'other.review']) storage.setItem(name, 'x');

  settings.clearAll();

  assert.deepEqual([...data.keys()], ['other.review']);
});

test('clearAll removes other app entries when one removal fails', () => {
  const { data, storage } = fixture();
  const removeItem = storage.removeItem;
  storage.removeItem = (name) => {
    if (name === 'wtw.old') throw new Error('Removal denied');
    removeItem(name);
  };
  const settings = createSettings({ storage });
  settings.setKey('tmdb', randomUUID());
  storage.setItem('wtw.old', 'old');
  settings.setPref('theme', 'light');
  storage.setItem('unrelated', 'keep');

  assert.throws(() => settings.clearAll(), { message: 'Could not clear all settings.' });
  assert.deepEqual([...data.keys()], ['wtw.old', 'unrelated']);
});
