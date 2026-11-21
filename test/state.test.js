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
  const initial = { query: '' };
  const store = createStore(initial);
  const snapshot = store.get();

  assert.throws(() => {
    snapshot.query = 'Arrival';
  }, TypeError);
  initial.query = 'Alien';
  assert.equal(store.get().query, '');
});
