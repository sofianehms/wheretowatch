const minute = 60_000;
const day = 24 * 60 * minute;
const maxEntries = 200;
const maxBytes = 2_000_000;

export const TTL_BY_KIND = Object.freeze({
  availability: day,
  metadata: 7 * day,
  config: 7 * day,
  suggestions: 10 * minute,
});

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function sizeOf(key, serialized) {
  return 2 * (key.length + serialized.length);
}

function decode(serialized) {
  if (serialized == null) return null;
  try {
    const entry = JSON.parse(serialized);
    if (entry && Object.hasOwn(TTL_BY_KIND, entry.kind) &&
        Object.hasOwn(entry, 'value') && Number.isFinite(entry.fetchedAt)) {
      return entry;
    }
  } catch {
    // Corrupt entries are cache misses.
  }
  return null;
}

function pastRetention(entry, time) {
  if (entry.source !== 'tmdb') return false;
  const cutoff = new Date(entry.fetchedAt);
  const dayOfMonth = cutoff.getUTCDate();
  cutoff.setUTCMonth(cutoff.getUTCMonth() + 6, 1);
  const endOfMonth = new Date(cutoff);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
  cutoff.setUTCDate(Math.min(dayOfMonth, endOfMonth.getUTCDate()));
  return time > cutoff.getTime();
}

export function createCache({ storage = browserStorage(), now = Date.now, prefix = 'wtw.cache.' } = {}) {
  const suggestions = new Map();

  function read(key) {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function remove(key) {
    try {
      storage?.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function storedKeys() {
    const keys = [];
    try {
      for (let index = 0; index < (storage?.length ?? 0); index++) {
        const key = storage.key(index);
        if (key?.startsWith(prefix)) keys.push(key);
      }
    } catch {
      // Storage may be unavailable or blocked.
    }
    return keys;
  }

  function storedEntries(time) {
    const entries = [];
    for (const key of storedKeys()) {
      const serialized = read(key);
      if (serialized === null) continue;
      const entry = decode(serialized);
      if (!entry || entry.kind === 'suggestions' || pastRetention(entry, time)) {
        if (remove(key)) continue;
      }
      entries.push({ key, bytes: sizeOf(key, serialized), fetchedAt: entry?.fetchedAt ?? -Infinity });
    }
    return entries;
  }

  function getStale(key) {
    const time = now();
    const storageKey = prefix + key;
    const memory = suggestions.get(key);
    const entry = decode(memory ?? read(storageKey));
    if (!entry) return null;
    if (pastRetention(entry, time) || (memory === undefined && entry.kind === 'suggestions')) {
      if (memory === undefined) remove(storageKey);
      else suggestions.delete(key);
      return null;
    }
    return { ...entry, stale: time - entry.fetchedAt >= TTL_BY_KIND[entry.kind] };
  }

  function get(key) {
    const entry = getStale(key);
    return entry && !entry.stale ? entry : null;
  }

  function set(key, value, { kind, source }) {
    if (!Object.hasOwn(TTL_BY_KIND, kind)) return;
    const fetchedAt = now();
    const storageKey = prefix + key;
    let serialized;
    try {
      serialized = JSON.stringify({ value, kind, source, fetchedAt });
    } catch {
      return;
    }
    if (!decode(serialized)) return;

    if (kind === 'suggestions') {
      if (read(storageKey) !== null && !remove(storageKey)) return;
      suggestions.set(key, serialized);
      return;
    }

    const bytes = sizeOf(storageKey, serialized);
    if (!storage || bytes >= maxBytes) return;
    const others = storedEntries(fetchedAt)
      .filter((entry) => entry.key !== storageKey)
      .sort((first, second) => first.fetchedAt - second.fetchedAt);
    let total = bytes + others.reduce((sum, entry) => sum + entry.bytes, 0);
    while (others.length >= maxEntries || total >= maxBytes) {
      const oldest = others.shift();
      if (!remove(oldest.key)) return;
      total -= oldest.bytes;
    }

    try {
      storage.setItem(storageKey, serialized);
    } catch (error) {
      if (error?.name !== 'QuotaExceededError') return;
      const oldest = others.shift();
      if (oldest && !remove(oldest.key)) return;
      try {
        storage.setItem(storageKey, serialized);
      } catch {
        return;
      }
    }
    suggestions.delete(key);
  }

  /** Names of the persisted entries, to be read back with `getStale`. */
  function keys() {
    return storedKeys().map((key) => key.slice(prefix.length));
  }

  function clear() {
    suggestions.clear();
    for (const key of storedKeys()) remove(key);
  }

  function stats() {
    const entries = storedEntries(now());
    let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    for (const [key, serialized] of suggestions) bytes += sizeOf(key, serialized);
    return { entries: entries.length + suggestions.size, bytes };
  }

  return { get, getStale, set, keys, clear, stats };
}
