// Title page: header, verdict, countries by offer type, sources and links. Text always comes from `t()`.
import { posterSrcset } from '../core/images.js';
import { verdictText } from '../core/verdict.js';
import { countryName, formatDate, formatNumber, t } from '../i18n/strings.js';
import { justWatchNotice, nightNotice } from './attribution.js';
import { allServicesView } from './all-services.js';
import { el, externalLink, icon, uniqueId } from './dom.js';
import { languageRow } from './languages.js';
import { servicePicker } from './service-picker.js';

const TONES = 6;
// Countries listed before the "Show more" control, per offer type.
const INITIAL_COUNTRIES = 6;
const OFFER_TYPES = ['subscription', 'free', 'rent', 'buy'];
const SOURCES = ['tmdb', 'sa'];
const sourceName = (id) => t(`verdict.source.${id}`);
const countLabel = (count) => t(`verdict.${count === 1 ? 'country' : 'countries'}`, { count: formatNumber(count) });

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0].toUpperCase()).join('');
}

function poster(title, configuration) {
  const frame = el('div', `poster tone-${(title.tmdbId ?? 0) % TONES + 1} poster--card`, '', { 'aria-hidden': 'true' });
  const source = posterSrcset(title.posterPath, 'detail', configuration);
  if (!source) {
    frame.textContent = initials(title.title);
    return frame;
  }
  const image = el('img', 'poster__image', '', {
    src: source.src, srcset: source.srcset, alt: '', loading: 'eager', decoding: 'async',
  });
  image.addEventListener('error', () => {
    image.remove();
    frame.textContent = initials(title.title);
  });
  frame.append(image);
  return frame;
}

function header(title, { isSeries, configuration, picker }) {
  const tone = (title.tmdbId ?? 0) % TONES + 1;
  const head = el('div', `title-head tone-${tone}`);
  const info = el('div', 'title-head__info');
  const meta = el('p', 'title-head__meta');
  if (title.year != null) meta.append(el('span', '', t('title.meta.year', { year: title.year })));
  meta.append(el('span', '', t(`title.type.${title.mediaType}`)));
  if (isSeries) meta.append(el('span', '', t('title.meta.series')));
  info.append(el('h1', 'title-head__name', title.title), meta);
  if (picker) info.append(picker);
  head.append(poster(title, configuration), info);
  return head;
}

function loadingCard(message) {
  const id = uniqueId('verdict-load');
  const card = el('section', 'verdict', '', { 'aria-busy': 'true', 'aria-labelledby': id });
  card.append(
    el('span', 'verdict__icon verdict__skeleton-icon skeleton'),
    el('h2', 'verdict__headline', message, { id }),
    el('span', 'skeleton skeleton--line skeleton--mid'),
  );
  const groups = el('div', 'groups', '', { 'aria-hidden': 'true' });
  const stack = el('div', 'skeleton-stack');
  stack.append(el('span', 'skeleton skeleton--line skeleton--short'));
  for (let row = 0; row < 5; row += 1) stack.append(el('span', 'skeleton skeleton--row'));
  groups.append(stack);
  return [card, groups];
}

const verdictIcons = { available: 'checkCircle', notFound: 'close', insufficient: 'info', error: 'alert' };
const verdictClasses = { available: 'available', notFound: 'absent', insufficient: 'unknown', error: 'error' };
const homeIcons = { available: 'checkCircle', notFound: 'close', insufficient: 'info' };

// Each source carries its own retrieval date: the newest date of one source never stands for another.
function sourceDated({ source, fetchedAt }) {
  return fetchedAt ? t('title.detail.dated', { source: sourceName(source), date: formatDate(new Date(fetchedAt)) }) : sourceName(source);
}

