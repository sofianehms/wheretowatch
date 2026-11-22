// Format: Streaming Availability API v4, https://developers.movieofthenight.com/
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
// Synthetic counters for consecutive successful responses in the same quota cycle.
export const requestHeaderName = 'X-API-Key';

const headers = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': '*',
  'x-quota-granted': '1000',
  'x-quota-used': '20',
  'x-quota-reset': '2027-02-01T00:00:00Z'
};

export function responseHeaders(used) {
  return { ...headers, 'x-quota-used': String(used) };
}

export default headers;
