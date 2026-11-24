// Install hint: iOS has no install prompt, and the installed app does not share Safari's storage.
import { isIosSafari, isStandalone } from '../core/platform.js';
import { t } from '../i18n/strings.js';
import { el, icon, richText, uniqueId } from './dom.js';

const DISMISSED = 'installHintDismissed';

const steps = [
  ['share', 'install.step1', 'install.step1.action'],
  ['plusSquare', 'install.step2', 'install.step2.action'],
  ['toggle', 'install.step3', 'install.step3.action'],
];

/**
 * Fill `slot` with the hint, only in iOS Safari, outside the installed app and until it is dismissed.
 * @param {Element} slot
 * @param {{settings: {getPref: (name: string) => string|null, setPref: (name: string, value: string) => void},
 *   navigatorLike?: {userAgent?: string, maxTouchPoints?: number, standalone?: boolean},
 *   matchMedia?: (query: string) => {matches: boolean}}} options
 */
export function renderInstallHint(slot, {
  settings, navigatorLike = globalThis.navigator, matchMedia = (query) => globalThis.matchMedia?.(query),
}) {
  slot.replaceChildren();
  if (!isIosSafari(navigatorLike?.userAgent, navigatorLike?.maxTouchPoints)) return;
  if (isStandalone(matchMedia, navigatorLike) || settings.getPref(DISMISSED)) return;

  const titleId = uniqueId('install-title');
  const section = el('section', 'install', '', { 'aria-labelledby': titleId });
  const head = el('div', 'install__head');
  const close = el('button', 'icon-btn', '', { type: 'button', 'aria-label': t('install.dismiss') });
  close.append(icon('close'));
  head.append(el('h2', '', t('install.title'), { id: titleId }), close);

  const list = el('ol');
  for (const [symbol, text, action] of steps) {
    const label = el('span');
    richText(label, t(text), { action: el('strong', '', t(action)) });
    const item = el('li');
    item.append(icon(symbol, 'sm'), label);
    list.append(item);
  }

  close.addEventListener('click', () => {
    try {
      settings.setPref(DISMISSED, '1');
    } catch {
      // Storage refused the preference: the hint still closes for this visit.
    }
    // The button disappears with the hint: keep the keyboard position in the page.
    const main = slot.closest('main');
    slot.replaceChildren();
    if (main) {
      main.tabIndex = -1;
      main.focus({ preventScroll: true });
    }
  });

  section.append(head, list, el('p', 'small muted', t('install.note')));
  slot.append(section);
}
