import { HttpError } from '../../src/api/http.js';
import { render } from '../../src/render/search.js';
import { checkNoOverflow } from './kit.js';

const title = (name, year, mediaType = 'movie', tmdbId = null) => ({
  mediaType, tmdbId, imdbId: null, title: name, year, posterPath: null, ref: tmdbId ? `${mediaType}/${tmdbId}` : null,
});
const longTitle = 'The Extraordinarily Long and Winding Chronicle of the Harbour Lights Keeper and the Seventeen Lighthouses';
const eight = [
  title('Harbour Lights', 2023, 'movie', 11),
  title('Harbour Lights', 1998, 'movie', 12),
  title('The Harbour', 2021, 'tv', 13),
  title('Harbourmaster', 2019, 'tv', 14),
  title('Harbor of Echoes', 2024, 'movie', 15),
  // No poster and no year: the neutral fallback and the short meta line.
  title('Harbour Nights', null, 'tv', 16),
  title(longTitle, 2020, 'movie', 17),
  title('Harbour Road', 2016, 'movie', 18),
];

const press = (input, key) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const handlers = (log = []) => ({
  onInput: (value) => log.push(['input', value]),
  onSubmit: (value) => log.push(['submit', value]),
  onChoose: (chosen) => log.push(['choose', chosen.title, chosen.tmdbId]),
  onRetry: (value) => log.push(['retry', value]),
  onCheckKey: () => log.push(['key']),
  onCancel: () => log.push(['cancel']),
});

// The production popover is absolute from the desktop width: keep the room it covers so it does not overlap the next sample.
function reserve(container) {
  const shown = [...container.querySelectorAll('.listbox')].some((box) => !box.hidden);
  const absolute = shown && getComputedStyle(container.querySelector('.listbox')).position === 'absolute';
  container.style.paddingBottom = absolute ? 'calc(var(--popover-max-h) + var(--space-4))' : '';
}

function scenario(name, state, options = {}, verify = () => []) {
  return {
    name,
    render(container) {
      container.classList.add('search-sample');
      container.log = [];
      render(container, state, handlers(container.log), options);
      reserve(container);
    },
    check(container) {
      return [...verify(container), ...checkNoOverflow(container)];
    },
  };
}

const textOf = (container, selector) => container.querySelector(selector)?.textContent ?? '';
const live = (container) => textOf(container, '[role="status"]');

function checkCombobox(container, { expanded }) {
  const problems = [];
  const input = container.querySelector('input');
  const list = container.querySelector('ul');
  if (input.getAttribute('role') !== 'combobox') problems.push('the field is not a combobox');
  if (input.getAttribute('aria-expanded') !== String(expanded)) problems.push(`aria-expanded is not ${expanded}`);
  if (input.getAttribute('aria-controls') !== list.id) problems.push('the combobox does not control the list');
  if (input.closest('ul, ol') || list.contains(input) || input.closest('.search__field')?.parentElement !== list.parentElement) problems.push('the list is not a sibling of the field');
  if (!input.labels?.length) problems.push('the field has no label');
  if (parseFloat(getComputedStyle(input).fontSize) < 16) problems.push('the field font is under 16 px');
  return problems;
}

function checkKeyboard(container) {
  const problems = [];
  const input = container.querySelector('input');
  const list = container.querySelector('[role="listbox"]');
  const log = container.log;
  const active = () => input.getAttribute('aria-activedescendant');
  input.value = 'harb';
  press(input, 'ArrowDown');
  if (active() !== list.children[0].id || list.children[0].getAttribute('aria-selected') !== 'true') problems.push('ArrowDown does not activate the first option');
  press(input, 'ArrowUp');
  if (active() !== list.lastElementChild.id) problems.push('ArrowUp does not wrap to the last option');
  press(input, 'ArrowDown');
  press(input, 'ArrowDown');
  // The second same-titled entry (1998) is the one selected.
  if (active() !== list.children[1].id) problems.push('ArrowDown does not move to the next option');
  press(input, 'Escape');
  if (!list.hidden || input.getAttribute('aria-expanded') !== 'false' || active()) problems.push('the first Escape does not close the list');
  if (input.value !== 'harb') problems.push('the first Escape cleared the field');
  press(input, 'ArrowDown');
  if (list.hidden) problems.push('ArrowDown does not reopen the list');
  press(input, 'Enter');
  if (!log.some(([name, value, id]) => name === 'choose' && value === 'Harbour Lights' && id === 11) || !list.hidden) problems.push('Enter does not choose the active option');
  press(input, 'ArrowDown');
  press(input, 'Tab');
  if (!list.hidden || active()) problems.push('Tab does not close the list');
  render(container, { status: 'results', query: 'harb', titles: eight }, handlers(log));
  if (!list.hidden) problems.push('a results update reopens the list after Tab dismissed it');
  press(input, 'Escape');
  if (input.value !== '' || !log.some(([name]) => name === 'cancel')) problems.push('Escape on a closed list does not clear the field');
  // The clear button empties the field and keeps the list closed even if the callback renders nothing.
  render(container, { status: 'results', query: 'harb', titles: eight }, handlers(log));
  input.value = 'harb';
  input.focus();
  press(input, 'ArrowDown');
  container.querySelector('.search__field button').click();
  if (input.value !== '' || !list.hidden || input.getAttribute('aria-expanded') !== 'false') problems.push('the clear button leaves the list open');
  input.value = 'harb';
  press(input, 'Enter');
  if (!log.some(([name, value]) => name === 'submit' && value === 'harb')) problems.push('Enter without an active option does not submit');
  container.querySelectorAll('[role="option"]')[2].click();
  if (!log.some(([name, value]) => name === 'choose' && value === 'The Harbour')) problems.push('clicking an option does not choose it');
  // Leave the field filled and the list open for the capture.
  input.value = 'harb';
  render(container, { status: 'results', query: 'harb', titles: eight }, handlers(log));
  return problems;
}

