// Collapsible diagnostics section of Settings. Loaded on demand; it reads local state only.
import { recentErrors } from '../api/diagnostics.js';
import strings from '../i18n/en/diagnostics.js';
import { formatNumber, formatResetDate } from '../i18n/strings.js';
import { loadTitleStyles } from './country.js';
import { el, icon } from './dom.js';

// Own strings: the dictionary ships with this module, outside the first-load shell.
const t = (key, params = {}) => strings[key].replace(/\{(\w+)\}/g, (placeholder, name) => params[name] ?? placeholder);

const formatTime = (date) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(date);

/**
 * @param {object} options
 * @param {ReturnType<typeof import('../api/quota.js').createQuota>['status']} [options.quotaStatus]
 * @param {() => {entries: number, bytes: number}} options.cacheStats
 * @returns {HTMLElement} The section, with `refresh()`; values are read each time the panel opens.
 */
export function renderDiagnostics({ quotaStatus, cacheStats }) {
  loadTitleStyles();
  const section = el('section');
  const details = el('details', 'disclosure diagnostics');
  const summary = el('summary');
  const chevron = icon('chevDown', 'sm');
  chevron.classList.add('chev');
  summary.append(el('h2', '', t('title')), chevron);
  const body = el('div', 'diagnostics__body');
  details.append(summary, body);
  section.append(details);

  function quotaText() {
    try {
      const { used, limit, nextReset } = quotaStatus();
      return t('quota.value', { used: formatNumber(used), limit: formatNumber(limit), date: formatResetDate(nextReset) });
    } catch {
      return t('quota.unknown');
    }
  }

  function errorList() {
    const errors = recentErrors();
    if (!errors.length) return el('p', 'muted', t('errors.empty'));
    const list = el('ol', 'diagnostics__errors');
    for (const { type, host, path, date } of errors) {
      const item = el('li');
      item.append(
        el('strong', '', strings[`type.${type}`] ?? type), ' ',
        el('span', 'muted', formatTime(date)),
        el('code', '', host + path),
      );
      list.append(item);
    }
    return list;
  }

  function refresh() {
    if (!details.open) return;
    const { entries, bytes } = cacheStats();
    const facts = el('dl', 'diagnostics__facts');
    for (const [name, value] of [
      ['quota', quotaText()],
      ['cache', t('cache.value', { entries: formatNumber(entries), size: formatNumber(Math.ceil(bytes / 1000)) })],
    ]) {
      facts.append(el('dt', '', t(name)), el('dd', '', value));
    }
    body.replaceChildren(el('p', 'field__help', t('help')), facts, el('h3', '', t('errors')), errorList());
  }

  details.addEventListener('toggle', refresh);
  section.refresh = refresh;
  return section;
}
