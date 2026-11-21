import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSaKey, checkTmdbKey } from '../src/api/keycheck.js';
import saQuota from './fixtures/sa/quota-exhausted.js';

const dummyKey = 'fake-key-for-tests';
const providers = [
  {
    name: 'TMDB',
    check: checkTmdbKey,
    url: 'https://api.themoviedb.org/3/configuration',
    headers: { Authorization: `Bearer ${dummyKey}` },
    records: 0,
  },
  {
    name: 'Streaming Availability',
    check: checkSaKey,
    url: 'https://api.movieofthenight.com/v4/countries',
    headers: { 'X-API-Key': dummyKey },
    records: 1,
  },
];

for (const { name, check, url, headers, records } of providers) {
  for (const [result, status, body] of [
    ['valid', 200, { message: dummyKey }],
    ['invalid', 401, { message: dummyKey }],
    ['invalid', 403, { message: dummyKey }],
    ['network', 429, { message: dummyKey }],
    ['network'],
    ['quota', 429, saQuota],
    ['timeout'],
  ]) {
    test(`${name} returns ${result}${status ? ` for HTTP ${status}` : ''}`, async (t) => {
      if (result === 'timeout') t.mock.timers.enable({ apis: ['setTimeout'] });
      const quota = { canCall: () => true, record: t.mock.fn() };
      const fetchImpl = t.mock.fn(async () => {
        if (status) return Response.json(body, { status });
        if (result === 'timeout') return new Promise(() => {});
        throw new TypeError(dummyKey);
      });

      const pending = check(dummyKey, { quota, fetchImpl, timeoutMs: 25 });
      if (result === 'timeout') t.mock.timers.tick(25);

      const outcome = await pending;
      assert.equal(outcome, result);
      assert.ok(!outcome.includes(dummyKey));
      assert.equal(fetchImpl.mock.callCount(), 1);
      const [target, options] = fetchImpl.mock.calls[0].arguments;
      assert.equal(target, url);
      assert.ok(!target.includes(dummyKey));
      assert.deepEqual(options.headers, headers);
      assert.equal(options.method ?? 'GET', 'GET');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.redirect, 'error');
      assert.equal(quota.record.mock.callCount(), records);
    });
  }
}

test('a blocked Streaming Availability check neither fetches nor records', async (t) => {
  const quota = { canCall: () => false, record: t.mock.fn() };
  const fetchImpl = t.mock.fn();

  assert.equal(await checkSaKey(dummyKey, { quota, fetchImpl }), 'quota');
  assert.equal(fetchImpl.mock.callCount(), 0);
  assert.equal(quota.record.mock.callCount(), 0);
});

test('an offline Streaming Availability check does not spend quota', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  });
  const quota = { canCall: () => true, record: t.mock.fn() };

  assert.equal(await checkSaKey(dummyKey, { quota }), 'network');
  assert.equal(globalThis.fetch.mock.callCount(), 0);
  assert.equal(quota.record.mock.callCount(), 0);
});
