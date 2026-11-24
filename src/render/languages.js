// Per-country disclosure: audio and subtitle languages, shown on demand. Text always comes from `t()`.
import { languageName, t } from '../i18n/strings.js';
import { el, icon, uniqueId } from './dom.js';

const KINDS = ['audio', 'subtitle'];

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

function panelBody(row) {
  if (row.state === 'outsideSaCoverage') return [el('p', 'langs__note', t('title.langs.notCovered'))];
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
 * One country row whose languages open on demand.
 * @param {{country: string, state: string, offers: {sa: object[]}}} row
 * @param {{name: HTMLElement, badge: HTMLElement|null}} parts Name and optional source badge of the row.
 */
export function languageRow(row, { name, badge }) {
  const id = uniqueId('langs');
  const item = el('li', 'country');
  const toggle = el('button', 'country__toggle', '', { type: 'button', 'aria-expanded': 'false', 'aria-controls': id });
  const chevron = icon('chevDown');
  chevron.classList.add('chev');
  toggle.append(name);
  if (badge) toggle.append(badge);
  toggle.append(chevron);
  const panel = el('div', 'langs', '', { id, hidden: '' });
  panel.append(...panelBody(row));
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  });
  item.append(toggle, panel);
  return item;
}
