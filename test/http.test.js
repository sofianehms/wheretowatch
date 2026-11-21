import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError, isQuotaExhausted, request } from '../src/api/http.js';

const dummyKey = 'fake-key-for-tests';
const url = `https://example.test/catalog?filter=${dummyKey}#fragment`;
const headers = { Authorization: `Bearer ${dummyKey}` };

function response(status, body = {}, headers = {}) {
  return Response.json(body, { status, headers });
}

function expectError(type, status) {
  return (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.type, type);
    assert.equal(error.status, status);
    assert.ok(error.message.includes('example.test/catalog'));
    for (const privateValue of [dummyKey, 'Authorization', 'Bearer', 'filter=', 'fragment', 'https://']) {
      assert.ok(!error.message.includes(privateValue));
    }
    assert.equal(error.cause, undefined);
    return true;
  };
}

test('returns JSON and forwards headers with an internal signal', async () => {
  const caller = new AbortController();
  const data = await request(url, {
    headers,
    signal: caller.signal,
    fetchImpl: async (target, options) => {
      assert.equal(target, url);
      assert.equal(options.headers, headers);
      assert.notEqual(options.signal, caller.signal);
      return response(200, { title: 'Example' });
    },
  });
  assert.deepEqual(data, { title: 'Example' });
});

for (const [status, type] of [[401, 'auth'], [403, 'auth'], [404, 'notFound'], [500, 'server']]) {
  test(`maps HTTP ${status} to ${type}`, async () => {
    await assert.rejects(request(url, {
      headers, fetchImpl: async () => response(status, { message: dummyKey }),
    }), expectError(type, status));
  });
}

test('makes exactly one request when retry is disabled', async () => {
  let calls = 0;
  await assert.rejects(request(url, {
    headers,
    retryOn429: false,
    fetchImpl: async () => {
      calls++;
      return response(429, {}, { 'Retry-After': '2' });
    },
  }), expectError('rateLimited', 429));
  assert.equal(calls, 1);
});

for (const [retryAfter, expected] of [
  ['2', 2000], ['120', 10000], [new Date(5000).toUTCString(), 5000],
  ['invalid', 0], [undefined, 0],
]) {
  test(`retries once with Retry-After ${retryAfter}`, async (t) => {
    t.mock.method(Date, 'now', () => 0);
    const events = [];
    const data = await request(url, {
      headers,
      retryOn429: true,
      fetchImpl: async () => {
        events.push('fetch');
        if (events.length > 1) return response(200, ['ok']);
        return new Response('Too many requests', {
          status: 429, headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter },
        });
      },
      sleep: async (ms) => { events.push(ms); },
    });
    assert.deepEqual(events, ['fetch', expected, 'fetch']);
    assert.deepEqual(data, ['ok']);
  });
}

test('stops after a second 429, using the default sleep', async () => {
  let calls = 0;
  await assert.rejects(request(url, {
    retryOn429: true,
    fetchImpl: async () => {
      calls++;
      return response(429);
    },
  }), expectError('rateLimited', 429));
  assert.equal(calls, 2);
});

const quotaFixtures = [
  [429, {}, { message: 'Your monthly quota has been exceeded' }, true],
  [429, {}, 'Your monthly quota has been exceeded.', true],
  [429, { 'Retry-After': '2' }, { message: 'Too many requests' }, false],
  [429, { 'Retry-After': '2' }, { message: 'Monthly quota reached? No. Slow down and retry.' }, false],
  [403, {}, { message: 'Your monthly quota has been exceeded' }, false],
  [429, {}, null, false],
];

test('distinguishes quota fixtures from ordinary rate limiting', async () => {
  for (const [status, fields, body, exhausted] of quotaFixtures) {
    assert.equal(isQuotaExhausted(status, new Headers(fields), body), exhausted);
  }
  let calls = 0;
  await assert.rejects(request(url, {
    retryOn429: true,
    fetchImpl: async () => {
      calls++;
      return response(429, quotaFixtures[0][2]);
    },
  }), expectError('quota', 429));
  assert.equal(calls, 1);
  await assert.rejects(request(url, {
    fetchImpl: async () => new Response(quotaFixtures[1][2], { status: 429 }),
  }), expectError('quota', 429));
});

test('retries a temporary 429 that mentions quota', async () => {
  const [, fields, body] = quotaFixtures[3];
  let calls = 0;
  const waits = [];
  const data = await request(url, {
    retryOn429: true,
    fetchImpl: async () => ++calls === 1 ? response(429, body, fields) : response(200, ['ok']),
    sleep: async (ms) => { waits.push(ms); },
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]);
  assert.deepEqual(data, ['ok']);
});

