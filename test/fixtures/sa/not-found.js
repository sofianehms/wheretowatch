// Format: Streaming Availability API v4, https://developers.movieofthenight.com/
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
import { lantern } from './countries.js';
import { responseHeaders } from './response-headers.js';

export const headers = responseHeaders(26);

export default {
  id: '99003',
  itemType: 'show',
  showType: 'movie',
  title: 'Paper Observatory',
  releaseYear: 2024,
  tmdbId: 'movie/900003',
  streamingOptions: {
    fr: [
      {
        service: lantern,
        type: 'subscription',
        link: 'https://lantern.example/watch/paper-observatory',
        quality: 'hd',
        audios: [],
        subtitles: [],
        expiresSoon: false
      }
    ]
  }
};
