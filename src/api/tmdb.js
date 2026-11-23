import { createCache } from './cache.js';
import { HttpError, request } from './http.js';
import { getLocale as appLocale } from '../i18n/strings.js';

const baseUrl = 'https://api.themoviedb.org/3/';
const source = 'tmdb';

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
  http = request, cache = createCache(), getToken, getLocale = appLocale,
}) {
  // Region and configuration data lives for seven days in the persistent cache; when the browser refuses
  // to store it, it is kept for the current visit instead so that the quota is not spent again.
  const sessionMemo = new Map();
  const recall = (key) => cache.get(key) ?? sessionMemo.get(key);
  function remember(key, value, meta) {
    cache.set(key, value, meta);
    if (!cache.get(key)) sessionMemo.set(key, { value });
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

  return {
    id: source,
    capabilities: { search: true, availability: false, languages: false, instantSearch: true },

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

    async listCoveredCountries() {
      const key = 'tmdb.regions';
      const cached = recall(key);
      if (cached) return cached.value;
      const { results } = await get('watch/providers/regions');
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

    async getAvailability() {
      throw new Error('not implemented');
    },
  };
}
