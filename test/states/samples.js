// Isolated samples of the remaining components: search error, verdict variants, recent rail,
// install prompt, expanded country row and key-field states. Each one checks its own semantics.
import {
  icons, icon, el, resolveToken, checkNoOverflow, checkFocusRing,
} from './kit.js';

let counter = 0;
const uid = (prefix) => `${prefix}-${counter += 1}`;

function verdict(kind, iconName, headline, detail, { role, headingId } = {}) {
  const id = headingId ?? uid('verdict-head');
  const card = el('section', `verdict verdict--${kind}`, '', { 'aria-labelledby': id });
  if (role) card.setAttribute('role', role);
  const mark = icon(iconName, 'lg');
  mark.classList.add('verdict__icon');
  card.append(mark, el('h3', 'verdict__headline', headline, { id }), el('p', 'verdict__detail', detail));
  return card;
}

const iconPath = (node) => node.querySelector('path').getAttribute('d');

const searchError = {
  name: 'Search · error with retry',
  render(container) {
    const form = el('div', 'search sample-anchor');
    const frame = el('div', 'search__field');
    const input = el('input', 'search__input', '', { type: 'search', 'aria-label': 'Search for a title', placeholder: 'Search a movie or series' });
    input.value = 'dune';
    frame.append(icon('search'), input);
    const list = el('div', 'listbox', '', { role: 'alert' });
    const note = el('p', 'listbox__note');
    note.append(el('strong', '', 'Search is unavailable.'), document.createTextNode(' Something went wrong on our side.'));
    const retry = el('button', 'btn btn--secondary', 'Try again', { type: 'button' });
    // The sample's own retry handler: the check clicks the real control and reads what the handler did.
    retry.addEventListener('click', () => {
      form.dataset.retried = String(Number(form.dataset.retried || 0) + 1);
      list.setAttribute('aria-busy', 'true');
    });
    note.append(retry);
    list.append(note);
    form.append(frame, list);
    container.append(form);
  },
  check(container) {
    const problems = checkNoOverflow(container);
    const retry = container.querySelector('.listbox button');
    if (!retry || !/try again/i.test(retry.textContent) || !retry.checkVisibility({ opacityProperty: true, visibilityProperty: true })) problems.push('the search error has no visible retry action');
    else {
      retry.click();
      if (container.querySelector('.search').dataset.retried !== '1' || retry.disabled) problems.push('the retry action cannot be activated');
    }
    if (!container.querySelector('.listbox[role="alert"]')) problems.push('the search error is not announced as an alert');
    return problems;
  },
};

const notRecognized = {
  name: 'Verdict · title not recognized by the second source',
  render(container) {
    const card = verdict('available', 'check', 'Available on Netflix in 3 countries', 'One source only · 21 Nov 2026');
    const body = el('div', 'verdict__body');
    const banner = el('div', 'banner banner--caution', '', { role: 'note' });
    const text = el('div');
    text.append(el('span', 'banner__title', 'Second source: title not recognized'), 'The second source does not know this title.');
    banner.append(icon('info'), text);
    body.append(banner);
    card.append(body);
    container.append(card);
  },
  check(container) {
    const problems = checkNoOverflow(container);
    const banner = container.querySelector('.verdict__body .banner--caution');
    if (!banner || !/not recognized/i.test(banner.textContent)) problems.push('the unrecognized-title note is missing');
    else if (getComputedStyle(banner.querySelector('svg')).color !== resolveToken('--color-caution', 'color')) problems.push('the note icon is not amber');
    return problems;
  },
};

