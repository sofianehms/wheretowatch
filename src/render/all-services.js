// "All services" view: what the reference country offers, by offer type, with the source of each line.
import { homeKind } from '../core/verdict.js';
import { countryName, formatNumber, t } from '../i18n/strings.js';
import { el, icon, uniqueId } from './dom.js';

const OFFER_TYPES = ['subscription', 'free', 'rent', 'buy'];
const SOURCES = ['tmdb', 'sa'];
const sourceName = (id) => t(`verdict.source.${id}`);

/**
 * Offers of the reference country, grouped by offer type.
 * @param {Map<string, {service: {name: string}}>} reconciledAll Service names by key.
 * @param {{source: string, country: string, key: string, offerType: string}[]} offers Result of `reportedOffers()`.
 * @param {string} home Lowercase country code.
 * @returns {{type: string, services: {name: string, sources: string[]}[]}[]}
 */
export function offersAtHome(reconciledAll, offers, home) {
  const atHome = offers.filter((offer) => offer.country === home);
  const groups = [];
  for (const type of OFFER_TYPES) {
    const ofType = atHome.filter((offer) => offer.offerType === type);
    const services = [...new Set(ofType.map(({ key }) => key))].map((key) => ({
      name: reconciledAll.get(key).service.name,
      sources: SOURCES.filter((id) => ofType.some((offer) => offer.key === key && offer.source === id)),
    }));
    if (services.length > 0) groups.push({ type, services: services.sort((a, b) => a.name.localeCompare(b.name)) });
  }
  return groups;
}

const count = (n) => t(`title.service.${n === 1 ? 'service' : 'services'}`, { count: formatNumber(n) });

function serviceRow(entry) {
  const item = el('li', 'country country--static');
  const both = entry.sources.length === SOURCES.length;
  const badge = el('span', both ? 'badge badge--confirmed' : 'badge');
  badge.append(icon(both ? 'checkCircle' : 'info', 'sm'), both ? t('title.badge.confirmed') : t('title.badge.only', { source: sourceName(entry.sources[0]) }));
  item.append(el('span', 'country__name', entry.name), badge);
  return item;
}

const looks = { available: ['available', 'checkCircle'], notFound: ['absent', 'close'], insufficient: ['unknown', 'info'] };

function headline(kind, ways, where) {
  if (kind === 'insufficient') return t('title.insufficient.headline');
  const key = kind === 'notFound' ? 'none' : ways === 1 ? 'ways.one' : 'ways';
  return t(`title.service.${key}`, { count: formatNumber(ways), country: where });
}

/**
 * Verdict card and offer groups for the "All services" choice.
 * @param {{reconciledAll: Map<string, object>, offers: object[], home: string|null, kind: string,
 *   coveredCountries: Set<string>, notes: HTMLElement[]}} view `kind` is the title's verdict kind;
 *   `notes` report what is uncertain about the sources and are shown with the card.
 * @returns {{card: HTMLElement, groups: HTMLElement|null}}
 */
export function allServicesView({ reconciledAll, offers, home, kind, coveredCountries, notes }) {
  const id = uniqueId('verdict-head');
  const card = el('section', 'verdict', '', { 'aria-labelledby': id });
  const body = el('div', 'verdict__body');
  body.append(...notes);
  if (!home) {
    card.append(el('h2', 'verdict__headline', t('title.service.noCountry'), { id }));
    if (notes.length > 0) card.append(body);
    return { card, groups: null };
  }
  const groups = offersAtHome(reconciledAll, offers, home);
  const ways = groups.reduce((sum, group) => sum + group.services.length, 0);
  const atHome = homeKind({ available: ways > 0, covered: coveredCountries.has(home), kind });
  const [modifier, iconName] = looks[atHome];
  const mark = icon(iconName, 'lg');
  mark.classList.add('verdict__icon');
  card.className = `verdict verdict--${modifier}`;
  const where = countryName(home.toUpperCase());
  card.append(
    mark,
    el('h2', 'verdict__headline', headline(atHome, ways, where), { id }),
    el('p', 'verdict__detail', atHome === 'insufficient' ? `${where} · ${t('title.service.yours')}` : t('title.service.yours')),
  );
  if (body.childElementCount > 0) card.append(body);
  if (ways === 0) return { card, groups: null };
  const box = el('div', 'groups');
  for (const { type, services } of groups) {
    const headId = uniqueId('group');
    const section = el('section', 'group', '', { 'aria-labelledby': headId });
    const head = el('div', 'group__head');
    head.append(el('h2', 'group__title', t(`title.group.${type}`), { id: headId }), el('span', 'group__count', count(services.length)));
    const list = el('ul', 'countries');
    for (const entry of services) list.append(serviceRow(entry));
    section.append(head, list);
    box.append(section);
  }
  return { card, groups: box };
}
