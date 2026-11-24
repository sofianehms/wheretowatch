import { createCache, TTL_BY_KIND } from './cache.js';
import { HttpError, request } from './http.js';
import { country, offerType, serviceKey } from '../core/normalize.js';
import { getLocale as appLocale } from '../i18n/strings.js';
import { coverageKeys } from './sources.js';

const baseUrl = 'https://api.themoviedb.org/3/';
const source = 'tmdb';
const providerGroups = ['flatrate', 'free', 'ads', 'rent', 'buy'];

function normalizeProviders(results) {
  const offers = [];
  const countries = new Set();
  for (const [code, region] of Object.entries(results)) {
    const normalizedCountry = country(code);
    if (!normalizedCountry) continue;
    countries.add(normalizedCountry);
    for (const group of providerGroups) {
      for (const provider of region[group] ?? []) {
        const service = serviceKey(source, provider.provider_id, provider.provider_name);
        if (!service) continue;
        offers.push({
          country: normalizedCountry,
          serviceKey: service.key,
          serviceName: provider.provider_name,
          serviceLogoPath: provider.logo_path ?? null,
          offerType: offerType(source, group),
          source,
          link: region.link ?? null,
          quality: null,
          expiresOn: null,
          languages: [],
        });
      }
    }
  }
  return { offers, coveredCountries: countries.size };
}

function toTitle(result) {
  const movie = result.media_type === 'movie';
  const date = movie ? result.release_date : result.first_air_date;
  const year = /^\d{4}(?=-|$)/.exec(date ?? '');
  const tmdbId = result.id ?? null;
  return {
    mediaType: result.media_type,
    tmdbId,
    imdbId: null,
    title: movie ? result.title : result.name,
    year: year ? Number(year[0]) : null,
    posterPath: result.poster_path ?? null,
    ref: tmdbId === null ? null : `${result.media_type}/${tmdbId}`,
  };
}

