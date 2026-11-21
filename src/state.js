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
  const snapshots = new WeakSet();
  let state = freezeCopy({ ...initial }, snapshots);
  const listeners = new Set();
  const pending = [];

  return {
    get() {
      return state;
    },
    set(patch) {
      const previous = pending.at(-1) ?? state;
      const next = { ...previous, ...patch };
      if (Reflect.ownKeys(next).every((key) =>
        Object.hasOwn(previous, key) && Object.is(next[key], previous[key]))) return;

      // Publish nested updates in order after the current notification finishes.
      pending.push(freezeCopy(next, snapshots));
      if (pending.length > 1) return;

      try {
        for (let index = 0; index < pending.length; index++) {
          state = pending[index];
          for (const listener of [...listeners]) listener(state);
        }
      } finally {
        pending.length = 0;
      }
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

// State data consists of primitives, arrays, and plain records.
function freezeCopy(value, snapshots, copies = new WeakMap()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
  if (snapshots.has(value)) return value;
  if (copies.has(value)) return copies.get(value);

  const prototype = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  if (!isArray && (typeof value === 'function' || (prototype !== Object.prototype && prototype !== null))) {
    throw new TypeError('State values must be primitives, arrays, or plain records.');
  }

  const copy = isArray ? new Array(value.length) : Object.create(prototype);
  copies.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    if (isArray && key === 'length') continue;
    Object.defineProperty(copy, key, {
      value: freezeCopy(value[key], snapshots, copies),
      enumerable: Object.prototype.propertyIsEnumerable.call(value, key),
    });
  }
  snapshots.add(copy);
  return Object.freeze(copy);
}
