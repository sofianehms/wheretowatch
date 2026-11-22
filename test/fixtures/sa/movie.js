// Format: Streaming Availability API v4, https://developers.movieofthenight.com/
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
import { netflix } from './countries.js';
import { responseHeaders } from './response-headers.js';

export { default as headers } from './response-headers.js';
export const afterCountriesHeaders = responseHeaders(22);

export default {
  id: '99001',
  itemType: 'show',
  showType: 'movie',
  title: 'The Glass Orchard',
  releaseYear: 2024,
  imdbId: 'tt99000001',
  tmdbId: 'movie/900001',
  streamingOptions: {
    us: [
      {
        service: netflix,
        type: 'subscription',
        link: 'https://www.netflix.com/title/99000001',
        quality: 'uhd',
        audios: [ { language: 'eng' }, { language: 'fra' } ],
        subtitles: [
          { locale: { language: 'eng' }, closedCaptions: false },
          { locale: { language: 'fra' }, closedCaptions: false }
        ],
        expiresSoon: true,
        expiresOn: 1801440000
      }
    ],
    fr: [
      {
        service: netflix,
        type: 'subscription',
        link: 'https://www.netflix.com/title/99000001',
        quality: 'hd',
        audios: [],
        subtitles: [],
        expiresSoon: false
      }
    ]
  }
};
