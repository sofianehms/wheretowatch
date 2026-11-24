// Contractual attributions: TMDB, JustWatch (through TMDB) and Movie of the Night. Text always comes from `t()`.
import { t } from '../i18n/strings.js';
import { el, externalLink } from './dom.js';

/** Availability data coming from TMDB is provided by JustWatch: a plain text notice, no logo. */
export function justWatchNotice() {
  return el('p', 'attribution attribution--justwatch', t('common.attribution.justwatch'));
}

/** Notice required next to Movie of the Night data, with the link to its API page. */
export function nightNotice() {
  const text = t('common.attribution.night');
  const label = t('common.attribution.nightLink');
  const notice = el('p', 'attribution attribution--night');
  const at = text.lastIndexOf(label);
  if (at === -1) {
    notice.append(text);
    return notice;
  }
  const link = el('a', 'link link--quiet', label, { href: t('common.attribution.nightUrl'), target: '_blank', rel: 'noopener noreferrer' });
  notice.append(text.slice(0, at), link, text.slice(at + label.length));
  return notice;
}

/**
 * Site footer: TMDB (name as text until the owner places the official logo), its required sentence,
 * and the JustWatch notice with a link to TMDB.
 * @param {HTMLElement} container
 */
export function renderFooter(container) {
  const footer = el('footer', 'site-footer');
  const body = el('div', 'site-footer__body');
  body.append(
    el('p', 'site-footer__tmdb', t('common.attribution.tmdbName')),
    el('p', '', t('common.attribution.tmdb')),
    justWatchNotice(),
    externalLink(t('common.attribution.tmdbUrl'), t('common.attribution.viewTmdb'), 'link'),
  );
  footer.append(body);
  container.replaceChildren(footer);
  return footer;
}
