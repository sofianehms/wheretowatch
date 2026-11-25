import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { clearErrors, MAX_ERRORS, recentErrors, recordError } from '../src/api/diagnostics.js';
import { request } from '../src/api/http.js';

const key = 'dummy-key-123';
const respond = (status) => async () => new Response('{}', { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(clearErrors);

test('the buffer starts empty', () => {
  assert.deepEqual(recentErrors(), []);
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
