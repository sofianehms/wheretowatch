import { t } from '../i18n/strings.js';

/**
 * Wire the search input to its status line.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} status
 * @returns {{reset: () => void}} `reset()` empties the query and shows the hint again.
 */
export function bindSearch(input, status) {
  input.addEventListener('input', () => {
    status.textContent = input.value.trim() ? t('search.loading') : t('search.hint');
  });
  return {
    reset() {
      input.value = '';
      status.textContent = t('search.hint');
    },
  };
}
