import { t } from '../i18n/strings.js';
import { el, richText } from './dom.js';

function link(label, href) {
  return el('a', 'link', label, { href, target: '_blank', rel: 'noopener noreferrer' });
}

/**
 * Welcome shown while no TMDB key is saved.
 * @param {{onOpenSettings: () => void}} options
 */
export function renderWelcome({ onOpenSettings }) {
  const section = el('section', 'welcome', '', { 'aria-labelledby': 'welcome-title' });

  const intro = el('div');
  const title = el('h1', 'welcome__title', t('settings.welcome.title'), { id: 'welcome-title' });
  title.dataset.focusTarget = '';
  intro.append(title, el('p', 'welcome__lead', t('settings.welcome.lead')));

  const card = el('div', 'card');
  const head = el('div', 'card__head');
  head.append(
    el('h2', 'section-title', t('settings.welcome.card.title')),
    el('p', 'small muted', t('settings.welcome.card.lead')),
  );
  const steps = el('ol', 'steps');
  const first = el('span');
  richText(first, t('settings.welcome.step1'), {
    link: link(t('settings.welcome.step1.link'), t('settings.welcome.step1.url')),
  });
  const second = el('span');
  richText(second, t('settings.welcome.step2'), {
    link: link(t('settings.welcome.step2.link'), t('settings.tmdb.url')),
    token: el('strong', '', t('settings.welcome.step2.token')),
  });
  const third = el('span', '', t('settings.welcome.step3'));
  for (const content of [first, second, third]) {
    const item = el('li');
    item.append(content);
    steps.append(item);
  }
  card.append(head, steps);

  const start = el('button', 'btn btn--primary btn--lg btn--block', t('settings.welcome.cta'), { type: 'button' });
  start.addEventListener('click', onOpenSettings);

  section.append(intro, card, start, el('p', 'small muted', t('settings.welcome.optional')));
  return section;
}