function detailLine(verdict) {
  const responding = verdict.perSourceNotes.filter(({ status }) => status !== 'unavailable');
  // Sources that recognize the title; a source that does not know it is explained in a notice.
  const known = responding.filter(({ status }) => status === 'offers' || status === 'empty');
  const shown = known.length > 0 ? known : responding;
  const parts = [];
  if (verdict.kind === 'available' && verdict.count !== null && known.length === SOURCES.length) {
    parts.push(t('verdict.confirmed', { count: formatNumber(verdict.confirmedCount) }).replace(/\.$/, ''));
  }
  const dated = shown.map(sourceDated);
  if (dated.length === SOURCES.length) parts.push(t('title.detail.and', { first: dated[0], second: dated[1] }));
  else if (dated.length === 1) parts.push(t('title.detail.only', { source: dated[0] }));
  if (verdict.fetchedAt === null) parts.push(t('verdict.noRetrieval').replace(/\.$/, ''));
  return parts.join(' · ');
}

function banner(key, params, text = 'text') {
  const box = el('div', 'banner banner--caution', '', { role: 'note' });
  const body = el('div');
  body.append(el('span', 'banner__title', t(`title.banner.${key}.title`)), t(`title.banner.${key}.${text}`, params));
  box.append(icon('info'), body);
  return box;
}

// What is uncertain about the sources, for the single-service card and the "All services" one.
function notices(verdict, { all = false } = {}) {
  const boxes = [];
  for (const note of verdict.perSourceNotes) {
    if (note.status === 'unavailable') continue;
    const source = sourceName(note.source);
    if (note.status === 'notFound') boxes.push(banner('notRecognized', { source }));
    if (note.coverage === 'unknown') boxes.push(banner('coverageUnknown', { source }, all ? 'allText' : 'text'));
    if (note.coverage === 'stale' && note.status !== 'notFound') {
      boxes.push(banner('coverageStale', { source, date: formatDate(new Date(note.coverageFetchedAt)) }));
    }
    if (note.stale) boxes.push(banner('stale', { source, date: formatDate(new Date(note.fetchedAt)) }));
  }
  return boxes;
}

function homeRow(verdict) {
  const { home, service } = verdict;
  const line = el('p', 'home');
  const where = el('span', 'home__where', t('title.home.where', { country: countryName(home.country.toUpperCase()) }));
  where.append(' ', el('small', '', t('title.home.yours')));
  const status = el('span', `status status--${home.kind === 'available' ? 'yes' : 'no'}`);
  status.append(icon(homeIcons[home.kind], 'sm'), t(`title.home.${home.kind}`, { service }));
  line.append(where, status);
  return line;
}

function sourceNotes(verdict, options) {
  const uncovered = verdict.home?.saNotCovered ? [el('p', 'muted', t('title.home.saNotCovered'))] : [];
  return [...uncovered, ...notices(verdict, options)];
}

