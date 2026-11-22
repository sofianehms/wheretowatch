// Format: Streaming Availability API v4, https://developers.movieofthenight.com/
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
import { netflix } from './countries.js';
import { responseHeaders } from './response-headers.js';

export const headers = responseHeaders(27);

export default {
  id: '99002',
  itemType: 'show',
  showType: 'series',
  title: 'Signal Garden',
  firstAirYear: 2025,
  lastAirYear: 2025,
  tmdbId: 'tv/900002',
  streamingOptions: {
    fr: [
      {
        service: netflix,
        type: 'subscription',
        link: 'https://www.netflix.com/title/99000002',
        quality: 'hd',
        audios: [],
        subtitles: [],
        expiresSoon: false
      }
    ]
  }
};