let fallbackSample = null;

const scenarios = [
  scenario('Search · empty (prompt)', { status: 'idle' }, {}, (container) => {
    const problems = checkCombobox(container, { expanded: false });
    if (!textOf(container, '.search-hint').includes('Type to search')) problems.push('the prompt is missing');
    return problems;
  }),
  scenario('Search · loading', { status: 'loading', query: 'harb' }, {}, (container) => {
    const problems = checkCombobox(container, { expanded: false });
    if (live(container) !== 'Searching…') problems.push('the loading state is not announced');
    if (container.querySelectorAll('.skeleton').length === 0) problems.push('no placeholders while loading');
    for (const bar of container.querySelectorAll('.skeleton')) {
      if (getComputedStyle(bar).animationName !== 'none') problems.push('a search placeholder is animated');
    }
    return problems;
  }),
  {
    ...scenario('Search · results (8 suggestions, one without poster, one very long title)', { status: 'results', query: 'harb', titles: eight }, {}, (container) => {
      const problems = checkCombobox(container, { expanded: true });
      const options = container.querySelectorAll('[role="option"]');
      if (options.length !== 8) problems.push(`${options.length} options instead of 8`);
      if (live(container) !== '8 results available.') problems.push(`the count announced is "${live(container)}"`);
      if (!container.querySelector('.option .poster:not(:has(img))')?.textContent) problems.push('the suggestion without a poster shows no initials');
      if (!textOf(container, '.option__meta').includes('2023 · Movie')) problems.push('the year and type are missing');
      if (getComputedStyle(container.querySelector('.option__title mark')).textDecorationLine !== 'underline') problems.push('the matched part is not underlined');
      for (const option of options) {
        if (option.getBoundingClientRect().height < 44) problems.push('an option is under 44 px tall');
      }
      return problems;
    }),
    render(container) {
      container.classList.add('search-sample');
      container.log = [];
      render(container, { status: 'results', query: 'harb', titles: eight }, handlers(container.log));
      reserve(container);
    },
  },
  scenario('Search · no results', { status: 'empty', query: 'xqzt', titles: [] }, {}, (container) => {
    const problems = checkCombobox(container, { expanded: false });
    if (!container.textContent.includes('No movie or series matches “xqzt”.')) problems.push('the no-result message is missing');
    if (live(container) !== 'No results.') problems.push('the empty state is not announced');
    if (container.querySelector('.listbox__note')?.getBoundingClientRect().height === 0) problems.push('the no-result panel is not visible');
    return problems;
  }),
  scenario('Search · error (retry)', { status: 'error', query: 'harb', error: new HttpError('timeout') }, {}, (container) => {
    const problems = [];
    const button = container.querySelector('.listbox button');
    if (button?.textContent !== 'Retry') problems.push('the Retry action is missing');
    button?.click();
    if (!container.log.some(([name, value]) => name === 'retry' && value === 'harb')) problems.push('Retry does not call back');
    if (live(container) !== 'Search failed. TMDB did not answer in time. Try again.') problems.push(`the polite region does not announce the error: “${live(container)}”`);
    if (button && button.getBoundingClientRect().height < 44) problems.push('the Retry action is not visible or is under 44 px');
    if (container.querySelector('[role="status"]')?.getAttribute('aria-live') !== 'polite') problems.push('the status region is not polite');
    return problems;
  }),
  scenario('Search · error, key refused', { status: 'error', query: 'harb', error: new HttpError('auth') }, {}, (container) => {
    const button = container.querySelector('.listbox button');
    if (button?.textContent !== 'Check your key') return ['the Check your key action is missing'];
    const problems = [];
    if (live(container) !== 'Search failed. TMDB refused your key.') problems.push(`the polite region does not announce the refusal: “${live(container)}”`);
    if (button.getBoundingClientRect().height < 44) problems.push('the Check your key action is not visible or is under 44 px');
    button.focus();
    if (document.activeElement !== button) problems.push('the Check your key action cannot take keyboard focus');
    button.click();
    if (!container.log.some(([name]) => name === 'key')) problems.push('Check your key does not call back');
    return problems;
  }),
  scenario('Search · offline', { status: 'idle', online: false }, {}, (container) => {
    const problems = [];
    if (!container.querySelector('input').disabled) problems.push('the field is not disabled offline');
    if (!container.textContent.includes('Connection required')) problems.push('the offline message is missing');
    if (live(container) !== 'Connection required') problems.push('the offline state is not announced');
    return problems;
  }),
  {
    ...scenario('Search · results, fallback list of links', { status: 'results', query: 'harb', titles: eight }, { fallback: true }, (container) => {
    fallbackSample = container;
    const problems = [];
    if (container.querySelector('[role="combobox"], [role="listbox"], [role="option"]')) problems.push('the fallback still uses combobox roles');
    const links = container.querySelectorAll('ul a[href]');
    if (links.length !== 8) problems.push(`${links.length} links instead of 8`);
    return problems;
  }),
    realKeys: [{
      before(container) {
        container.querySelector('ul a[href]').focus();
      },
      keys: ['Escape'],
      after(container) {
        const problems = [];
        if (document.activeElement !== container.querySelector('input')) problems.push('Escape from a link does not return to the field');
        if (!container.querySelector('ul').hidden) problems.push('Escape from a link leaves the list open');
        return problems;
      },
    }],
  },
  {
    name: 'Search · keyboard journey',
    render(container) {
      container.classList.add('search-sample');
      container.log = [];
      render(container, { status: 'results', query: 'harb', titles: eight }, handlers(container.log));
      reserve(container);
    },
    check: (container) => [...checkKeyboard(container), ...checkNoOverflow(container)],
    // Trusted key presses: the native Escape of a search field cannot be reproduced with synthetic events.
    realKeys: [{
      before(container) {
        const input = container.querySelector('input');
        input.value = 'harb';
        input.focus();
      },
      keys: ['ArrowDown', 'Escape'],
      after(container) {
        const input = container.querySelector('input');
        const problems = [];
        if (!container.querySelector('[role="listbox"]').hidden) problems.push('a real Escape does not close the list');
        if (input.value !== 'harb') problems.push(`a real Escape changed the value to "${input.value}"`);
        return problems;
      },
    }, {
      // Last step of the page: the other keyboard checks have moved focus and closed the fallback list, so reopen it for the captures.
      keys: [],
      after() {
        const container = fallbackSample;
        container.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
        render(container, { status: 'results', query: 'harb', titles: eight }, handlers(container.log), { fallback: true });
        const list = container.querySelector('ul');
        const links = [...container.querySelectorAll('ul a[href]')];
        const problems = [];
        if (list.hidden) problems.push('the fallback list is hidden at capture time');
        if (links.length !== 8) problems.push(`${links.length} fallback links instead of 8 at capture time`);
        if (links.some((link) => link.getBoundingClientRect().height === 0)) problems.push('a fallback link is not visible at capture time');
        return problems;
      },
    }],
  },
];

