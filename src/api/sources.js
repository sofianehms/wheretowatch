import { SOURCE_MODE } from '../config.js';
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
 * @property {number|null} coveredCountries Country count, null when unknown.
 * @property {Offer[]} offers
 * @property {Error|null} error
 */

/**
 * @typedef {object} RequestOptions
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {object} Source
 * @property {'tmdb'|'sa'} id
 * @property {{search: boolean, availability: boolean, languages: boolean, instantSearch: boolean}} capabilities
 * @property {(query: string, options: RequestOptions) => Promise<Title[]>} searchTitles
 * @property {(title: Title, options: RequestOptions) => Promise<SourceSnapshot>} getAvailability
 * @property {() => string[]|Promise<string[]>} listCoveredCountries
 */

/**
 * Select the adapters for the current mode. Composition supplies adapters only
 * for providers with a configured key.
 * @param {{sources: Source[], mode?: 'tmdb+sa'|'sa-only'}} options
 */
export function createSources({ sources, mode = SOURCE_MODE }) {
  const searchId = mode === 'sa-only' ? 'sa' : 'tmdb';
  const activeSources = sources.filter(({ id }) => id === 'sa' || id === searchId);
  const searchSource = activeSources.find(({ id, capabilities }) => id === searchId && capabilities.search);
  const searchError = searchSource ? null : new HttpError('auth');
  const availabilitySources = activeSources.filter(({ capabilities }) => capabilities.availability);

  return {
    activeSources,
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
      return Promise.all(availabilitySources.map(async (source) => {
        try {
          return await source.getAvailability(title, { signal });
        } catch (error) {
          return {
            source: source.id,
            status: 'unavailable',
            fetchedAt: new Date().toISOString(),
            coveredCountries: null,
            offers: [],
            error,
          };
        }
      }));
    },
  };
}
