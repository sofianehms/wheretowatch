// Banners: the notices of `state.banners`, drawn in one status region.
// An entry is `{ message, title?, tone?, action?: { label, name }, dismissible? }`.
import { t } from '../i18n/strings.js';
import { el, icon } from './dom.js';

const drawn = new WeakMap();

export const tmdbOnlyBanner = () => ({
  type: 'tmdbOnly',
  title: t('banners.tmdbOnly.title'),
  message: t('banners.tmdbOnly.text'),
  action: { label: t('banners.tmdbOnly.action'), name: 'settings' },
});

function drawBanner(banner, { onAction, onDismiss }) {
  const { title, message, tone, action, dismissible } = banner;
  const body = el('div', '', title ? '' : message);
  if (title) body.append(el('span', 'banner__title', title), message);
  if (action) {
    const open = el('button', 'link', action.label, { type: 'button' });
    open.addEventListener('click', () => onAction?.(action.name, banner));
    body.append(' ', el('span', 'banner__actions'));
    body.lastChild.append(open);
  }
  const box = el('div', tone ? `banner banner--${tone}` : 'banner');
  box.append(icon(tone ? 'alert' : 'info'), body);
  if (dismissible) {
    const close = el('button', 'icon-btn', '', { type: 'button', 'aria-label': t('banners.dismiss') });
    close.append(icon('close'));
    close.addEventListener('click', () => onDismiss?.(banner));
    box.append(close);
  }
  return box;
}

/**
 * Redraws only for a new list, so keyboard focus survives unrelated store updates.
 * @param {Element} slot Stays in the page so that changes are announced.
 * @param {ReadonlyArray<object>} banners
 * @param {{onAction?: (name: string, banner: object) => void, onDismiss?: (banner: object) => void}} [handlers]
 */
export function renderBanners(slot, banners, handlers = {}) {
  slot.setAttribute('role', 'status');
  slot.className = 'banners';
  if (drawn.get(slot) === banners) return;
  drawn.set(slot, banners);
  slot.replaceChildren(...banners.map((banner) => drawBanner(banner, handlers)));
}
