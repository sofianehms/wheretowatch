import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../src/api/http.js';
import { createTypeahead } from '../src/core/typeahead.js';

function setup(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = t.mock.timers;
  const timers = { setTimeout: t.mock.fn(setTimeout), clearTimeout: t.mock.fn(clearTimeout) };
  const calls = [];
  const states = [];
  const controller = createTypeahead({
    search(query, { signal }) {
      return new Promise((resolve, reject) => calls.push({ query, signal, resolve, reject }));
    },
    onState: (state) => states.push(state),
    timers,
    ...options,
  });
  return { ...controller, calls, states, timers, tick: (ms) => clock.tick(ms) };
}

test('one character after trimming stays idle', (t) => {
  const { input, tick, calls, states } = setup(t);
  input(' a ');
  tick(1000);
  assert.equal(calls.length, 0);
  assert.deepEqual(states, [{ status: 'idle' }]);
});

test('ten keystrokes in 180 ms produce one search after 275 ms of silence', async (t) => {
  const { input, tick, calls, states } = setup(t);
  const query = 'Interstellar';
  for (let length = 1; length <= 10; length += 1) {
    if (length > 1) tick(20);
    input(query.slice(0, length));
  }
  tick(274);
  assert.equal(calls.length, 0);
  tick(1);
  assert.deepEqual(calls.map((call) => call.query), ['Interstell']);
  assert.deepEqual(states.at(-1), { status: 'loading', query: 'Interstell' });
  calls[0].resolve([{ title: query }]);
  await Promise.resolve();
  assert.deepEqual(states.at(-1), {
    status: 'results', query: 'Interstell', titles: [{ title: query }],
  });
  tick(1000);
  assert.equal(calls.length, 1);
});

test('IME clears pending input and waits for composition to end before settling', (t) => {
  const { input, compositionStart, compositionEnd, submit, tick, calls, timers } = setup(t);
  input('pr');
  compositionStart();
  assert.deepEqual(timers.clearTimeout.mock.calls.map(({ arguments: args }) => args),
    [[timers.setTimeout.mock.calls[0].result]]);
  input('に');
  input('日本');
  submit('日本');
  tick(1000);
  assert.equal(calls.length, 0);
  compositionEnd('日本');
  tick(274);
  assert.equal(calls.length, 0);
  tick(1);
  assert.deepEqual(calls.map(({ query }) => query), ['日本']);
});

test('a settled replacement aborts the prior request and ignores its late response', async (t) => {
  const { input, submit, tick, calls, states } = setup(t);
  submit('old');
  input('new');
  tick(274);
  assert.equal(calls[0].signal.aborted, false);
  tick(1);
  assert.equal(calls[0].signal.aborted, true);
  calls[1].resolve({ titles: [], error: null });
  await Promise.resolve();
  const count = states.length;
  calls[0].resolve([{ title: 'Old title' }]);
  await Promise.resolve();
  assert.equal(states.length, count);
  assert.deepEqual(states.at(-1), { status: 'empty', query: 'new', titles: [] });
});

test('cancel discards the rest of the current IME composition', (t) => {
  const { input, compositionStart, compositionEnd, submit, cancel, tick, calls } = setup(t);
  compositionStart();
  cancel();
  input('日本');
  submit('日本');
  compositionEnd('日本');
  tick(1000);
  assert.equal(calls.length, 0);

  input('日本');
  tick(275);
  assert.deepEqual(calls.map(({ query }) => query), ['日本']);
});

test('submitting an unchanged settled query keeps its original request', async (t) => {
  const { input, submit, tick, calls, states } = setup(t);
  input('dune');
  tick(275);
  submit(' dune ');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal.aborted, false);
  assert.deepEqual(states, [{ status: 'loading', query: 'dune' }]);

  calls[0].resolve([]);
  await Promise.resolve();
  input('dune');
  submit('dune');
  tick(275);
  assert.equal(calls.length, 1);
  assert.deepEqual(states.at(-1), { status: 'empty', query: 'dune', titles: [] });
});

