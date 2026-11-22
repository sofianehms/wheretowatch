// Format: Streaming Availability API v4, https://developers.movieofthenight.com/
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
import { lantern } from './countries.js';
import { responseHeaders } from './response-headers.js';

export const headers = responseHeaders(24);

export default {
  id: '99001',
  itemType: 'show',
  showType: 'movie',
  title: 'The Glass Orchard',
  releaseYear: 2024,
  imdbId: 'tt99000001',
  tmdbId: 'movie/900001',
  streamingOptions: {
    fr: [
      {
        service: lantern,
        type: 'subscription',
        link: 'https://lantern.example/watch/glass-orchard',
        quality: 'hd',
        audios: [],
        subtitles: [],
        expiresSoon: false
      }
    ]
  }
};
