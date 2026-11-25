import { SHOW_SERVICE_LOGOS } from '../data/services.js';

const defaultBase = 'https://image.tmdb.org/t/p/';
const forbiddenUrlText = /api_key|original/i;
const posterCandidates = {
  thumb: [['w92', '1x'], ['w154', '2x'], ['w185', '3x']],
  detail: [['w342', '1x'], ['w500', '3x']],
};

function isSecureBase(value) {
  // Use the HTTPS image origin permitted by the application's CSP.
  return /^https:\/\/image\.tmdb\.org\/(?:[\w-]+\/)+$/.test(value) && !forbiddenUrlText.test(value);
}

const isImagePath = (path) => Boolean(path) && /^\/[\w-]+\.[a-z0-9]+$/i.test(path) && !forbiddenUrlText.test(path);

/**
 * URL of a service logo at its smallest size, or null when logos are turned off or the path is unusable.
 * @param {string|null|undefined} path TMDB logo path (`serviceLogoPath`).
 * @param {{secure_base_url?: string, logo_sizes?: string[]}|null} [configuration]
 * @param {boolean} [show] Defaults to the build setting that removes every logo.
 * @returns {string|null}
 */
export function serviceLogoUrl(path, configuration, show = SHOW_SERVICE_LOGOS) {
  if (!show || !isImagePath(path)) return null;
  const widths = (configuration?.logo_sizes ?? []).filter((size) => /^w\d+$/.test(size));
  widths.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const configured = widths.length > 0 && isSecureBase(configuration.secure_base_url);
  return configured ? configuration.secure_base_url + widths[0] + path : `${defaultBase}w45${path}`;
}

/**
 * Build a poster's src and srcset, optionally using the source's image configuration.
 * @param {string|null} path TMDB poster path.
 * @param {'thumb'|'detail'} variant
 * @param {{secure_base_url?: string, poster_sizes?: string[]}|null} [configuration]
 * @returns {{src: string, srcset: string}|null}
 */
export function posterSrcset(path, variant, configuration) {
  if (!isImagePath(path)) return null;
  const expected = posterCandidates[variant];
  const available = configuration?.poster_sizes;
  const supported = Array.isArray(available)
    ? expected.filter(([size]) => available.includes(size)) : [];
  const configuredBase = configuration?.secure_base_url;
  const useConfiguration = supported.some(([, density]) => density !== '3x') && isSecureBase(configuredBase);
  const base = useConfiguration ? configuredBase : defaultBase;
  const candidates = useConfiguration ? supported : expected;
  return {
    src: base + candidates[0][0] + path,
    srcset: candidates.map(([size, density]) => `${base}${size}${path} ${density}`).join(', '),
  };
}
