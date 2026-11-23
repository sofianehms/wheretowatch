const prefix = 'wtw.';
const providers = ['tmdb', 'sa'];
const preferences = ['country', 'service', 'theme', 'lang'];

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function defaultCountry(navigatorLike) {
  try {
    return new Intl.Locale(navigatorLike.language).region?.toLowerCase() ?? 'us';
  } catch {
    return 'us';
  }
}

function storageName(names, name, segment = '') {
  if (!names.includes(name)) throw new TypeError('Unknown settings name.');
  return prefix + segment + name;
}

/**
 * Preferences use lowercase country codes, service IDs, theme values `dark`,
 * `light`, or `auto`, and language tags for `lang`. Pass `null` to `setPref`
 * to remove the stored preference and restore its default.
 * Writes and removals throw a generic error if storage fails. `clearAll`
 * attempts every removal and throws a generic error if any cleanup fails.
 */
export function createSettings({
  storage = browserStorage(), navigatorLike = globalThis.navigator, cache, quota,
} = {}) {
  const defaults = { country: defaultCountry(navigatorLike), service: null, theme: 'dark', lang: null };
  let persistenceRequested = false;

  function read(name) {
    try {
      return storage?.getItem(name) ?? null;
    } catch {
      return null;
    }
  }

  function write(name, value) {
    try {
      storage.setItem(name, value);
    } catch {
      throw new Error('Could not save settings.');
    }
  }

  function remove(name) {
    try {
      storage.removeItem(name);
    } catch {
      throw new Error('Could not remove settings.');
    }
  }

  async function requestPersistence() {
    try {
      await navigatorLike?.storage?.persist?.();
    } catch {
      // The saved key remains usable without persistent storage.
    }
  }

  function getKey(provider) {
    return read(storageName(providers, provider, 'key.'));
  }

  function clearStorage() {
    let succeeded = true;
    // Snapshot the names first: removing while walking by index skips entries in real storage.
    const names = [];
    for (let index = 0; index < storage.length; index += 1) {
      const name = storage.key(index);
      if (name?.startsWith(prefix)) names.push(name);
    }
    for (const name of names) {
      try {
        storage.removeItem(name);
      } catch {
        succeeded = false;
      }
    }
    return succeeded;
  }

  function clearAll() {
    let failed = false;
    // Reset quota before removing storage entries because reset writes to storage.
    for (const clear of [() => cache?.clear(), () => quota?.reset()]) {
      try {
        clear();
      } catch {
        failed = true;
      }
    }
    try {
      if (!clearStorage()) failed = true;
    } catch {
      failed = true;
    }
    if (failed) throw new Error('Could not clear all settings.');
  }

  return {
    getKey,
    /**
     * Save a key. Pass `{ verified: false }` when the key could not be checked, so Settings
     * still shows that after a reload.
     */
    setKey(provider, value, { verified = true } = {}) {
      write(storageName(providers, provider, 'key.'), value);
      const flag = storageName(providers, provider, 'unverified.');
      if (verified) remove(flag);
      else write(flag, '1');
      if (!persistenceRequested) {
        persistenceRequested = true;
        void requestPersistence();
      }
    },
    removeKey(provider) {
      remove(storageName(providers, provider, 'key.'));
      remove(storageName(providers, provider, 'unverified.'));
    },
    isUnverified: (provider) => Boolean(getKey(provider)) && read(storageName(providers, provider, 'unverified.')) === '1',
    hasKey: (provider) => Boolean(getKey(provider)),
    getPref(name) {
      return read(storageName(preferences, name)) ?? defaults[name];
    },
    setPref(name, value) {
      const key = storageName(preferences, name);
      if (value === null) remove(key);
      else write(key, value);
    },
    clearAll,
  };
}
