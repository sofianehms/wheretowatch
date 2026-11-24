// Launch parameters for search shortcuts and direct title links.
const MAX_QUERY_LENGTH = 200;
const LAUNCH_PARAMS = ['q', 't'];

/**
 * Read the launch parameters from a query string.
 * @param {string} search The `location.search` value.
 * @returns {{q: string | null, t: string | null}} A valid title reference takes priority over the trimmed, capped query.
 */
export function readLaunchParams(search) {
  const params = new URLSearchParams(search);
  const ref = params.get('t');
  if (ref !== null && /^(movie|tv)\/\d+$/.test(ref)) return { q: null, t: ref };
  const raw = params.get('q');
  const q = raw === null ? '' : [...raw].slice(0, MAX_QUERY_LENGTH).join('').trim();
  return { q: q || null, t: null };
}

/**
 * The URL to show once the launch parameters are consumed: same path (a subpath is preserved),
 * other parameters and the fragment kept.
 * @param {{pathname: string, search: string, hash?: string}} location
 */
export function cleanUrl({ pathname, search, hash = '' }) {
  const params = new URLSearchParams(search);
  for (const name of LAUNCH_PARAMS) params.delete(name);
  const rest = params.toString();
  return `${pathname}${rest ? `?${rest}` : ''}${hash}`;
}