function verdictCard(verdict, handlers, title, reconciled) {
  const id = uniqueId('verdict-head');
  const card = el('section', `verdict verdict--${verdictClasses[verdict.kind]}`, '', { 'aria-labelledby': id });
  const mark = icon(verdictIcons[verdict.kind], 'lg');
  mark.classList.add('verdict__icon');
  const body = el('div', 'verdict__body');

  if (verdict.kind === 'error') {
    const types = verdict.perSourceNotes.map(({ errorType }) => errorType);
    const needsKeys = types.includes('auth');
    card.append(mark, el('h2', 'verdict__headline', t('title.error.headline'), { id }), el('p', 'verdict__detail', verdictText(verdict, t)));
    // Full-width row: a stray grid child would land in the icon column and squeeze the headline.
    if (verdict.fetchedAt === null) card.append(el('p', 'muted verdict__body', t('verdict.noRetrieval')));
    const retry = el('button', `btn btn--${needsKeys ? 'secondary' : 'primary'}`, '', { type: 'button' });
    retry.append(icon('refresh', 'sm'), t('title.error.retry'));
    retry.addEventListener('click', () => handlers.onRetry?.());
    body.className = 'verdict__body btn-row';
    if (needsKeys) {
      const keys = el('button', 'btn btn--primary', t('title.error.checkKeys'), { type: 'button' });
      keys.addEventListener('click', () => handlers.onCheckKeys?.());
      body.append(keys);
    }
    body.append(retry);
    card.append(body);
    return card;
  }

  if (verdict.home) card.append(homeRow(verdict));
  card.append(mark);
  if (verdict.kind === 'insufficient') {
    card.append(el('h2', 'verdict__headline', t('title.insufficient.headline'), { id }), el('p', 'verdict__detail', t('title.insufficient.detail')));
    if (verdict.count !== null) {
      body.append(el('p', 'muted', t('verdict.covered', { countries: countLabel(verdict.count) })));
    }
    const list = el('ul', 'prose');
    for (const note of verdict.perSourceNotes) {
      if (note.status === 'unavailable') continue;
      const item = el('li');
      const state = t(note.status === 'notFound' ? 'title.insufficient.notRecognized' : 'title.insufficient.noOffer');
      item.append(el('strong', '', `${sourceName(note.source)}:`), ` ${state}, ${formatDate(new Date(note.fetchedAt))}`);
      list.append(item);
    }
    body.append(list);
    if (title.ref) body.append(externalLink(tmdbLink(title, reconciled, verdict), t('title.checkTmdb'), 'btn btn--secondary'));
  } else {
    const headline = verdict.kind === 'available'
      ? t(verdict.count === null ? 'verdict.available.uncounted' : 'verdict.available', { service: verdict.service, countries: verdict.count === null ? '' : countLabel(verdict.count) })
      : t(verdict.count === null ? 'verdict.notFound.uncounted' : 'verdict.notFound', {
        service: verdict.service,
        countries: verdict.count === null ? '' : t(`verdict.covered.${verdict.count === 1 ? 'country' : 'countries'}`, { count: formatNumber(verdict.count) }),
      });
    card.append(el('h2', 'verdict__headline', headline, { id }), el('p', 'verdict__detail', detailLine(verdict)));
    if (verdict.kind === 'notFound') body.append(el('p', 'muted', t('verdict.limit', { service: verdict.service })));
  }
  body.append(...sourceNotes(verdict));
  if (body.childElementCount > 0) card.append(body);
  return card;
}

const tmdbUrl = ({ ref }) => `https://www.themoviedb.org/${ref}`;

function typesOf(row) {
  return OFFER_TYPES.filter((type) => SOURCES.some((id) => row.types[id].includes(type)));
}

function offerTypesLine(row) {
  const parts = SOURCES
    .filter((id) => row.types[id].length > 0)
    .map((id) => t('title.offer.bySource', {
      types: OFFER_TYPES.filter((type) => row.types[id].includes(type)).map((type) => t(`title.offer.${type}`)).join(' · '),
      source: sourceName(id),
    }));
  return parts.join(' · ');
}

function badge(row, both) {
  const make = (className, iconName, text) => {
    const node = el('span', `badge ${className}`.trim());
    node.append(icon(iconName, 'sm'), text);
    return node;
  };
  if (row.state === 'confirmed') return make('badge--confirmed', 'checkCircle', t('title.badge.confirmed'));
  if (row.state === 'conflict') return make('badge--disagree', 'alert', t('title.badge.disagree'));
  if (!both) return null;
  const only = SOURCES.find((id) => row.types[id].length > 0);
  return make('', 'info', t('title.badge.only', { source: sourceName(only) }));
}

function countryRow(row, both, saCountries) {
  const name = el('span', 'country__name', countryName(row.country.toUpperCase()));
  const [first, second] = SOURCES.map((id) => row.types[id].join());
  if (row.state === 'conflict' || (first && second && first !== second)) name.append(el('small', '', offerTypesLine(row)));
  // A known Movie of the Night list that omits the country: its languages cannot exist, whatever the row state.
  const saCovered = saCountries ? saCountries.has(row.country) : null;
  return languageRow(row, { name, badge: badge(row, both), saCovered });
}

