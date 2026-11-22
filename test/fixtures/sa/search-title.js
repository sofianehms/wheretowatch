// Format: Streaming Availability API v4, https://developers.movieofthenight.com/
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
import movie from './movie.js';
import noOptions from './no-options.js';
import { responseHeaders } from './response-headers.js';

export const country = 'us';
export const headers = responseHeaders(23);

export default [
  { ...movie, streamingOptions: { [country]: movie.streamingOptions[country] } },
  noOptions
];
