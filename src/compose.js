// Composition root: the only module outside src/api/ that may import the source clients.
import { createCache } from './api/cache.js';
import { checkSaKey, checkTmdbKey } from './api/keycheck.js';
import { createQuota } from './api/quota.js';
import { createSources } from './api/sources.js';
import { createSettings } from './settings/keys.js';
import { createStore } from './state.js';

function browserStorage() {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

// Used when the browser refuses storage, so the app still runs for the current visit.
function memoryStorage() {
  const entries = new Map();
  return {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (name) => entries.get(name) ?? null,
    setItem: (name, value) => void entries.set(name, String(value)),
    removeItem: (name) => void entries.delete(name),
  };
}

/**
 * Build the application services once, at startup.
 * @param {object} [options]
 * @param {Storage} [options.storage]
 * @param {Navigator} [options.navigatorLike]
 * @param {import('./api/sources.js').Source[]} [options.adapters] Source adapters for the configured keys.
 * @param {() => number} [options.now]
 */
export function compose({
  storage = browserStorage() ?? memoryStorage(),
  navigatorLike = globalThis.navigator,
  adapters = [],
  now = Date.now,
} = {}) {
  const store = createStore();
  const cache = createCache({ storage, now });
  const quota = createQuota({ storage, now });
  const settings = createSettings({ storage, navigatorLike, cache, quota });
  const sources = createSources({ sources: adapters });

  /** Test a key without saving it. Resolves to a key check result. */
  function checkKey(provider, value, deps = {}) {
    return provider === 'sa' ? checkSaKey(value, { ...deps, quota }) : checkTmdbKey(value, deps);
  }

  return {
    store,
    cache,
    quota,
    settings,
    sources,
    checkKey,
    quotaLimit: () => quota.status().limit,
  };
}
