export const fakeTitle = {
  mediaType: 'movie',
  tmdbId: 238,
  imdbId: 'tt0068646',
  title: 'The Godfather',
  year: 1972,
  posterPath: null,
  ref: 'movie/238',
};

export function fakeSource(id, overrides = {}) {
  return {
    id,
    capabilities: {
      search: true,
      availability: true,
      languages: id === 'sa',
      instantSearch: id === 'tmdb',
    },
    async searchTitles() {
      return [fakeTitle];
    },
    async getAvailability() {
      return {
        source: id,
        status: 'empty',
        fetchedAt: '2026-11-21T10:00:00.000Z',
        coveredCountries: 1,
        offers: [],
        error: null,
      };
    },
    listCoveredCountries() {
      return ['FR'];
    },
    ...overrides,
  };
}
