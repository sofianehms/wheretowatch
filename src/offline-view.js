// Without a network: the titles viewed on this device, read from the saved data.
import { formatDate, formatNumber, t } from './i18n/strings.js';
import { el, uniqueId } from './render/dom.js';
import { assessTitle } from './title-page.js';

const TONES = 6;

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0].toUpperCase()).join('');
}

function summary({ kind, count, service }) {
  if (kind !== 'available' && kind !== 'notFound') return t('search.offline.insufficient', { service });
  if (count === null) return t(`search.offline.${kind}.uncounted`, { service });
  const form = count === 1 ? 'country' : 'countries';
  const key = kind === 'notFound' ? `verdict.covered.${form}` : `verdict.${form}`;
  return t(`search.offline.${kind}`, { service, countries: t(key, { count: formatNumber(count) }) });
}

function row({ title, snapshots, coverage, fetchedAt }, settings, onChoose) {
  const { verdict } = assessTitle({ snapshots, coverage, mediaType: title.mediaType }, settings);
  const link = el('a', '', '', { href: `?t=${title.ref}`, 'data-ref': title.ref });
  const poster = el('div', `poster tone-${(title.tmdbId ?? 0) % TONES + 1}`, initials(title.title), { 'aria-hidden': 'true' });
  const lines = el('span');
  const meta = t('search.offline.meta', { summary: summary(verdict), date: formatDate(new Date(fetchedAt)) });
  lines.append(el('span', 'option__title', title.title), el('span', 'option__meta', meta));
  link.append(poster, lines);
  link.addEventListener('click', (event) => {
    event.preventDefault();
    onChoose(title);
  });
  const item = el('li');
  item.append(link);
  return item;
}

// The two attributions that go with the availability data of the list.
function sourceLine() {
  const [before, after] = t('search.offline.sources').split('{night}');
  const line = el('p', 'source-line', before);
  const night = el('a', 'link link--quiet', t('common.attribution.nightLink'), {
    href: t('common.attribution.nightUrl'), target: '_blank', rel: 'noopener noreferrer',
  });
  line.append(night, after);
  return line;
}

/**
 * @param {HTMLElement} container
 * @param {{entries: import('./api/availability.js').SavedTitle[]|null, settings: {getPref: (name: string) => string|null},
 *   onChoose: (title: import('./api/sources.js').Title) => void, onBack: () => void}} options
 *   Null entries stand for an open title: only the way back to the list is shown.
 */
export function renderOffline(container, { entries, settings, onChoose, onBack }) {
  if (entries === null) {
    const back = el('button', 'btn btn--secondary', t('search.offline.back'), { type: 'button' });
    back.addEventListener('click', onBack);
    container.replaceChildren(back);
    return;
  }
  const id = uniqueId('viewed');
  const heading = el('h2', 'section-title', t('search.offline.recent'), { id });
  if (entries.length === 0) {
    container.replaceChildren(heading, el('p', 'source-line', t('search.offline.none')));
    return;
  }
  const list = el('ul', 'recent', '', { 'aria-labelledby': id });
  list.append(...entries.map((entry) => row(entry, settings, onChoose)));
  container.replaceChildren(heading, list, sourceLine());
}

/** Put the keyboard back on the title just left. */
export function focusEntry(container, ref) {
  [...container.querySelectorAll('a[data-ref]')].find((link) => link.dataset.ref === ref)?.focus();
}