function group(type, rows, both, saCountries) {
  const id = uniqueId('group');
  const section = el('section', 'group', '', { 'aria-labelledby': id });
  const head = el('div', 'group__head');
  head.append(
    el('h2', 'group__title', t(`title.group.${type}`), { id }),
    el('span', 'group__count', t('title.group.count', { countries: countLabel(rows.length) })),
  );
  const list = el('ul', 'countries');
  rows.forEach((row, index) => {
    const item = countryRow(row, both, saCountries);
    if (index >= INITIAL_COUNTRIES) item.hidden = true;
    list.append(item);
  });
  section.append(head, list);
  const extra = rows.length - INITIAL_COUNTRIES;
  if (extra > 0) {
    const more = el('button', 'btn btn--secondary btn--block more', t('title.more.show', { count: formatNumber(extra) }), {
      type: 'button', 'aria-expanded': 'false',
    });
    more.addEventListener('click', () => {
      const open = more.getAttribute('aria-expanded') !== 'true';
      [...list.children].forEach((item, index) => { item.hidden = !open && index >= INITIAL_COUNTRIES; });
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? t('title.more.hide') : t('title.more.show', { count: formatNumber(extra) });
    });
    section.append(more);
  }
  return section;
}

function groups(reconciled, verdict) {
  const both = verdict.sources.length === SOURCES.length;
  const box = el('div', 'groups');
  const byName = (a, b) => countryName(a.country.toUpperCase()).localeCompare(countryName(b.country.toUpperCase()));
  for (const type of OFFER_TYPES) {
    const rows = reconciled.countries.filter((row) => typesOf(row).includes(type)).sort(byName);
    if (rows.length > 0) box.append(group(type, rows, both, reconciled.coverage.sa?.countries ?? null));
  }
  return box;
}

