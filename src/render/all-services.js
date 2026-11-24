// "All services" view: what the reference country offers, by offer type, with the source of each line.
import { countryName, formatNumber, t } from '../i18n/strings.js';
import { el, icon, uniqueId } from './dom.js';

const OFFER_TYPES = ['subscription', 'free', 'rent', 'buy'];
const SOURCES = ['tmdb', 'sa'];
const sourceName = (id) => t(`verdict.source.${id}`);

/**
 * Offers of the reference country, grouped by offer type.
 * @param {Map<string, {service: {name: string}, countries: {country: string, types: object}[]}>} reconciledAll
 * @param {string} home Lowercase country code.
 * @returns {{type: string, services: {name: string, sources: string[]}[]}[]}
 */
export function offersAtHome(reconciledAll, home) {
  const groups = [];
  for (const type of OFFER_TYPES) {
    const services = [];
    for (const { service, countries } of reconciledAll.values()) {
      const row = countries.find((entry) => entry.country === home);
      if (!row) continue;
      const sources = SOURCES.filter((id) => row.types[id].includes(type));
      if (sources.length > 0) services.push({ name: service.name, sources });
    }
    if (services.length > 0) groups.push({ type, services: services.sort((a, b) => a.name.localeCompare(b.name)) });
  }
  return groups;
}

const count = (n) => t(`title.service.${n === 1 ? 'service' : 'services'}`, { count: formatNumber(n) });

function serviceRow(entry, bothAnswered) {
  const item = el('li', 'country country--static');
  item.append(el('span', 'country__name', entry.name));
  const badge = el('span', 'badge');
  if (entry.sources.length === SOURCES.length) {
    badge.classList.add('badge--confirmed');
    badge.append(icon('checkCircle', 'sm'), t('title.badge.confirmed'));
    item.append(badge);
  } else if (bothAnswered) {
    badge.append(icon('info', 'sm'), t('title.badge.only', { source: sourceName(entry.sources[0]) }));
    item.append(badge);
  }
  return item;
}

/**
 * Verdict card and offer groups for the "All services" choice.
 * @returns {{card: HTMLElement, groups: HTMLElement|null}}
 */
export function allServicesView({ reconciledAll, home, bothAnswered }) {
  const id = uniqueId('verdict-head');
  const card = el('section', 'verdict', '', { 'aria-labelledby': id });
  if (!home) {
    card.append(el('h2', 'verdict__headline', t('title.service.noCountry'), { id }));
    return { card, groups: null };
  }
  const where = countryName(home.toUpperCase());
  const groups = offersAtHome(reconciledAll, home);
  const ways = groups.reduce((sum, group) => sum + group.services.length, 0);
  const mark = icon(ways > 0 ? 'checkCircle' : 'close', 'lg');
  mark.classList.add('verdict__icon');
  card.className = `verdict verdict--${ways > 0 ? 'available' : 'absent'}`;
  card.append(
    mark,
    el('h2', 'verdict__headline', t(ways > 0 ? (ways === 1 ? 'title.service.ways.one' : 'title.service.ways') : 'title.service.none', { count: formatNumber(ways), country: where }), { id }),
    el('p', 'verdict__detail', t('title.service.yours')),
  );
  if (ways === 0) return { card, groups: null };
  const box = el('div', 'groups');
  for (const { type, services } of groups) {
    const headId = uniqueId('group');
    const section = el('section', 'group', '', { 'aria-labelledby': headId });
    const head = el('div', 'group__head');
    head.append(el('h2', 'group__title', t(`title.group.${type}`), { id: headId }), el('span', 'group__count', count(services.length)));
    const list = el('ul', 'countries');
    for (const entry of services) list.append(serviceRow(entry, bothAnswered));
    section.append(head, list);
    box.append(section);
  }
  return { card, groups: box };
}