test('reports network failures without surfacing the fetch exception', async () => {
  await assert.rejects(request(url, {
    headers,
    fetchImpl: async () => { throw new TypeError(`Failed to fetch ${url}`); },
  }), expectError('network'));
});

test('returns offline without attempting a fetch', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  });
  const fetchImpl = t.mock.fn();
  await assert.rejects(request(url, { fetchImpl }), expectError('offline'));
  assert.equal(fetchImpl.mock.callCount(), 0);
});

for (const stage of ['fetch', 'body']) {
  test(`aborts a stalled ${stage} at the 10-second cap with a mocked clock`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let active;
    const stalled = new Promise(() => {});
    const pending = request(url, {
      timeoutMs: stage === 'fetch' ? 12_000 : undefined,
      fetchImpl: async (_, options) => {
        active = options.signal;
        return stage === 'fetch' ? stalled : { ok: true, json: () => stalled };
      },
    });
    const check = assert.rejects(pending, expectError('timeout'));
    await Promise.resolve();
    t.mock.timers.tick(9999);
    assert.equal(active.aborted, false);
    t.mock.timers.tick(1);
    await check;
    assert.equal(active.aborted, true);
  });
}

test('honors a shorter configured timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const pending = request(url, {
    timeoutMs: 25,
    fetchImpl: (_, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  const check = assert.rejects(pending, expectError('timeout'));
  t.mock.timers.tick(24);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await check;
});

for (const retryAfter of ['10', '120']) {
  test(`starts a fresh attempt after Retry-After ${retryAfter}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const signals = [];
    const pending = request(url, {
      retryOn429: true,
      fetchImpl: (_, { signal }) => {
        signals.push(signal);
        return new Promise((resolve) => {
          if (signals.length === 1) {
            setTimeout(() => resolve(response(429, {}, { 'Retry-After': retryAfter })), 1000);
          }
        });
      },
    });
    const check = assert.rejects(pending, expectError('timeout'));
    t.mock.timers.tick(1000);
    await new Promise(setImmediate);
    t.mock.timers.tick(9999);
    await new Promise(setImmediate);
    assert.equal(signals.length, 1);
    t.mock.timers.tick(1);
    await new Promise(setImmediate);
    assert.equal(signals.length, 2);
    assert.notEqual(signals[0], signals[1]);
    t.mock.timers.tick(9999);
    assert.equal(signals[1].aborted, false);
    t.mock.timers.tick(1);
    await check;
    assert.equal(signals[0].aborted, false);
    assert.equal(signals[1].aborted, true);
  });
}

test('reports cancellation before and during fetch without exposing the reason', async (t) => {
  const controller = new AbortController();
  const fetchImpl = t.mock.fn(() => new Promise(() => {}));
  const pending = request(url, { signal: controller.signal, fetchImpl });
  controller.abort(dummyKey);
  await assert.rejects(pending, expectError('aborted'));
  assert.equal(fetchImpl.mock.calls[0].arguments[1].signal.aborted, true);
  await assert.rejects(request(url, { signal: controller.signal, fetchImpl }), expectError('aborted'));
  assert.equal(fetchImpl.mock.callCount(), 1);
});

test('cancels during the retry wait', async (t) => {
  const controller = new AbortController();
  const fetchImpl = t.mock.fn(async () => response(429));
  let startWait;
  const waiting = new Promise((resolve) => { startWait = resolve; });
  const pending = request(url, {
    retryOn429: true,
    signal: controller.signal,
    fetchImpl,
    sleep: () => {
      startWait();
      return new Promise(() => {});
    },
  });
  await waiting;
  controller.abort(dummyKey);
  await assert.rejects(pending, expectError('aborted'));
  assert.equal(fetchImpl.mock.callCount(), 1);
});

test('recognizes an uppercase plain-text quota response without retrying', async (t) => {
  const fetchImpl = t.mock.fn(async () => new Response(quotaFixtures[1][2], {
    status: 429,
    headers: { 'Content-Type': 'TEXT/PLAIN; charset=UTF-8' },
  }));
  await assert.rejects(request(url, { retryOn429: true, fetchImpl }), expectError('quota', 429));
  assert.equal(fetchImpl.mock.callCount(), 1);
});

test('cancels the second attempt', async () => {
  const controller = new AbortController();
  let startRetry;
  const retryStarted = new Promise((resolve) => { startRetry = resolve; });
  let calls = 0;
  const pending = request(url, {
    signal: controller.signal,
    retryOn429: true,
    sleep: async () => {},
    fetchImpl: async (_, { signal }) => {
      if (++calls === 1) return response(429);
      startRetry(signal);
      return new Promise(() => {});
    },
  });
  const retrySignal = await retryStarted;
  controller.abort(dummyKey);
  await assert.rejects(pending, expectError('aborted'));
  assert.equal(retrySignal.aborted, true);
  assert.equal(calls, 2);
});
