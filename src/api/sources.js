import { SOURCE_MODE } from '../config.js';
import { createCache } from './cache.js';
import { HttpError } from './http.js';

/**
 * @typedef {object} Title
 * @property {'movie'|'tv'} mediaType
 * @property {number|null} tmdbId
 * @property {string|null} imdbId
 * @property {string} title
 * @property {number|null} year
 * @property {string|null} posterPath
 * @property {string|null} ref Typed TMDB reference (movie/<id> or tv/<id>), null without a TMDB ID.
 */

/**
 * @typedef {object} LanguageTrack
 * @property {'audio'|'subtitle'} kind
 * @property {string} language Language code.
 * @property {string|null} region Regional variant, when supplied.
 * @property {boolean} closedCaptions
 */

/**
 * @typedef {object} Offer
 * @property {string} country Country code.
 * @property {string} serviceKey
 * @property {string} serviceName
 * @property {number|string} [serviceId] Identifier reported by the source.
 * @property {string|null} serviceLogoPath TMDB logo path, null when absent or from another source.
 * @property {string} offerType
 * @property {string} source Source ID.
 * @property {string|null} link
 * @property {string|null} quality
 * @property {string|null} expiresOn ISO 8601 date or timestamp.
 * @property {LanguageTrack[]} languages
 */

/**
 * @typedef {object} SourceSnapshot
 * @property {string} source Source ID.
 * @property {'offers'|'empty'|'notFound'|'unavailable'} status
 * @property {string} fetchedAt ISO 8601 timestamp.
 * @property {boolean} [stale] Whether the snapshot was served from stale cache.
 * @property {'quota'|'error'} [reason] Reason a stale snapshot was used.
 * @property {number|null} coveredCountries Country count, null when unknown.
 * @property {Offer[]} offers
 * @property {Error|null} error
 * @property {Title} [title] Title with any identifiers resolved by the source.
 * @property {string|null} [imdbId] IMDb identifier reported by the source, when supported.
 */

/**
 * @typedef {object} RequestOptions
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {object} Source
 * @property {'tmdb'|'sa'} id
 * @property {{search: boolean, availability: boolean, languages: boolean, instantSearch: boolean}} capabilities
 * @property {(query: string, options: RequestOptions) => Promise<Title[]>} [searchTitles]
 * @property {(title: Title, options: RequestOptions) => Promise<SourceSnapshot>} getAvailability
 * @property {(options?: RequestOptions) => string[]|Promise<string[]>} listCoveredCountries
 */

export const coverageKeys = Object.freeze({ tmdb: 'tmdb.regions', sa: 'sa.countries' });

// Cache entries of one title, by typed reference: written by the clients, read back without a network.
export const titleKeys = Object.freeze({
  details: (ref) => `tmdb.details.${ref}`,
  providers: (ref) => `tmdb.providers.${ref}`,
  notFound: (ref) => `tmdb.notFound.${ref}`,
  sa: (ref) => `sa.shows.${ref}`,
});

/**
 * @typedef {{status: 'fresh'|'stale', countries: string[], fetchedAt: string} | {status: 'unknown'}} Coverage
 */

/**
 * Select the adapters for the current mode. Composition supplies adapters only
 * for providers with a configured key or checks their key at request time.
 * @param {{sources: Source[], mode?: 'tmdb+sa'|'sa-only', cache?: ReturnType<typeof createCache>, isEnabled?: (source: Source) => boolean, now?: () => number}} options
 */
export function createSources({
  sources, mode = SOURCE_MODE, cache = createCache(), isEnabled = () => true, now = Date.now,
}) {
  const searchId = mode === 'sa-only' ? 'sa' : 'tmdb';
  const activeSources = sources.filter(({ id }) => id === 'sa' || id === searchId);
  const searchSource = activeSources.find(({ id, capabilities }) => id === searchId && capabilities.search);
  const searchError = searchSource ? null : new HttpError('auth');
  const availabilitySources = activeSources.filter(({ capabilities }) => capabilities.availability);

  async function collectAvailability(selected, title, signal) {
    const results = await Promise.allSettled(selected.map(async (source) =>
      source.getAvailability(title, { signal })));
    return results.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        source: selected[index].id,
        status: 'unavailable',
        fetchedAt: new Date(now()).toISOString(),
        coveredCountries: null,
        offers: [],
        error: result.reason,
      };
    });
  }

  return {
    get activeSources() {
      return activeSources.filter(isEnabled);
    },
    searchSource: searchSource ?? null,
    searchError,

    /** @returns {Promise<{titles: Title[], error: Error|null}>} */
    async searchTitles(query, { signal } = {}) {
      if (searchError) return { titles: [], error: searchError };
      try {
        return { titles: await searchSource.searchTitles(query, { signal }), error: null };
      } catch (error) {
        return { titles: [], error };
      }
    },

    /** @returns {Promise<SourceSnapshot[]>} */
    async getAvailability(title, { signal } = {}) {
      return collectAvailability(availabilitySources.filter(isEnabled), title, signal);
    },

    /** @returns {Promise<{snapshots: SourceSnapshot[], coverage: Object<string, Coverage>, mode: 'full'|'tmdbOnly', reason: 'quota'|'error'|'noKey'|null}>} */
    async loadAvailability(title, { signal } = {}) {
      const selected = availabilitySources.filter(isEnabled);
      const snapshots = await collectAvailability(selected, title, signal);
      const { assembleAvailability } = await import('./availability.js');
      return assembleAvailability({ selected, snapshots, signal, cache, now });
    },

    /**
     * A title already viewed, read from the cache alone: no request is ever made.
     * @returns {Promise<import('./availability.js').SavedTitle|null>}
     */
    async readCachedTitle(ref) {
      const { readSavedTitle } = await import('./availability.js');
      return readSavedTitle({ ref, selected: availabilitySources.filter(isEnabled), cache, now });
    },

    /** @returns {Promise<import('./availability.js').SavedTitle[]>} The viewed titles, newest data first. */
    async listCachedTitles() {
      const { listSavedTitles } = await import('./availability.js');
      return listSavedTitles({ selected: availabilitySources.filter(isEnabled), cache, now });
    },
  };
}