export default scenarios;

// Rendering eight suggestions must stay within 100 ms (NFR-007).
export function check() {
  const problems = [];
  const container = document.createElement('div');
  document.body.append(container);
  const started = performance.now();
  render(container, { status: 'results', query: 'harb', titles: eight }, handlers());
  const elapsed = performance.now() - started;
  container.remove();
  const withPoster = document.createElement('div');
  document.body.append(withPoster);
  render(withPoster, { status: 'results', query: 'p', titles: [{ ...title('Poster Case', 2020, 'movie', 21), posterPath: '/poster.jpg' }] }, handlers());
  const image = withPoster.querySelector('.poster img');
  if (!image || !image.getAttribute('src')?.endsWith('/poster.jpg')) problems.push('a suggestion with a poster does not render its image');
  withPoster.remove();
  const many = document.createElement('div');
  document.body.append(many);
  const posters = Array.from({ length: 8 }, (_, i) => ({ ...title(`Poster ${i}`, 2020, 'movie', 40 + i), posterPath: `/p${i}.jpg` }));
  render(many, { status: 'results', query: 'p', titles: posters }, handlers());
  const modes = [...many.querySelectorAll('.poster img')].map((img) => img.getAttribute('loading'));
  if (modes[0] !== 'eager' || modes.at(-1) !== 'lazy') problems.push(`posters in later rows are not lazy-loaded (${modes.join(', ')})`);
  many.remove();

  // Tab during loading must not let late suggestions open; going offline keeps the notice visible.
  const flow = document.createElement('div');
  document.body.append(flow);
  render(flow, { status: 'loading', query: 'harb' }, handlers());
  const field = flow.querySelector('input');
  field.focus();
  press(field, 'Tab');
  render(flow, { status: 'results', query: 'harb', titles: eight }, handlers());
  if (!flow.querySelector('ul').hidden) problems.push('suggestions open after Tab during loading');
  field.value = 'harb';
  field.focus();
  render(flow, { status: 'idle', online: false }, handlers());
  field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  if (flow.querySelector('.listbox:not(ul)').hidden) problems.push('the offline notice is hidden after the field is disabled');
  flow.remove();
  if (container.querySelectorAll('[role="option"]').length !== 8) problems.push('the timing sample did not render 8 suggestions');
  if (elapsed > 100) problems.push(`rendering 8 suggestions took ${Math.round(elapsed)} ms (over 100 ms)`);
  return problems;
}
