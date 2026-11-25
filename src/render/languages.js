// Per-country disclosure: offer quality and expiry, audio and subtitle languages, shown on demand. Text always comes from `t()`.
import { formatDate, languageName, t } from '../i18n/strings.js';
import { el, icon, uniqueId } from './dom.js';

const KINDS = ['audio', 'subtitle'];
const OFFER_TYPES = ['subscription', 'free', 'rent', 'buy'];
// Ascending, so the index ranks them.
const QUALITIES = ['sd', 'hd', 'qhd', 'uhd'];

const baseName = ({ language, region }) => languageName(region ? `${language}-${region}` : language);

// Distinct tracks of one country across its offers, listed A to Z with the SDH variant after its language.
function tracksOf(row) {
  const seen = new Map();
  for (const offer of row.offers.sa ?? []) {
    for (const track of offer.languages ?? []) {
      seen.set(`${track.kind}|${track.language}|${track.region ?? ''}|${track.closedCaptions}`, track);
    }
  }
  const all = [...seen.values()].map((track) => ({ track, name: baseName(track) }));
  return Object.fromEntries(KINDS.map((kind) => [kind, all
    .filter(({ track }) => track.kind === kind)
    .sort((a, b) => a.name.localeCompare(b.name) || Number(a.track.closedCaptions) - Number(b.track.closedCaptions))
    .map(({ track, name }) => ({ closedCaptions: track.closedCaptions, label: track.closedCaptions ? t('title.langs.sdh', { language: name }) : name }))]));
}

/**
 * What the second source says about each offer of one country: its type, best quality and leaving date.
 * Offers of one type that leave on the same day (or have no date) share a line with the best of their
 * qualities. A date already past (saved data) is dropped, and a line with nothing to add is omitted.
 * @param {{offers: {sa?: {offerType: string, quality: string|null, expiresOn: string|null}[]}}} row
 * @param {number} [now] Timestamp in milliseconds.
 * @returns {{type: string, quality: string|null, leaves: string|null}[]} By offer type, soonest date first, undated last.
 */
export function offerDetails(row, now = Date.now()) {
  const lines = new Map();
  for (const offer of row.offers.sa ?? []) {
    const time = Date.parse(offer.expiresOn);
    const expiry = time > now ? time : Infinity;
    const leaves = expiry === Infinity ? null : formatDate(new Date(expiry));
    const key = `${offer.offerType}|${leaves}`;
    const line = lines.get(key) ?? { type: offer.offerType, rank: -1, expiry, leaves };
    line.rank = Math.max(line.rank, QUALITIES.indexOf(offer.quality));
    lines.set(key, line);
  }
  return [...lines.values()]
    .filter(({ rank, leaves }) => rank >= 0 || leaves)
    .sort((a, b) => OFFER_TYPES.indexOf(a.type) - OFFER_TYPES.indexOf(b.type) || (a.expiry < b.expiry ? -1 : 1))
    .map(({ type, rank, leaves }) => ({ type, quality: QUALITIES[rank] ?? null, leaves }));
}

function offersBlock(row) {
  const details = offerDetails(row);
  if (details.length === 0) return [];
  const block = el('div', 'langs__offers');
  for (const { type, quality, leaves } of details) {
    const line = el('p');
    const facts = [quality && t(`title.quality.${quality}`), leaves && t('title.offer.leaves', { date: leaves })].filter(Boolean);
    line.append(el('strong', '', t(`title.offer.${type}`)), ` · ${facts.join(' · ')}`);
    block.append(line);
  }
  return [block];
}

function panelBody(row, saCovered) {
  const noSaOffer = (row.offers.sa ?? []).length === 0;
  if (row.state === 'outsideSaCoverage' || (saCovered === false && noSaOffer)) return [el('p', 'langs__note', t('title.langs.notCovered'))];
  const tracks = tracksOf(row);
  if (KINDS.every((kind) => tracks[kind].length === 0)) return [el('p', 'langs__note', t('title.langs.missing'))];
  const list = el('dl', 'langs__list');
  for (const kind of KINDS) {
    const entries = el('ul');
    if (tracks[kind].length === 0) entries.append(el('li', 'langs__none', t('title.langs.none')));
    for (const { label } of tracks[kind]) entries.append(el('li', '', label));
    const item = el('div');
    const body = el('dd');
    body.append(entries);
    item.append(el('dt', '', t(`title.langs.${kind}`)), body);
    list.append(item);
  }
  const body = [list];
  if (tracks.subtitle.some(({ closedCaptions }) => closedCaptions)) {
    body.push(el('p', 'langs__note', t('title.langs.sdhNote')));
  }
  return body;
}

/**
 * One country row whose offer details and languages open on demand.
 * @param {{country: string, state: string, offers: {sa: object[]}}} row
 * @param {{name: HTMLElement, badge: HTMLElement|null, saCovered?: boolean|null}} parts Name and optional source badge of the row;
 *   `saCovered` tells whether the second source's coverage list holds the country (null when that list is unknown).
 */
export function languageRow(row, { name, badge, saCovered = null }) {
  const id = uniqueId('langs');
  const item = el('li', 'country');
  const toggle = el('button', 'country__toggle', '', { type: 'button', 'aria-expanded': 'false', 'aria-controls': id });
  const chevron = icon('chevDown');
  chevron.classList.add('chev');
  toggle.append(name);
  if (badge) toggle.append(badge);
  toggle.append(chevron);
  const panel = el('div', 'langs', '', { id, hidden: '' });
  panel.append(...offersBlock(row), ...panelBody(row, saCovered));
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  });
  item.append(toggle, panel);
  return item;
}
