import { t } from '../i18n/strings.js';
import { el, icon, mark } from './dom.js';

/**
 * Page header: the brand and the Settings button, or the Settings title with a back button.
 * @param {{settingsOpen: boolean, onOpenSettings: () => void, onCloseSettings: () => void}} options
 */
export function renderHeader({ settingsOpen, onOpenSettings, onCloseSettings }) {
  const header = el('header', 'app-header');
  if (settingsOpen) {
    const head = el('div', 'subpage-head');
    const back = el('button', 'icon-btn', '', { type: 'button', 'aria-label': t('settings.back') });
    back.append(icon('chevLeft'));
    back.addEventListener('click', onCloseSettings);
    const title = el('h1', '', t('settings.title'));
    title.dataset.focusTarget = '';
    head.append(back, title);
    header.append(head);
    return header;
  }

  const brand = el('span', 'brand');
  brand.append(mark(), el('span', '', t('common.brand')));
  const open = el('button', 'icon-btn', '', { type: 'button', 'aria-label': t('settings.open') });
  open.append(icon('settings'));
  open.addEventListener('click', onOpenSettings);
  header.append(brand, open);
  return header;
}