test('an explicit submit retries the same query after an offline error', async (t) => {
  const { input, submit, tick, calls, states } = setup(t);
  const offline = new HttpError('offline');
  submit('dune');
  calls[0].reject(offline);
  await Promise.resolve();

  input(' dune ');
  tick(275);
  assert.equal(calls.length, 1);

  submit(' dune ');
  assert.deepEqual(calls.map(({ query }) => query), ['dune', 'dune']);
  submit('dune');
  const titles = [{ title: 'Dune' }];
  calls[1].resolve(titles);
  await Promise.resolve();
  submit('dune');
  assert.equal(calls.length, 2);
  assert.deepEqual(states, [
    { status: 'loading', query: 'dune' },
    { status: 'error', query: 'dune', error: offline },
    { status: 'loading', query: 'dune' },
    { status: 'results', query: 'dune', titles },
  ]);
});

test('an edit suppresses a stale response even while the replacement is settling', async (t) => {
  const { input, submit, calls, states } = setup(t);
  submit('old');
  input('new');
  calls[0].resolve([{ title: 'Old title' }]);
  await Promise.resolve();
  assert.deepEqual(states, [{ status: 'loading', query: 'old' }]);
});

test('cancel clears the timer, aborts active work and suppresses its rejection', async (t) => {
  const { input, submit, cancel, tick, calls, states, timers } = setup(t);
  submit('old');
  input('new');
  cancel();
  assert.deepEqual(timers.clearTimeout.mock.calls.map(({ arguments: args }) => args),
    [[timers.setTimeout.mock.calls[0].result]]);
  assert.equal(calls[0].signal.aborted, true);
  calls[0].reject(new HttpError('aborted'));
  await Promise.resolve();
  tick(1000);
  assert.equal(calls.length, 1);
  assert.deepEqual(states, [{ status: 'loading', query: 'old' }, { status: 'idle' }]);
});

test('preserves HTTP errors from rejected requests and source router results', async (t) => {
  const { submit, calls, states } = setup(t);
  const offline = new HttpError('offline');
  submit('first');
  calls[0].reject(offline);
  await Promise.resolve();
  assert.deepEqual(states.at(-1), { status: 'error', query: 'first', error: offline });
  assert.equal(states.at(-1).error, offline);

  const rateLimited = new HttpError('rateLimited');
  submit('second');
  calls[1].resolve({ titles: [], error: rateLimited });
  await Promise.resolve();
  assert.deepEqual(states.at(-1), { status: 'error', query: 'second', error: rateLimited });
  assert.equal(states.at(-1).error, rateLimited);
});

test('normalizes unexpected adapter and source router failures to network errors', async (t) => {
  const failure = new TypeError('Unexpected adapter failure');
  const { submit, states } = setup(t, {
    search(query) {
      if (query === 'adapter') throw failure;
      return { titles: [], error: failure };
    },
  });

  for (const query of ['adapter', 'router']) {
    submit(query);
    await Promise.resolve();
    const state = states.at(-1);
    assert.equal(state.status, 'error');
    assert.equal(state.query, query);
    assert.ok(state.error instanceof HttpError);
    assert.equal(state.error.type, 'network');
  }
});

test('submit starts immediately, replaces pending input and respects the configured minimum', (t) => {
  const { input, submit, tick, calls, states, timers } = setup(t, { delayMs: 80, minChars: 3 });
  submit(' 🎬a ');
  assert.deepEqual(states.at(-1), { status: 'idle' });
  input('second');
  tick(79);
  assert.equal(calls.length, 0);
  submit(' second ');
  assert.deepEqual(timers.clearTimeout.mock.calls.map(({ arguments: args }) => args),
    [[timers.setTimeout.mock.calls[0].result]]);
  assert.deepEqual(calls.map(({ query }) => query), ['second']);
  tick(1000);
  assert.equal(calls.length, 1);
});
