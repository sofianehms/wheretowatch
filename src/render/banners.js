// Banners: the notices of `state.banners` (`{ type }`), drawn in one status region.
import { t } from '../i18n/strings.js';
import { el, icon } from './dom.js';

// Known types. Text comes from `banners.<type>.*`; `action` opens Settings.
const known = { tmdbOnly: { icon: 'info', action: true } };

/**
 * @param {Element} slot Stays in the page so that changes are announced.
 * @param {ReadonlyArray<{type: string}>} banners Unknown types are skipped.
 * @param {{onOpenSettings?: () => void}} [handlers]
 */
export function renderBanners(slot, banners, { onOpenSettings } = {}) {
  slot.setAttribute('role', 'status');
  slot.className = 'banners';
  slot.replaceChildren(...banners.filter(({ type }) => Object.hasOwn(known, type)).map(({ type }) => {
    const body = el('div');
    body.append(el('span', 'banner__title', t(`banners.${type}.title`)), t(`banners.${type}.text`));
    if (known[type].action) {
      const open = el('button', 'link', t(`banners.${type}.action`), { type: 'button' });
      open.addEventListener('click', () => onOpenSettings?.());
      body.append(' ', el('span', 'banner__actions'));
      body.lastChild.append(open);
    }
    const box = el('div', 'banner');
    box.append(icon(known[type].icon), body);
    return box;
  }));
}