function safeLink(value) {
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function sourceLink(source, reconciled, verdict) {
  const home = verdict.home?.country;
  const rows = [...(reconciled?.countries ?? [])].sort((a, b) => Number(b.country === home) - Number(a.country === home));
  for (const row of rows) {
    for (const offer of row.offers[source]) {
      const href = offer.link && safeLink(offer.link);
      if (href) return href;
    }
  }
  return null;
}

const serviceLink = (reconciled, verdict) => sourceLink('sa', reconciled, verdict);

// The watch-provider page TMDB supplies with its availability data, for any service (home country first);
// the plain title page is the fallback.
function tmdbLink(title, reconciled, verdict) {
  const links = reconciled?.tmdbLinks ?? new Map();
  const home = verdict.home?.country;
  for (const href of [links.get(home), ...links.values()]) {
    const safe = href && safeLink(href);
    if (safe) return safe;
  }
  return sourceLink('tmdb', reconciled, verdict) ?? tmdbUrl(title);
}

function coveredCountries(reconciled) {
  const codes = [...reconciled.coveredCountries];
  if (codes.length === 0) return null;
  const id = uniqueId('covered');
  const details = el('details', 'disclosure group covered');
  const summary = el('summary');
  const heading = el('h2', 'group__title', t('title.covered.summary', {
    countries: t(`verdict.covered.${codes.length === 1 ? 'country' : 'countries'}`, { count: formatNumber(codes.length) }),
  }), { id });
  const chevron = icon('chevDown');
  chevron.classList.add('chev');
  summary.append(heading, chevron);
  const list = el('ul', 'countries');
  codes.map((code) => countryName(code.toUpperCase())).sort((a, b) => a.localeCompare(b))
    .forEach((name) => list.append(el('li', 'country country--static', name)));
  details.append(summary, list);
  return details;
}

function dataNote(title, reconciled, verdict, { all = false } = {}) {
  const note = el('div', 'data-note');
  note.append(el('p', '', t('title.sources.heading')));
  const lines = el('ul', 'prose');
  for (const entry of verdict.perSourceNotes) {
    if (entry.status === 'unavailable') continue;
    const date = formatDate(new Date(entry.fetchedAt));
    lines.append(el('li', '', t(entry.stale ? 'verdict.source.stale' : 'verdict.source.retrieved', { source: sourceName(entry.source), date })));
  }
  note.append(lines);
  // Each source's contractual notice sits with its data: only for a source that answered.
  const answered = (id) => verdict.perSourceNotes.some(({ source, status }) => source === id && status !== 'unavailable');
  if (answered('tmdb')) note.append(justWatchNotice());
  if (answered('sa')) note.append(nightNotice());
  const links = el('div', 'data-note__links');
  if (title.ref) links.append(externalLink(tmdbLink(title, reconciled, verdict), t('title.link.tmdb'), 'link'));
  const direct = serviceLink(reconciled, verdict);
  if (direct && !all) links.append(externalLink(direct, t('title.link.service', { service: verdict.service }), 'link'));
  if (links.childElementCount > 0) note.append(links);
  const covered = coveredCountries(reconciled);
  if (covered) note.append(covered);
  return note;
}

const controllers = new WeakMap();

/**
 * Render the title page into `container`. The announcement region persists between renders, so
 * a new verdict is read out once it replaces the loading text.
 * @param {HTMLElement} container
 * @param {{status: 'details'|'loading'|'missing'|'result', title: import('../api/sources.js').Title,
 *   verdict?: ReturnType<typeof import('../core/verdict.js').computeVerdict>,
 *   reconciled?: ReturnType<typeof import('../core/reconcile.js').reconcile>,
 *   imageConfiguration?: object|null,
 *   services?: {options: {key: string, name: string, logoPath?: string}[], selected: string,
 *     all?: {reconciledAll: Map<string, object>, offers: object[], home: string|null}}}} state
 * @param {{onRetry?: () => void, onCheckKeys?: () => void, onServiceChange?: (key: string) => void}} [handlers]
 */
export function renderTitle(container, state, handlers = {}) {
  let parts = controllers.get(container);
  // The slot may have been emptied by its owner (a new query): rebuild rather than fill a detached tree.
  if (!parts || parts.root.parentNode !== container) {
    const root = el('div', 'result result-grid');
    const aside = el('div', 'result-aside');
    const main = el('div', 'result-main');
    const live = el('div', '', '', { role: 'status', 'aria-live': 'polite' });
    const rest = el('div');
    main.append(live, rest);
    root.append(aside, main);
    container.replaceChildren(root);
    parts = { root, aside, live, rest };
    controllers.set(container, parts);
  }
  const { title, status, verdict, reconciled, imageConfiguration = null, services } = state;
  // No picker while loading, and none when the sources failed: there is nothing to choose between.
  const picker = status === 'result' && verdict.kind !== 'error' && services
    ? servicePicker({ options: services.options, selected: services.selected, onChange: handlers.onServiceChange, imageConfiguration })
    : null;
  parts.aside.replaceChildren(header(title, { isSeries: status === 'result' && verdict.isSeries, configuration: imageConfiguration, picker }));
  if (status === 'details' || status === 'loading') {
    const [card, skeleton] = loadingCard(t(status === 'details' ? 'title.direct.loading' : 'title.loading'));
    parts.live.replaceChildren(card);
    parts.rest.replaceChildren(skeleton);
    return parts;
  }
  if (status === 'missing') {
    parts.live.replaceChildren(el('p', 'verdict', t('title.direct.missing')));
    parts.rest.replaceChildren();
    return parts;
  }
  const all = verdict.kind !== 'error' && services?.all
    ? allServicesView({ ...services.all, kind: verdict.kind, coveredCountries: reconciled.coveredCountries, notes: sourceNotes(verdict, { all: true }), imageConfiguration })
    : null;
  parts.live.replaceChildren(all ? all.card : verdictCard(verdict, handlers, title, reconciled));
  if (verdict.kind === 'error') {
    parts.rest.replaceChildren();
    return parts;
  }
  const content = el('div');
  content.append(...(all ? [all.groups].filter(Boolean) : [groups(reconciled, verdict)]), dataNote(title, reconciled, verdict, { all: Boolean(all) }));
  parts.rest.replaceChildren(...content.childNodes);
  return parts;
}
