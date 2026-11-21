import { request } from './http.js';

const tmdbConfiguration = 'https://api.themoviedb.org/3/configuration';
const saCountries = 'https://api.movieofthenight.com/v4/countries';

async function checkKey(url, headers, { fetchImpl = globalThis.fetch, signal, timeoutMs }, quota) {
  try {
    await request(url, {
      headers,
      signal,
      timeoutMs,
      fetchImpl(target, options) {
        // Count the attempt when dispatched, even if it fails or times out.
        quota?.record();
        return fetchImpl(target, { ...options, cache: 'no-store', redirect: 'error' });
      },
    });
    return 'valid';
  } catch (error) {
    switch (error.type) {
      case 'auth': return 'invalid';
      case 'quota': return 'quota';
      case 'timeout': return 'timeout';
      default: return 'network';
    }
  }
}

export function checkTmdbKey(token, deps = {}) {
  return checkKey(tmdbConfiguration, { Authorization: `Bearer ${token}` }, deps);
}

export async function checkSaKey(key, { quota, ...deps }) {
  if (!quota.canCall()) return 'quota';
  return checkKey(saCountries, { 'X-API-Key': key }, deps, quota);
}