const insufficient = {
  name: 'Verdict · not enough data',
  render(container) {
    const card = verdict('unknown', 'help', 'Not enough data to conclude', 'This title may not be tracked by the sources.');
    const body = el('div', 'verdict__body');
    const list = el('ul');
    for (const [source, text] of [['JustWatch (via TMDB)', 'no offer listed'], ['Movie of the Night', 'title not recognized']]) {
      const item = el('li');
      item.append(el('strong', '', `${source}: `), text);
      list.append(item);
    }
    const link = el('a', 'btn btn--secondary', 'Check on TMDB', { href: '#' });
    link.append(icon('external', 'sm'));
    body.append(list, link);
    card.append(body);
    container.append(card);
  },
  check(container) {
    const problems = checkNoOverflow(container);
    const mark = container.querySelector('.verdict__icon');
    if (iconPath(mark) !== icons.help) problems.push('the insufficient-data verdict does not use the question mark');
    if (getComputedStyle(mark).color !== resolveToken('--color-caution', 'color')) problems.push('the insufficient-data icon is not amber');
    if (container.querySelectorAll('.verdict__body li').length < 2) problems.push('the status of each source is missing');
    if (!container.querySelector('.verdict__body a.btn')) problems.push('the TMDB link is missing');
    return problems;
  },
};

const recentRail = {
  name: 'Recent titles · rail of four',
  render(container) {
    const section = el('section', 'recent-rail', '', { 'aria-labelledby': 'rail-title' });
    section.append(el('h3', 'section-title', 'Viewed on this device', { id: 'rail-title' }));
    const rail = el('ul', 'rail');
    [['HL', 'Harbour Lights', 'tone-2'], ['QO', 'The Quiet Orchard', 'tone-5'], ['PM', 'Paper Moons', 'tone-4'], ['KL', 'Kites Over Lisbon', 'tone-3']].forEach(([initials, title, tone]) => {
      const item = el('li');
      const link = el('a', '', '', { href: '#' });
      link.append(el('div', `poster ${tone}`, initials, { 'aria-hidden': 'true' }), el('span', '', title));
      item.append(link);
      rail.append(item);
    });
    section.append(rail);
    container.append(section);
  },
  check(container) {
    const problems = checkNoOverflow(container);
    const links = [...container.querySelectorAll('.rail a')];
    if (links.length !== 4) problems.push('the rail does not hold four titles');
    // Four posters sit on one row whenever the width allows it; at high text zoom the rail wraps instead of overflowing.
    const slot = links[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(container.querySelector('.rail')).columnGap);
    const tops = new Set(links.map((link) => link.getBoundingClientRect().top));
    if (container.clientWidth >= 4 * slot + 3 * gap && tops.size !== 1) problems.push('the four titles do not share one row');
    for (const link of links) if (!link.textContent.trim()) problems.push('a rail title has no name');
    return problems;
  },
};

const installPrompt = {
  name: 'Install prompt',
  render(container) {
    const section = el('section', 'install', '', { 'aria-labelledby': 'install-title' });
    const head = el('div', 'install__head');
    const dismiss = el('button', 'icon-btn', '', { type: 'button', 'aria-label': 'Dismiss' });
    dismiss.append(icon('close'));
    head.append(el('h3', '', 'Add to your Home Screen', { id: 'install-title' }), dismiss);
    const steps = el('ol');
    for (const [iconName, text] of [['search', 'Tap Share in Safari.'], ['check', 'Choose Add to Home Screen.'], ['info', 'Keep Open as Web App on.']]) {
      const item = el('li');
      item.append(icon(iconName, 'sm'), el('span', '', text));
      steps.append(item);
    }
    section.append(head, steps, el('p', 'small muted', 'The installed app has its own storage: paste your keys again there.'));
    container.append(section);
  },
  check(container) {
    const problems = checkNoOverflow(container);
    const dismiss = container.querySelector('button[aria-label="Dismiss"]');
    if (!dismiss?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) problems.push('the install prompt cannot be dismissed');
    if (container.querySelectorAll('ol > li').length !== 3) problems.push('the install prompt does not list three steps');
    return problems;
  },
};

