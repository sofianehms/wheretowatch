import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { clearErrors, MAX_ERRORS, recentErrors, recordError } from '../src/api/diagnostics.js';
import { request } from '../src/api/http.js';

const key = 'dummy-key-123';
const respond = (status) => async () => new Response('{}', { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(clearErrors);

test('the buffer starts empty', async () => {
  // A separate module instance, untouched by the hooks and the other tests.
  const fresh = await import('../src/api/diagnostics.js?fresh');
  assert.deepEqual(fresh.recentErrors(), []);
});

test('the buffer keeps the last 20 errors, newest first', () => {
  for (let index = 1; index <= MAX_ERRORS + 5; index += 1) {
    recordError({ type: 'server', url: `https://api.example/item/${index}`, date: index });
  }
  const errors = recentErrors();
  assert.equal(MAX_ERRORS, 20);
  assert.equal(errors.length, 20);
  assert.equal(errors[0].path, '/item/25');
  assert.equal(errors.at(-1).path, '/item/6');
});

test('only the type, host, path and date are recorded', () => {
  recordError({ type: 'auth', url: `https://user:${key}@api.example/3/search?api_key=${key}&query=dune#${key}`, date: 7 });
  assert.deepEqual(recentErrors(), [{ type: 'auth', host: 'api.example', path: '/3/search', date: 7 }]);
});

test('a malformed or non-web address records no endpoint', () => {
  recordError({ type: 'network', url: `http://[${key}` });
  recordError({ type: 'network', url: `data:text/plain,${key}` });
  assert.ok(!JSON.stringify(recentErrors()).includes(key));
  assert.deepEqual(recentErrors().map(({ host, path }) => host + path), ['', '']);
});

test('a failed request is reported without its key or parameters', async () => {
  await assert.rejects(request(`https://api.example/3/configuration?api_key=${key}`, {
    headers: { Authorization: `Bearer ${key}` }, fetchImpl: respond(401),
  }));
  await assert.rejects(request('https://api.example/3/movie/1', {
    fetchImpl: async () => { throw new Error(key); },
  }));
  assert.deepEqual(recentErrors().map(({ type, path }) => [type, path]), [['network', '/3/movie/1'], ['auth', '/3/configuration']]);
  assert.ok(!JSON.stringify(recentErrors()).includes(key));
  assert.ok(!JSON.stringify(recentErrors()).includes('api_key'));
});

test('successful and cancelled requests are not reported', async () => {
  await request('https://api.example/ok', { fetchImpl: respond(200) });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(request('https://api.example/cancelled', { signal: controller.signal, fetchImpl: respond(200) }));
  assert.deepEqual(recentErrors(), []);
});

const throttled = () => new Response('{}', { status: 429, headers: { 'Content-Type': 'application/json' } });
const retry = { retryOn429: true, sleep: async () => {} };
const types = () => recentErrors().map(({ type }) => type);

// Responses are served in order, one per attempt.
const sequence = (...steps) => async () => steps.shift()();

test('a rate limit recovered by the retry is still reported', async () => {
  const fetchImpl = sequence(throttled, () => new Response('{"ok":true}'));
  assert.deepEqual(await request(`https://api.example/3/search?api_key=${key}`, { ...retry, fetchImpl }), { ok: true });
  assert.deepEqual(recentErrors().map(({ type, path }) => [type, path]), [['rateLimited', '/3/search']]);
});

test('each failed attempt is reported once', async () => {
  const fetchImpl = sequence(throttled, () => new Response('{}', { status: 500 }));
  await assert.rejects(request('https://api.example/twice', { ...retry, fetchImpl }), { type: 'server' });
  assert.deepEqual(types(), ['server', 'rateLimited']);
});

test('a rate limit that is not retried is reported once', async () => {
  await assert.rejects(request('https://api.example/once', { fetchImpl: sequence(throttled) }), { type: 'rateLimited' });
  assert.deepEqual(types(), ['rateLimited']);
});

test('a rate limit stays reported when the retry wait is cancelled or fails', async () => {
  const controller = new AbortController();
  await assert.rejects(request('https://api.example/cancelled-wait', {
    retryOn429: true, signal: controller.signal, fetchImpl: sequence(throttled), sleep: async () => controller.abort(),
  }), { type: 'aborted' });
  assert.deepEqual(types(), ['rateLimited']);

  clearErrors();
  await assert.rejects(request('https://api.example/broken-wait', {
    retryOn429: true, fetchImpl: sequence(throttled), sleep: async () => { throw new Error(key); },
  }), { type: 'network' });
  assert.deepEqual(types(), ['network', 'rateLimited']);
});

test('timeouts and offline attempts are reported', async (t) => {
  await assert.rejects(request('https://api.example/slow', {
    timeoutMs: 1, fetchImpl: () => new Promise(() => {}),
  }), { type: 'timeout' });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  await assert.rejects(request('https://api.example/offline'), { type: 'offline' });
  assert.deepEqual(types(), ['offline', 'timeout']);
});
