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

/**
 * Store primitives, arrays, and plain records as immutable snapshots.
 * Shallow equality uses Object.is against each field's input and snapshot.
 * A subscriber's set() queues an update for after the current notification.
 * The outer set() rethrows a subscriber error after draining the queue,
 * or throws an AggregateError if multiple subscriber calls failed.
 */
export function createStore(initial = initialState) {
  const snapshots = new WeakSet();
  const inputs = { ...initial };
  let current = { inputs, snapshot: freezeCopy(inputs, snapshots) };
  const listeners = new Set();
  const pending = [];

  return {
    get() {
      return current.snapshot;
    },
    set(patch) {
      const previous = pending.at(-1) ?? current;
      const values = { ...patch };
      const changed = Reflect.ownKeys(values).filter((key) =>
        !Object.hasOwn(previous.snapshot, key) ||
        (!Object.is(values[key], previous.inputs[key]) &&
          !Object.is(values[key], previous.snapshot[key])));
      if (changed.length === 0) return;

      const nextInputs = { ...previous.inputs };
      const next = { ...previous.snapshot };
      for (const key of changed) {
        const descriptor = Object.getOwnPropertyDescriptor(values, key);
        Object.defineProperty(nextInputs, key, descriptor);
        Object.defineProperty(next, key, descriptor);
      }

      // Publish nested updates in order after the current notification finishes.
      pending.push({ inputs: nextInputs, snapshot: freezeCopy(next, snapshots) });
      if (pending.length > 1) return;

      const errors = [];
      try {
        for (let index = 0; index < pending.length; index++) {
          current = pending[index];
          for (const listener of [...listeners]) {
            try {
              listener(current.snapshot);
            } catch (error) {
              errors.push(error);
            }
          }
        }
      } finally {
        pending.length = 0;
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, 'State subscribers failed.');
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
