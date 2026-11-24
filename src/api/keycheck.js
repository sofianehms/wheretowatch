import { request } from './http.js';

const tmdbConfiguration = 'https://api.themoviedb.org/3/configuration';
const saCountries = 'https://api.movieofthenight.com/v4/countries';

/**
 * @typedef {object} KeyCheckDeps
 * @property {typeof fetch} [fetchImpl] Fetch implementation. Defaults to global fetch.
 * @property {AbortSignal} [signal] Cancellation signal. Cancellation resolves to 'network'.
 * @property {number} [timeoutMs] Timeout in milliseconds, up to 10 seconds.
 */

/** @typedef {'valid' | 'invalid' | 'network' | 'quota' | 'timeout'} KeyCheckResult */

async function checkKey(url, headers, { fetchImpl = globalThis.fetch, signal, timeoutMs }, quota) {
  try {
    await request(url, {
      headers,
      signal,
      timeoutMs,
      onResponse: quota && ((headers) => quota.sync?.(headers)),
      fetchImpl(target, options) {
        // Count the attempt when dispatched, even if it fails or times out.
        quota?.record();
        return fetchImpl(target, { ...options, cache: 'no-store', redirect: 'error' });
      },
    });
    return 'valid';
  } catch (error) {
    if (error.type === 'quota' || error.type === 'rateLimited') quota?.markExhausted?.();
    switch (error.type) {
      case 'auth': return 'invalid';
      case 'quota': return 'quota';
      case 'timeout': return 'timeout';
      default: return 'network';
    }
  }
}

/**
 * @param {string} token TMDB bearer token.
 * @param {KeyCheckDeps} [deps]
 * @returns {Promise<KeyCheckResult>}
 */
export function checkTmdbKey(token, deps = {}) {
  return checkKey(tmdbConfiguration, { Authorization: `Bearer ${token}` }, deps);
}

/**
 * @param {string} key Streaming Availability API key.
 * @param {KeyCheckDeps & {quota: ReturnType<typeof import('./quota.js').createQuota>}} deps
 * The quota is required. A quota storage failure resolves to 'network'.
 * @returns {Promise<KeyCheckResult>}
 */
export async function checkSaKey(key, { quota, ...deps }) {
  try {
    if (!quota.canCall()) return 'quota';
    return await checkKey(saCountries, { 'X-API-Key': key }, deps, quota);
  } catch {
    return 'network';
  }
}