const expandedCountry = {
  name: 'Country row · expanded with languages',
  render(container) {
    const panelId = uid('langs');
    const row = el('div', 'country');
    const toggle = el('button', 'country__toggle', '', { type: 'button', 'aria-expanded': 'true', 'aria-controls': panelId });
    const chevron = icon('chevron');
    chevron.classList.add('chev');
    toggle.append(el('span', 'country__name', 'France'), el('span', 'badge badge--disagree', 'Sources disagree'), chevron);
    const panel = el('div', 'langs', '', { id: panelId });
    const list = el('dl', 'langs__list');
    list.append(el('dt', '', 'Audio'), el('dd', '', 'French, English'), el('dt', '', 'Subtitles'), el('dd', '', 'French, English, Spanish'));
    panel.append(list);
    row.append(toggle, panel);
    container.append(row);
  },
  check(container) {
    const problems = checkNoOverflow(container);
    const toggle = container.querySelector('.country__toggle');
    if (container.querySelector(`#${toggle.getAttribute('aria-controls')}`) === null) problems.push('the toggle does not control its panel');
    if (getComputedStyle(toggle.querySelector('.chev')).transform === 'none') problems.push('the chevron does not turn when the row is expanded');
    if (container.querySelectorAll('dl dt').length !== container.querySelectorAll('dl dd').length) problems.push('the languages are not paired terms and values');
    return problems;
  },
};

const keyStates = [
  ['edited', 'info', 'edit', 'Not saved yet', 'password'],
  ['testing', 'refresh', 'busy', 'Testing…', 'password'],
  ['valid', 'check', 'ok', 'Key works. Save it to use it.', 'text'],
  ['rejected', 'alert', 'bad', 'TMDB rejected this key. Check that you copied the API Read Access Token.', 'password'],
  ['network', 'alert', 'bad', 'Couldn’t reach TMDB. Check your connection and test again.', 'password'],
].map(([name, iconName, kind, message, type]) => ({
  name: `Key field · ${name}`,
  render(container) {
    const id = uid('key');
    const field = el('div', 'field');
    const label = el('label', 'field__label', 'TMDB key ', { for: id });
    label.append(el('small', '', 'Required'));
    const row = el('div', 'input-row');
    const input = el('input', '', '', { id, type, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': `${id}-state` });
    input.value = 'eyJhbGciOiJIUzI1NiJ9.example';
    const show = el('button', 'btn btn--ghost', type === 'text' ? 'Hide' : 'Show', { type: 'button', 'aria-pressed': String(type === 'text') });
    row.append(input, show);
    const state = el('p', `key-state key-state--${kind}`, '', { id: `${id}-state` });
    if (kind !== 'edit') state.setAttribute('role', 'status');
    state.append(icon(iconName, 'sm'), message);
    const actions = el('div', 'btn-row');
    actions.append(el('button', 'btn btn--secondary', 'Test', { type: 'button' }), el('button', `btn btn--${name === 'valid' || name === 'edited' ? 'primary' : 'secondary'}`, 'Save', { type: 'button' }));
    field.append(label, row, state, actions);
    container.append(field);
  },
  check(container) {
    const problems = [...checkFocusRing(container), ...checkNoOverflow(container)];
    const state = container.querySelector('.key-state');
    const input = container.querySelector('input');
    const expected = { edit: '--color-text-muted', busy: '--color-text-muted', ok: '--color-positive', bad: '--color-danger' }[kind];
    if (getComputedStyle(state).color !== resolveToken(expected, 'color')) problems.push(`the key status is not ${expected}`);
    if (!state.querySelector('svg') || !state.textContent.trim()) problems.push('the key status needs an icon and a text, not color alone');
    if (input.getAttribute('aria-describedby') !== state.id) problems.push('the key field is not described by its status');
    if (input.type !== type) problems.push(`the key is ${input.type}, expected ${type}`);
    return problems;
  },
}));

export default [searchError, notRecognized, insufficient, recentRail, installPrompt, expandedCountry, ...keyStates];
