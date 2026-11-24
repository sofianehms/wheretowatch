// Optional service logo shown beside a service name, never instead of it.
import { serviceLogoUrl } from '../core/images.js';
import { el } from './dom.js';

/**
 * @param {{name: string, logoPath?: string|null}} service
 * @param {object|null} [configuration] TMDB image configuration.
 * @returns {HTMLImageElement|null} Null when there is no logo to show; an image that fails to load removes itself.
 */
export function serviceLogo({ name, logoPath }, configuration) {
  const src = serviceLogoUrl(logoPath, configuration);
  if (!src) return null;
  const image = el('img', 'service-logo', '', { alt: name, loading: 'lazy', decoding: 'async' });
  image.addEventListener('error', () => image.remove());
  image.src = src;
  return image;
}
