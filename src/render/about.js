// "About and privacy" page. Its text lives in src/i18n/en/about.js.
import strings from '../i18n/en/about.js';
import { t } from '../i18n/strings.js';
import { justWatchNotice, nightNotice } from './attribution.js';
import { el, icon, richText, uniqueId } from './dom.js';

// Own strings: the dictionary ships with this page, outside the first-load shell.
export const aboutText = (key) => strings[key];

// Every name the app writes to local storage; `*` stands for the rest of a cached entry's name.
export const STORED_ITEMS = [
  'wtw.key.tmdb', 'wtw.key.sa', 'wtw.unverified.tmdb', 'wtw.unverified.sa',
  'wtw.country', 'wtw.service', 'wtw.theme', 'wtw.lang', 'wtw.installHintDismissed',
  'wtw.cache.*', 'wtw.quota',
];

function section(name, ...content) {
  const id = uniqueId(`about-${name}`);
  const node = el('section', '', '', { 'aria-labelledby': id });
  node.append(el('h2', '', aboutText(`${name}.title`), { id }), ...content);
  return node;
}

function prose(...content) {
  const node = el('div', 'prose');
  node.append(...content);
  return node;
}

const paragraphs = (...keys) => keys.map((key) => el('p', '', aboutText(key)));

function list(items) {
  const node = el('ul', 'prose');
  node.append(...items);
  return node;
}

function storedItem(name) {
  const item = el('li');
  item.append(el('code', '', name), ' ', aboutText(`stored.${name}`));
  return item;
}

/**
 * Fill the page slots. `onClear` runs when "Clear my data" is pressed.
 * @param {{header: HTMLElement, main: HTMLElement, footer: HTMLElement}} slots
 * @param {{onClear: (button: HTMLElement) => void}} options
 * @returns {{status: HTMLElement}} The live region that announces the outcome of the erasure.
 */
export function renderAbout({ header, main, footer }, { onClear }) {
  const head = el('div', 'subpage-head');
  const back = el('a', 'icon-btn', '', { href: './', 'aria-label': aboutText('back') });
  back.append(icon('chevLeft'));
  head.append(back, el('h1', '', aboutText('title')));
  const bar = el('header', 'app-header');
  bar.append(head);
  header.replaceChildren(bar);

  const clear = el('button', 'btn btn--danger', t('settings.data.clear'), { type: 'button' });
  clear.addEventListener('click', () => onClear(clear));
  const status = el('p', 'key-state key-state--ok', '', { role: 'status' });
  const actions = el('div', 'btn-row');
  actions.append(clear, status);

  const tmdb = el('p');
  tmdb.append(el('span', 'logo-slot', t('common.attribution.tmdbName')));

  const contact = el('p');
  const link = el('a', 'link link--quiet', aboutText('publisher.contactLink'), {
    href: aboutText('publisher.contactUrl'), target: '_blank', rel: 'noopener noreferrer',
  });
  richText(contact, aboutText('publisher.contact'), { link });

  const page = el('div', 'settings');
  page.append(
    section('what', prose(...paragraphs('what.body', 'what.access'))),
    section('sent',
      prose(...paragraphs('sent.intro')),
      list(['tmdb', 'images', 'night', 'host'].map((name) => el('li', '', aboutText(`sent.${name}`)))),
      prose(...paragraphs('sent.ip'))),
    section('stored',
      prose(...paragraphs('stored.intro')),
      list(STORED_ITEMS.map(storedItem)),
      prose(...paragraphs('stored.files', 'stored.none')),
      actions),
    section('editorial', prose(...paragraphs('editorial.independent', 'editorial.geoblocking', 'editorial.collection'))),
    section('attributions', prose(tmdb, el('p', '', t('common.attribution.tmdb')), justWatchNotice(), nightNotice())),
    section('trademarks', prose(...paragraphs('trademarks.body'))),
    section('publisher', prose(...paragraphs('publisher.who', 'publisher.host'), contact)),
  );
  main.replaceChildren(page);

  const bottom = el('footer', 'site-footer');
  const line = el('p');
  line.append(el('a', 'link link--about', aboutText('back'), { href: './' }));
  bottom.append(line);
  footer.replaceChildren(bottom);
  return { status };
}
