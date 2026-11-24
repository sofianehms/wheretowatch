import { country, offerType, serviceKey } from '../core/normalize.js';
import { createCache } from './cache.js';
import { canUseStale, HttpError, request } from './http.js';
import { coverageKeys } from './sources.js';

const baseUrl = 'https://api.movieofthenight.com/v4/';
const source = 'sa';

function tracks(entries, kind) {
  return (entries ?? []).flatMap((entry) => {
    const { language, region } = entry.locale ?? entry;
    if (!language) return [];
    return [{ kind, language, region: region ?? null, closedCaptions: entry.closedCaptions === true }];
  });
}

function normalizeOffers(options) {
  return Object.entries(options ?? {}).flatMap(([code, entries]) => {
    const normalizedCountry = country(code);
    if (!normalizedCountry) return [];
    return entries.flatMap((entry) => {
      const service = serviceKey(source, entry.service?.id, entry.service?.name);
      const type = offerType(source, entry.type);
      if (!service || !type) return [];
      const expiry = new Date(entry.expiresOn * 1000);
      return [{
        country: normalizedCountry,
        serviceKey: service.key,
        serviceName: entry.service.name ?? service.name,
        serviceId: entry.service.id,
        serviceLogoPath: null,
        offerType: type,
        source,
        link: entry.link ?? null,
        quality: entry.quality ?? null,
        expiresOn: entry.expiresOn && Number.isFinite(expiry.getTime()) ? expiry.toISOString() : null,
        languages: [...tracks(entry.audios, 'audio'), ...tracks(entry.subtitles, 'subtitle')],
      }];
    });
  });
}

function snapshot(status, { offers = [], imdbId = null, error = null } = {}) {
  return { source, status, fetchedAt: new Date().toISOString(), coveredCountries: null, offers, imdbId, error };
}

/** @returns {import('./sources.js').Source} */
export function createStreamingSource({ http = request, cache = createCache(), quota, getKey }) {
  const pending = new Map();

  function cachedRequest(key, load) {
    const cached = cache.get(key);
    if (cached) return Promise.resolve(cached.value);
    if (pending.has(key)) return pending.get(key);
    const result = Promise.resolve().then(load).finally(() => pending.delete(key));
    pending.set(key, result);
    return result;
  }

  async function get(endpoint, { signal, onRequest } = {}) {
    if (!quota.canCall()) throw new HttpError('quota');
    const key = getKey();
    const url = baseUrl + endpoint;
    if (!key || url.includes(key)) throw new HttpError('auth');
    if (signal?.aborted) throw new HttpError('aborted');
    if (globalThis.navigator?.onLine === false) throw new HttpError('offline');

    quota.record();
    onRequest?.();
    try {
      return await http(url, {
        headers: { 'X-API-Key': key },
        signal,
        retryOn429: false,
        redirect: 'error',
        onResponse: (headers) => quota.sync?.(headers),
      });
    } catch (error) {
      if (error.type !== 'quota' && error.type !== 'rateLimited') throw error;
      quota.markExhausted();
      throw new HttpError('quota', undefined, error.status);
    }
  }

  return {
    id: source,
    capabilities: { search: false, availability: true, languages: true, instantSearch: false },

    async getAvailability(title, { signal } = {}) {
      const ref = title.ref;
      if (!/^(movie|tv)\/[1-9]\d*$/.test(ref ?? '')) return snapshot('notFound');
      if (signal?.aborted) return snapshot('unavailable', { error: new HttpError('aborted') });

      const key = `sa.shows.${ref}`;
      const failureKey = `${key}.failure`;
      async function load() {
        const failure = cache.get(failureKey);
        if (failure) return failure.value;
        let dispatched = false;
        let result;
        try {
          const show = await get(`shows/${ref}`, { signal, onRequest: () => { dispatched = true; } });
          const offers = normalizeOffers(show.streamingOptions);
          result = snapshot(offers.length ? 'offers' : 'empty', { offers, imdbId: show.imdbId ?? null });
        } catch (error) {
          const type = error.type ?? 'server';
          result = type === 'notFound'
            ? snapshot('notFound')
            : snapshot('unavailable', { error: { type, status: error.status } });
        }
        // Keep the call cooldown without replacing the last usable data on a failed refresh.
        if (dispatched) {
          cache.set(result.error ? failureKey : key, result, { kind: 'availability', source });
        }
        return result;
      }
      const value = quota.canCall()
        ? await cachedRequest(key, load)
        : snapshot('unavailable', { error: { type: 'quota' } });
      if (value.error?.type === 'quota' || canUseStale(value.error)) {
        const last = cache.getStale(key);
        if (last && last.value.status !== 'unavailable') {
          return {
            ...last.value,
            stale: true,
            reason: value.error.type === 'quota' ? 'quota' : 'error',
          };
        }
      }
      return value.error
        ? { ...value, error: new HttpError(value.error.type, undefined, value.error.status) }
        : value;
    },

    listCoveredCountries({ signal } = {}) {
      const key = coverageKeys.sa;
      return cachedRequest(key, async () => {
        const countries = Object.keys(await get('countries', { signal })).map(country).filter(Boolean);
        cache.set(key, countries, { kind: 'config', source });
        return countries;
      });
    },
  };
}
