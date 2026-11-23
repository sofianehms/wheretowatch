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

/**
 * Build a poster's src and srcset, optionally using the source's image configuration.
 * @param {string|null} path TMDB poster path.
 * @param {'thumb'|'detail'} variant
 * @param {{secure_base_url?: string, poster_sizes?: string[]}|null} [configuration]
 * @returns {{src: string, srcset: string}|null}
 */
export function posterSrcset(path, variant, configuration) {
  if (!path || !/^\/[\w-]+\.[a-z0-9]+$/i.test(path) || forbiddenUrlText.test(path)) return null;
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
