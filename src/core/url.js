// Launch parameters of the page URL (the iPhone shortcut opens `?q=<title>`).
const MAX_QUERY_LENGTH = 200;
const LAUNCH_PARAMS = ['q'];

/**
 * Read the launch parameters from a query string.
 * @param {string} search The `location.search` value.
 * @returns {{q: string | null}} The query capped at 200 characters and trimmed, or null when absent or blank.
 */
export function readLaunchParams(search) {
  const raw = new URLSearchParams(search).get('q');
  const q = raw === null ? '' : [...raw].slice(0, MAX_QUERY_LENGTH).join('').trim();
  return { q: q || null };
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
