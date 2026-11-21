// Entry point of the single-view tool. Replace with the real behaviour defined in the design brief.
import { applyStaticStrings, t } from './i18n/strings.js';

applyStaticStrings(document);

const input = document.querySelector('#q');
const status = document.querySelector('#status');

input.addEventListener('input', () => {
  status.textContent = input.value.trim() ? t('search.loading') : t('search.hint');
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
