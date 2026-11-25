// Last request errors, kept in memory only for the local diagnostics panel. Nothing is stored or sent.
export const MAX_ERRORS = 20;

const entries = [];

// Only the host and the path are kept: no query, fragment or user info, where a key could travel.
function endpoint(url) {
  try {
    const { protocol, host, pathname } = new URL(url, globalThis.location?.href);
    if (protocol === 'https:' || protocol === 'http:') return { host, path: pathname };
  } catch {
    // A malformed URL may contain sensitive input.
  }
  return { host: '', path: '' };
}

export function recordError({ type, url, date = Date.now() }) {
  entries.push(Object.freeze({ type, ...endpoint(url), date }));
  if (entries.length > MAX_ERRORS) entries.shift();
}

/** Newest first. */
export const recentErrors = () => entries.slice().reverse();

export function clearErrors() {
  entries.length = 0;
}
