import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore, initialState } from '../src/state.js';

test('the default store has an idle application state', () => {
  assert.deepEqual(createStore().get(), {
    query: '',
    suggestions: [],
    searchStatus: 'idle',
    selected: null,
    availability: null,
    availabilityStatus: 'idle',
    mode: 'offline',
    banners: [],
    settingsOpen: false,
  });
});

test('a changed patch is shallowly merged and published once', () => {
  const store = createStore(initialState);
  const previous = store.get();
  const notifications = [];
  store.subscribe((state) => notifications.push(state));

  store.set({ query: 'Arrival', searchStatus: 'loading' });

  assert.deepEqual(store.get(), { ...previous, query: 'Arrival', searchStatus: 'loading' });
  assert.strictEqual(store.get().suggestions, previous.suggestions);
  assert.equal(previous.query, '');
  assert.equal(notifications.length, 1);
  assert.strictEqual(notifications[0], store.get());
});

test('an unchanged patch preserves the snapshot without notifying', () => {
  const store = createStore({ query: '', suggestions: [], score: NaN });
  const snapshot = store.get();
  let calls = 0;
  store.subscribe(() => calls++);

  store.set({});
  store.set({ query: '', suggestions: snapshot.suggestions, score: NaN });

  assert.equal(calls, 0);
  assert.strictEqual(store.get(), snapshot);
});

test('an undefined value adds an own property and notifies only once', () => {
  const store = createStore({});
  const notifications = [];
  store.subscribe((state) => notifications.push(state));

  store.set({ extra: undefined });
  store.set({ extra: undefined });

  assert.deepEqual(notifications, [{ extra: undefined }]);
  assert.ok(Object.hasOwn(store.get(), 'extra'));
});

test('reapplying the original array and record references preserves the snapshot', () => {
  const store = createStore();
  const patch = { suggestions: [{ id: 1 }], selected: { id: 1 } };
  const notifications = [];
  store.subscribe((snapshot) => notifications.push(snapshot));

  store.set(patch);
  const snapshot = store.get();
  store.set(patch);
  store.set({ ...patch, searchStatus: 'results' });

  assert.equal(notifications.length, 2);
  assert.strictEqual(notifications[0], snapshot);
  assert.strictEqual(store.get().suggestions, snapshot.suggestions);
  assert.strictEqual(store.get().selected, snapshot.selected);

  store.set({ suggestions: [{ id: 1 }] });
  assert.equal(notifications.length, 3);
  assert.notStrictEqual(store.get().suggestions, snapshot.suggestions);
});

test('updates from listeners are published in order after the current notification', () => {
  const store = createStore();
  const received = [];
  const patch = { query: 'second', suggestions: [{ id: 1 }] };
  store.subscribe(({ query }) => {
    if (query !== 'first') return;
    store.set(patch);
    patch.suggestions[0].id = 2;
    store.set({ searchStatus: 'results' });
  });
  store.subscribe((snapshot) => {
    assert.strictEqual(snapshot, store.get());
    received.push([snapshot.query, snapshot.searchStatus]);
  });

  store.set({ query: 'first' });

  assert.deepEqual(received, [
    ['first', 'idle'],
    ['second', 'idle'],
    ['second', 'results'],
  ]);
  assert.deepEqual(store.get().suggestions, [{ id: 1 }]);
});

test('a subscriber error surfaces after all subscribers receive accepted updates', () => {
  const store = createStore();
  const failure = new Error('Subscriber failed');
  const received = [];
  store.subscribe(({ searchStatus }) => {
    if (searchStatus !== 'loading') return;
    store.set({ searchStatus: 'results' });
    assert.equal(store.get().searchStatus, 'loading');
    throw failure;
  });
  store.subscribe(({ searchStatus }) => received.push(searchStatus));

  assert.throws(() => store.set({ searchStatus: 'loading' }), (error) => error === failure);
  assert.equal(store.get().searchStatus, 'results');
  assert.deepEqual(received, ['loading', 'results']);

  store.set({ searchStatus: 'idle' });
  assert.deepEqual(received, ['loading', 'results', 'idle']);
});

test('multiple subscriber failures are reported in notification order', () => {
  const store = createStore();
  const first = new Error('First subscriber failed');
  const second = new Error('Second subscriber failed');
  store.subscribe(() => { throw first; });
  store.subscribe(() => { throw second; });

  assert.throws(() => store.set({ query: 'Arrival' }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [first, second]);
    return true;
  });
});

test('unsubscribing removes only the corresponding subscription', () => {
  const store = createStore();
  const queries = [];
  const listener = ({ query }) => queries.push(query);
  const unsubscribe = store.subscribe(listener);
  store.subscribe(listener);

  store.set({ query: 'Arrival' });
  unsubscribe();
  unsubscribe();
  store.set({ query: 'Alien' });

  assert.deepEqual(queries, ['Arrival', 'Arrival', 'Alien']);
});

test('get returns a frozen snapshot detached from the initial object', () => {
  const initial = { query: '', selected: { id: 1 } };
  const store = createStore(initial);
  const snapshot = store.get();

  assert.throws(() => {
    snapshot.query = 'Arrival';
  }, TypeError);
  initial.query = 'Alien';
  initial.selected.id = 2;
  assert.equal(store.get().query, '');
  assert.deepEqual(store.get().selected, { id: 1 });
  assert.ok(Object.isFrozen(snapshot.selected));
});

test('nested state is frozen and detached from the patch', () => {
  const store = createStore();
  const patch = { suggestions: [{ id: 1 }] };
  const notifications = [];
  store.subscribe((snapshot) => notifications.push(snapshot));
  store.set(patch);
  const snapshot = store.get();

  assert.throws(() => snapshot.suggestions.push({ id: 2 }), TypeError);
  assert.throws(() => {
    snapshot.suggestions[0].id = 2;
  }, TypeError);
  patch.suggestions[0].id = 3;
  patch.suggestions.push({ id: 4 });

  assert.deepEqual(snapshot.suggestions, [{ id: 1 }]);
  assert.strictEqual(store.get(), snapshot);
  assert.equal(notifications.length, 1);
  assert.strictEqual(notifications[0], snapshot);
});