/** @returns {import('./sources.js').Source & {getImageConfiguration: () => Promise<object|null>}} */
export function createTmdbSource({
  http = request, cache = createCache(), getToken, getLocale = appLocale, now = Date.now,
}) {
  // Region and configuration data lives for seven days in the persistent cache; when the browser refuses
  // to store it, it is kept for the current visit instead so that the quota is not spent again.
  const sessionMemo = new Map();
  const recall = (key) => cache.get(key) ?? sessionMemo.get(key);
  function remember(key, value, meta) {
    cache.set(key, value, meta);
    if (!cache.get(key)) sessionMemo.set(key, { value, fetchedAt: now() });
  }

  async function get(endpoint, params, signal, token = getToken()) {
    if (!token) throw new HttpError('auth');
    const url = new URL(endpoint, baseUrl);
    url.search = new URLSearchParams(params).toString();
    if (url.href.includes(token) || /api_key/i.test(url.href)) {
      throw new HttpError('auth');
    }
    return http(url.href, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
      // A Retry-After above the shared wait budget (10 s) is reported as a rate-limit error instead of freezing
      // the search screen; the search screen then tells the user when to try again.
      retryOn429: 'within-budget',
    });
  }

  async function loadTitleData(key, kind, load) {
    const cached = cache.get(key);
    if (cached) return cached.value;
    const value = await load();
    cache.set(key, value, { kind, source });
    return value;
  }

  return {
    id: source,
    capabilities: { search: true, availability: true, languages: false, instantSearch: true },

    async searchTitles(query, { signal } = {}) {
      if (signal?.aborted) throw new HttpError('aborted');
      const text = query.trim().replace(/\s+/g, ' ');
      if (!text) return [];
      const token = getToken() ?? null;
      if (token && (query.includes(token) || text.includes(token))) throw new HttpError('auth');
      const language = getLocale();
      const key = JSON.stringify([source, 'search', language, text.toLocaleLowerCase(language)]);
      const cached = cache.get(key);
      if (cached) return cached.value;
      const { results } = await get('search/multi', { query: text, language, include_adult: 'false' }, signal, token);
      const titles = results
        .filter(({ media_type }) => media_type === 'movie' || media_type === 'tv')
        .slice(0, 8)
        .map(toTitle);
      cache.set(key, titles, { kind: 'suggestions', source });
      return titles;
    },

    async listCoveredCountries({ signal } = {}) {
      const key = coverageKeys.tmdb;
      const fresh = cache.get(key);
      if (fresh) return fresh.value;
      const cached = sessionMemo.get(key);
      if (cached && now() - cached.fetchedAt < TTL_BY_KIND.metadata) return cached.value;
      const { results } = await get('watch/providers/regions', undefined, signal);
      const countries = results.map(({ iso_3166_1 }) => iso_3166_1.toLowerCase());
      remember(key, countries, { kind: 'metadata', source });
      return countries;
    },

    async getImageConfiguration() {
      const key = 'tmdb.configuration';
      const cached = recall(key);
      if (cached) return cached.value;
      try {
        const { images } = await get('configuration');
        if (!images) return null;
        remember(key, images, { kind: 'config', source });
        return images;
      } catch (error) {
        if (error instanceof HttpError) return null;
        throw error;
      }
    },

    async getAvailability(title, { signal } = {}) {
      const { mediaType, tmdbId } = title;
      const snapshot = {
        source,
        title,
        imdbId: null,
        status: 'notFound',
        fetchedAt: new Date(now()).toISOString(),
        coveredCountries: null,
        offers: [],
        error: null,
      };
      if (signal?.aborted) {
        return { ...snapshot, status: 'unavailable', error: new HttpError('aborted') };
      }
      if (!['movie', 'tv'].includes(mediaType) || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
        return snapshot;
      }

      const ref = `${mediaType}/${tmdbId}`;
      const missingKey = `tmdb.notFound.${ref}`;
      const missing = cache.get(missingKey);
      if (missing) {
        const { fetchedAt, details } = missing.value;
        return {
          ...snapshot,
          fetchedAt,
          imdbId: details?.imdbId ?? null,
          title: details ? { ...title, ref, imdbId: details.imdbId } : title,
        };
      }

      const [details, providers] = await Promise.allSettled([
        loadTitleData(`tmdb.details.${ref}`, 'metadata', async () => {
          const data = await get(ref, { append_to_response: 'external_ids' }, signal);
          return { imdbId: data.external_ids?.imdb_id ?? null };
        }),
        loadTitleData(`tmdb.providers.${ref}`, 'availability', async () => {
          const { results } = await get(`${ref}/watch/providers`, undefined, signal);
          if (!results || typeof results !== 'object' || Array.isArray(results)) {
            throw new HttpError('server');
          }
          return { ...normalizeProviders(results), fetchedAt: new Date(now()).toISOString() };
        }),
      ]);
      if (details.status === 'fulfilled') {
        snapshot.imdbId = details.value.imdbId;
        snapshot.title = { ...title, ref, imdbId: details.value.imdbId };
      }
      if (signal?.aborted) {
        return { ...snapshot, status: 'unavailable', error: new HttpError('aborted') };
      }
      const failures = [details, providers].filter(({ status }) => status === 'rejected');
      // Technical failures take precedence so a mixed failure can be retried immediately.
      const technicalFailure = failures.find(({ reason }) => reason?.type !== 'notFound');
      if (technicalFailure) {
        const { reason } = technicalFailure;
        const error = reason instanceof HttpError ? reason : new HttpError('server');
        return { ...snapshot, status: 'unavailable', error };
      }
      if (failures.length) {
        cache.set(missingKey, {
          fetchedAt: snapshot.fetchedAt,
          details: details.status === 'fulfilled' ? details.value : null,
        }, { kind: 'availability', source });
        return snapshot;
      }
      return {
        ...snapshot,
        ...providers.value,
        status: providers.value.offers.length ? 'offers' : 'empty',
      };
    },
  };
}
