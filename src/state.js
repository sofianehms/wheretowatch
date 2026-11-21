export const initialState = Object.freeze({
  query: '',
  suggestions: Object.freeze([]),
  searchStatus: 'idle',
  selected: null,
  availability: null,
  availabilityStatus: 'idle',
  mode: 'offline',
  banners: Object.freeze([]),
  settingsOpen: false,
});

export function createStore(initial = initialState) {
  let state = Object.freeze({ ...initial });
  const listeners = new Set();

  return {
    get() {
      return state;
    },
    set(patch) {
      const next = { ...state, ...patch };
      if (Reflect.ownKeys(next).every((key) => Object.is(next[key], state[key]))) return;

      // Nested values are shared. Replace them through set() when they change.
      const snapshot = Object.freeze(next);
      state = snapshot;
      for (const listener of [...listeners]) listener(snapshot);
    },
    subscribe(listener) {
      const subscription = (snapshot) => listener(snapshot);
      listeners.add(subscription);
      return () => {
        listeners.delete(subscription);
      };
    },
  };
}
