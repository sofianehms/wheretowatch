// One scenario per base component and per variant: normal, simulated hover, focus, disabled.
// Hover and focus come from the production rules (see ../states-sim.js), so they are measured, not drawn.
import {
  icons,
  icon,
  el,
  variants,
  resolveToken,
  fillClass,
  applyVariant,
  checkFocusRing,
  checkHover,
  checkNoOverflow,
  checkDisabledFrame,
  checkDisabledControl,
  checkResting,
  checkSkeletonVisible,
} from './kit.js';
import sampleScenarios from './samples.js';

function buttonScenarios() {
  const kinds = [
    ['primary', 'Primary button', { background: '--color-accent', color: '--color-accent-text' }],
    ['secondary', 'Secondary button', { color: '--color-text', borderColor: '--color-border-strong' }],
    ['ghost', 'Ghost button', { color: '--color-text' }],
    ['danger', 'Danger button', { color: '--color-danger', borderColor: '--color-danger' }],
  ];
  return kinds.flatMap(([kind, label, resting]) => variants.map((variant) => ({
    name: `Button · ${kind} · ${variant}`,
    render(container) {
      container.append(applyVariant(el('button', `btn btn--${kind}`, label, { type: 'button' }), variant));
    },
    check(container) {
      const button = container.querySelector('.btn');
      const problems = [...checkFocusRing(container), ...checkHover(container), ...checkNoOverflow(container)];
      if (variant === 'normal') problems.push(...checkResting(button, resting));
      if (variant === 'hover' && kind === 'primary') problems.push(...checkResting(button, { color: '--color-accent-text' }));
      if (variant === 'disabled') {
        problems.push(...checkDisabledControl(button));
        if (getComputedStyle(button).opacity !== resolveToken('--disabled-opacity', 'opacity')) problems.push('the disabled button is not at the disabled opacity');
        if (getComputedStyle(button).borderTopStyle === 'dashed') problems.push('the disabled button uses the field frame');
      }
      return problems;
    },
  })));
}

function iconButtonScenarios() {
  return variants.map((variant) => ({
    name: `Icon button · ${variant}`,
    render(container) {
      const button = el('button', 'icon-btn', '', { type: 'button', 'aria-label': 'Close' });
      button.append(icon('close', 'lg'));
      container.append(applyVariant(button, variant));
    },
    check(container) {
      const button = container.querySelector('.icon-btn');
      const problems = [...checkFocusRing(container), ...checkHover(container)];
      if (variant === 'normal') problems.push(...checkResting(button, { color: '--color-text' }));
      if (variant === 'disabled') problems.push(...checkDisabledControl(button), ...checkResting(button, { color: '--color-text' }));
      return problems;
    },
  }));
}

// Text fields have no hover state in the design brief: normal, focus and disabled only.
const fieldVariants = variants.filter((variant) => variant !== 'hover');

function fieldScenarios() {
  return fieldVariants.map((variant) => ({
    name: `Field · ${variant}`,
    render(container) {
      const field = el('div', 'field');
      const label = el('label', 'field__label', 'TMDB access token', { for: `field-${variant}` });
      label.append(el('small', '', 'Stays on this device'));
      const row = el('div', 'input-row');
      const input = el('input', '', '', { id: `field-${variant}`, type: 'text', placeholder: 'Paste your token' });
      row.append(input);
      field.append(label, row, el('p', 'field__help', 'Free, about 2 minutes.'));
      applyVariant(input, variant);
      container.append(field);
    },
    check: (container) => [
      ...checkFocusRing(container),
      ...(variant === 'disabled' ? [...checkDisabledFrame(container, '.input-row'), ...checkDisabledControl(container.querySelector('input'))] : []),
    ],
  }));
}

function searchScenarios() {
  return fieldVariants.map((variant) => ({
    name: `Search field · ${variant}`,
    render(container) {
      const form = el('div', 'search');
      const frame = el('div', `search__field${variant === 'disabled' ? ' search__field--disabled' : ''}`);
      const input = el('input', 'search__input', '', {
        type: 'search', 'aria-label': 'Search for a title', placeholder: 'Search a movie or series',
      });
      frame.append(icon('search'), input);
      form.append(frame);
      applyVariant(input, variant);
      container.append(form);
    },
    check: (container) => [
      ...checkFocusRing(container),
      ...(variant === 'disabled' ? [...checkDisabledFrame(container, '.search__field'), ...checkDisabledControl(container.querySelector('input'))] : []),
    ],
  }));
}

// A search field with its own anchor, so the suggestion list below it stays in its row.
function searchBox({ value = '', disabled = false } = {}) {
  const form = el('div', 'search sample-anchor');
  const frame = el('div', `search__field${disabled ? ' search__field--disabled' : ''}`);
  const input = el('input', 'search__input', '', {
    type: 'search', 'aria-label': 'Search for a title', placeholder: 'Search a movie or series',
  });
  input.value = value;
  input.disabled = disabled;
  frame.append(icon('search'), input);
  if (value && !disabled) {
    const clear = el('button', 'icon-btn', '', { type: 'button', 'aria-label': 'Clear the search' });
    clear.append(icon('close'));
    frame.append(clear);
  }
  form.append(frame);
  return form;
}

const suggestions = [
  ['Dark', 'Series · 2015', 'tone-1', 'DA'],
  ['Dune', 'Movie · 2021', 'tone-3', 'DU'],
];

// One connected combobox: the input owns the listbox, and the arrow keys move the active option.
function comboboxScenario() {
  return {
    name: 'Search · combobox keyboard',
    render(container) {
      const wrap = el('div', 'search sample-anchor');
      const frame = el('div', 'search__field');
      const input = el('input', 'search__input', '', {
        type: 'search', role: 'combobox', 'aria-label': 'Search for a title', 'aria-autocomplete': 'list',
        'aria-expanded': 'true', 'aria-controls': 'combo-list',
      });
      input.value = 'dun';
      frame.append(icon('search'), input);
      const list = el('ul', 'listbox', '', { role: 'listbox', id: 'combo-list', 'aria-label': 'Suggestions' });
      suggestions.forEach(([title, meta, tone, initials], index) => {
        const option = el('li', 'option', '', { role: 'option', id: `combo-option-${index}`, 'aria-selected': 'false' });
        const lines = el('span', 'option__lines');
        lines.append(el('span', 'option__title', title), el('span', 'option__meta', meta));
        option.append(el('div', `poster ${tone}`, initials, { 'aria-hidden': 'true' }), lines);
        option.addEventListener('mousedown', (event) => event.preventDefault());
        list.append(option);
      });
      const status = el('p', 'visually-hidden', `${suggestions.length} results available.`, { role: 'status' });
      wrap.append(frame, list, status);
      container.append(wrap);

      let active = -1;
      const options = [...list.children];
      const setOpen = (open) => {
        list.hidden = !open;
        input.setAttribute('aria-expanded', String(open));
        if (!open) setActive(-1);
      };
      const setActive = (index) => {
        active = index;
        options.forEach((option, position) => option.setAttribute('aria-selected', String(position === index)));
        if (index < 0) input.removeAttribute('aria-activedescendant');
        else input.setAttribute('aria-activedescendant', options[index].id);
      };
      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setOpen(true);
          setActive((active + 1) % options.length);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
          setActive((active - 1 + options.length) % options.length);
        } else if (event.key === 'Enter' && active >= 0) {
          event.preventDefault();
          input.value = options[active].querySelector('.option__title').textContent;
          setOpen(false);
        } else if (event.key === 'Escape') {
          if (!list.hidden) setOpen(false);
          else input.value = '';
        } else if (event.key === 'Tab') {
          setOpen(false);
        }
      });
    },
    check(container) {
      const input = container.querySelector('[role="combobox"]');
      const list = container.querySelector('[role="listbox"]');
      const press = (key) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      const problems = [];
      if (input.getAttribute('aria-controls') !== list.id) problems.push('the combobox does not control its listbox');
      if (input.getAttribute('aria-expanded') !== 'true') problems.push('the combobox is not expanded with suggestions');
      if (!container.querySelector('[role="status"]')?.textContent.includes('results available')) problems.push('the suggestion count is not announced');
      input.focus();
      press('ArrowDown');
      if (input.getAttribute('aria-activedescendant') !== 'combo-option-0') problems.push('ArrowDown does not activate the first option');
      press('ArrowDown');
      if (input.getAttribute('aria-activedescendant') !== 'combo-option-1' || document.getElementById('combo-option-1').getAttribute('aria-selected') !== 'true') problems.push('ArrowDown does not move the active option');
      press('ArrowUp');
      if (input.getAttribute('aria-activedescendant') !== 'combo-option-0') problems.push('ArrowUp does not move back');
      press('Escape');
      if (!list.hidden || input.getAttribute('aria-expanded') !== 'false' || input.hasAttribute('aria-activedescendant')) problems.push('Escape does not close the list first');
      if (input.value !== 'dun') problems.push('the first Escape cleared the field');
      press('Escape');
      if (input.value !== '') problems.push('the second Escape does not clear the field');
      input.value = 'dun';
      press('ArrowDown');
      press('ArrowDown');
      press('Enter');
      if (input.value !== 'Dune' || !list.hidden) problems.push('Enter does not choose the active option');
      press('ArrowDown');
      press('Tab');
      if (!list.hidden || input.hasAttribute('aria-activedescendant')) problems.push('Tab does not leave the list');
      // Leave the sample open so the capture shows the suggestions.
      input.value = 'dun';
      press('ArrowDown');
      press('ArrowUp');
      press('ArrowUp');
      return [...problems, ...checkNoOverflow(container)];
    },
  };
}

function searchStateScenarios() {
  const note = (title, text) => {
    const list = el('div', 'listbox', '', { role: 'status' });
    const box = el('p', 'listbox__note');
    box.append(el('strong', '', title), document.createTextNode(` ${text}`));
    list.append(box);
    return list;
  };
  return [
    comboboxScenario(),
    {
      name: 'Search · empty',
      render(container) {
        container.append(searchBox(), el('p', 'search-hint', 'Type at least 2 letters to search.'));
      },
      check: (container) => container.querySelector('.search__input').value === '' ? checkNoOverflow(container) : ['the empty search holds text'],
    },
    {
      name: 'Search · with text and clear button',
      render(container) {
        container.append(searchBox({ value: 'dune' }));
      },
      check(container) {
        return container.querySelector('button[aria-label="Clear the search"]') ? checkNoOverflow(container) : ['the populated search has no clear button'];
      },
    },
    {
      name: 'Search · loading',
      render(container) {
        const wrap = searchBox({ value: 'dune' });
        const list = el('div', 'listbox', '', { role: 'status', 'aria-label': 'Searching' });
        const stack = el('div', 'skeleton-stack');
        stack.append(el('span', 'skeleton skeleton--row'), el('span', 'skeleton skeleton--row'));
        list.append(stack);
        wrap.append(list);
        container.append(wrap);
      },
      check: (container) => container.querySelectorAll('.skeleton').length >= 2
        ? [...checkSkeletonVisible(container), ...checkNoOverflow(container)] : ['the search loading sample has no placeholders'],
    },
    {
      name: 'Search · no results',
      render(container) {
        const wrap = searchBox({ value: 'zzzz' });
        wrap.append(note('No title found for "zzzz".', 'Check the spelling or try another title.'));
        container.append(wrap);
      },
      check: (container) => /no title found/i.test(container.textContent) ? checkNoOverflow(container) : ['the no-results message is missing'],
    },
    {
      name: 'Search · offline',
      render(container) {
        const banner = el('div', 'banner banner--caution', '', { role: 'status' });
        const body = el('div');
        body.append(el('strong', 'banner__title', 'You are offline'), el('span', '', 'Search is paused. Titles you opened before still work.'));
        banner.append(icon('offline'), body);
        container.append(searchBox({ disabled: true }), banner);
      },
      check(container) {
        const problems = checkDisabledFrame(container, '.search__field');
        const text = container.querySelector('.banner').textContent;
        if (!/offline/i.test(text) || !/paused|still work/i.test(text)) problems.push('the offline banner gives no reason');
        return [...problems, ...checkNoOverflow(container)];
      },
    },
  ];
}

function pillScenarios() {
  const pills = [
    ['confirmed', 'check', 'Confirmed by both sources'],
    ['disagree', 'alert', 'Sources disagree'],
  ];
  return [
    ...pills.map(([kind, iconName, text]) => ({
      name: `Pill · ${kind}`,
      render(container) {
        const pill = el('span', `pill pill--${kind}`);
        pill.append(icon(iconName, 'sm'), text);
        container.append(pill);
      },
    })),
    {
      name: 'Pill · confirmed and disagree are told apart without color',
      render(container) {
        const wrap = el('div', 'btn-row');
        for (const [kind, iconName, text] of pills) {
          const pill = el('span', `pill pill--${kind}`);
          pill.append(icon(iconName, 'sm'), text);
          wrap.append(pill);
        }
        container.append(wrap);
      },
      check(container) {
        const [confirmed, disagree] = container.querySelectorAll('.pill');
        const problems = [];
        if (confirmed.textContent === disagree.textContent) problems.push('the pills share one label');
        if (confirmed.querySelector('path').getAttribute('d') === disagree.querySelector('path').getAttribute('d')) {
          problems.push('the pills share one icon');
        }
        return problems;
      },
    },
  ];
}

function bannerScenarios() {
  return [['', 'Notice'], ['caution', 'Quota nearly reached'], ['danger', 'Something went wrong']].map(([kind, title]) => ({
    name: `Banner · ${kind || 'neutral'}`,
    render(container) {
      const banner = el('div', `banner${kind ? ` banner--${kind}` : ''}`, '', { role: 'status' });
      const body = el('div');
      body.append(el('strong', 'banner__title', title), el('span', '', 'A short explanation with the next step.'));
      banner.append(icon(kind === 'danger' || kind === 'caution' ? 'alert' : 'check'), body);
      container.append(banner);
    },
    check: checkNoOverflow,
  }));
}

function listScenarios() {
  const rows = [
    ['Dark', 'Series · 2015', 'tone-1', 'DA'],
    ['Dune', 'Movie · 2021', 'tone-3', 'DU'],
  ];
  return variants.filter((variant) => variant !== 'disabled').map((variant) => ({
    name: `List of options · ${variant}`,
    render(container) {
      const list = el('ul', 'listbox', '', { role: 'listbox', 'aria-label': 'Suggestions' });
      rows.forEach(([title, meta, tone, initials], index) => {
        const option = el('li', 'option', '', { role: 'option', tabindex: '-1', 'aria-selected': String(variant === 'focus' && index === 0) });
        const poster = el('div', `poster ${tone}`, initials, { 'aria-hidden': 'true' });
        const lines = el('span', 'option__lines');
        lines.append(el('span', 'option__title', title), el('span', 'option__meta', meta));
        option.append(poster, lines);
        if (variant === 'hover' && index === 0) option.classList.add('is-hover');
        list.append(option);
      });
      const anchor = el('div', 'sample-anchor');
      anchor.append(list);
      container.append(anchor);
    },
    check(container) {
      const problems = checkHover(container);
      const active = container.querySelector('[aria-selected="true"]');
      if (active && getComputedStyle(active).boxShadow === 'none') problems.push('the active option has no marker');
      return problems;
    },
  }));
}

function panelScenarios() {
  return [
    {
      name: 'Panel · card',
      render(container) {
        const card = el('div', 'card');
        card.append(el('h3', 'section-title', 'Get a free key'), el('p', 'muted small', 'Two short steps.'));
        container.append(card);
      },
      check: checkNoOverflow,
    },
    {
      name: 'Panel · verdict · available, reference country first',
      render(container) {
        const verdict = el('section', 'verdict verdict--available', '', { 'aria-labelledby': 'verdict-available-head' });
        const home = el('p', 'home');
        const where = el('span', 'home__where', 'France ');
        where.append(el('small', '', 'your country'));
        const status = el('span', 'status status--no');
        status.append(icon('ban', 'sm'), 'Not on Netflix');
        home.append(where, status);
        const mark = icon('check', 'lg');
        mark.classList.add('verdict__icon');
        verdict.append(
          home, mark,
          el('h3', 'verdict__headline', 'Available on Netflix in 21 countries', { id: 'verdict-available-head' }),
          el('p', 'verdict__detail', 'Both sources · 21 Nov 2026'),
        );
        container.append(verdict);
      },
      check(container) {
        const problems = checkNoOverflow(container);
        const verdict = container.querySelector('.verdict');
        if (verdict.firstElementChild !== container.querySelector('.home')) problems.push('the reference-country row is not the first line of the verdict');
        const home = container.querySelector('.home');
        if (!home || !/your country/.test(home.textContent) || !home.querySelector('.status svg')) problems.push('the reference row lacks its label or its status icon');
        else if (getComputedStyle(home).backgroundColor !== resolveToken('--color-surface-raised', 'background-color')) problems.push('the reference row is not on the raised surface');
        return problems;
      },
    },
    {
      name: 'Panel · skeleton while loading',
      render(container) {
        const stack = el('div', 'skeleton-stack', '', { role: 'status', 'aria-label': 'Loading availability' });
        stack.append(el('span', 'skeleton skeleton--line skeleton--short', '', { 'aria-hidden': 'true' }), el('span', 'skeleton skeleton--row', '', { 'aria-hidden': 'true' }));
        container.append(stack);
      },
      check(container) {
        const lines = container.querySelectorAll('.skeleton');
        if (lines.length < 2) return ['the loading sample does not render its placeholders'];
        const problems = checkSkeletonVisible(container);
        if (!container.querySelector('[role="status"][aria-label]')) problems.push('the loading state is not announced');
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const animated = getComputedStyle(lines[0]).animationName !== 'none';
        if (reduced && animated) problems.push('the skeleton still pulses under reduced motion');
        if (!reduced && !animated) problems.push('the skeleton does not pulse');
        return problems;
      },
    },
  ];
}

let pickerCount = 0;
function renderServicePicker(container) {
  const id = `service-pick-${pickerCount += 1}`;
  const pick = el('div', 'service-pick');
  const wrap = el('div', 'select-wrap');
  const select = el('select', 'select', '', { id, 'aria-label': 'Streaming service' });
  for (const name of ['Netflix', 'Disney+']) select.append(el('option', '', name));
  wrap.append(select, icon('chevron'));
  pick.append(el('label', '', 'Service', { for: id }), wrap);
  container.append(pick);
}

function confirmDialog() {
  const dialog = el('div', 'dialog', '', { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title', 'aria-describedby': 'dialog-text' });
  dialog.append(el('h3', '', 'Remove the saved key?', { id: 'dialog-title' }), el('p', 'muted', 'You will need to paste it again.', { id: 'dialog-text' }));
  const row = el('div', 'btn-row');
  row.append(el('button', 'btn btn--danger', 'Remove', { type: 'button' }), el('button', 'btn btn--secondary', 'Cancel', { type: 'button' }));
  dialog.append(row);
  return dialog;
}

function stateScenarios() {
  const verdictCard = (kind, iconName, headline, detail, body) => {
    const verdict = el('div', `verdict verdict--${kind}`);
    const mark = icon(iconName, 'lg');
    mark.classList.add('verdict__icon');
    verdict.append(mark, el('p', 'verdict__headline', headline), el('p', 'verdict__detail', detail));
    if (body) verdict.append(el('div', 'verdict__body', body));
    return verdict;
  };
  return [
    {
      name: 'Panel · verdict · no result',
      render: (container) => container.append(verdictCard('absent', 'ban', 'Not found on Netflix here', 'No source lists this title in your country')),
      check(container) {
        const icon = container.querySelector('.verdict__icon');
        const problems = checkNoOverflow(container);
        if (icon.querySelector('path').getAttribute('d') !== icons.ban) problems.push('the no-result verdict does not use the barred circle');
        if (getComputedStyle(icon).color !== resolveToken('--color-text-muted', 'color')) problems.push('the no-result verdict icon is not gray');
        return problems;
      },
    },
    {
      name: 'Panel · verdict · error',
      render(container) {
        const verdict = verdictCard('error', 'alert', 'The lookup failed', 'Try again in a moment');
        verdict.setAttribute('role', 'alert');
        container.append(verdict);
      },
      check(container) {
        const problems = checkNoOverflow(container);
        const colour = getComputedStyle(container.querySelector('.verdict__icon')).color;
        if (colour !== resolveToken('--color-danger', 'color')) problems.push('the error verdict icon has no danger color');
        if (!container.querySelector('.verdict--error[role="alert"]')) problems.push('the error verdict is not announced as an alert');
        return problems;
      },
    },
    {
      name: 'Banner · offline with reason',
      render(container) {
        const banner = el('div', 'banner banner--caution', '', { role: 'status' });
        const body = el('div');
        body.append(el('strong', 'banner__title', 'You are offline'), el('span', '', 'Search is paused. Titles you opened before still work.'));
        const actions = el('div', 'banner__actions');
        actions.append(el('button', 'btn btn--ghost', 'Try again', { type: 'button' }));
        body.append(actions);
        banner.append(icon('alert'), body);
        container.append(banner);
      },
      check(container) {
        const text = container.querySelector('.banner').textContent;
        return /offline/i.test(text) && /paused|still work/i.test(text) ? checkNoOverflow(container) : ['the offline banner gives no reason'];
      },
    },
    {
      name: 'Service picker · normal',
      render: renderServicePicker,
      check: checkNoOverflow,
    },
    {
      name: 'Service picker · focus',
      render(container) {
        renderServicePicker(container);
        applyVariant(container.querySelector('select'), 'focus');
      },
      check: (container) => [...checkFocusRing(container), ...checkNoOverflow(container)],
    },
    ...['closed', 'open'].map((state) => ({
      name: `Country disclosure · ${state}`,
      render(container) {
        const details = el('details', 'disclosure');
        if (state === 'open') details.open = true;
        const summary = el('summary');
        const chevron = icon('chevron');
        chevron.classList.add('chev');
        summary.append(el('span', 'group__title', 'Elsewhere in Europe'), el('span', 'disclosure__count', '12 countries'), chevron);
        const list = el('ul', 'countries');
        list.append(el('li', 'country country--static', 'France'));
        details.append(summary, list);
        container.append(details);
      },
      check: checkNoOverflow,
    })),
    ...['normal', 'hover', 'focus'].map((variant) => ({
      name: `Country row · ${variant}`,
      render(container) {
        const row = el('div', 'country');
        const toggle = applyVariant(el('button', 'country__toggle', '', { type: 'button', 'aria-expanded': 'false' }), variant);
        const name = el('span', 'country__name', 'France');
        toggle.append(name, el('span', 'badge badge--disagree', 'Sources disagree'), icon('chevron'));
        row.append(toggle);
        container.append(row);
      },
      check: (container) => [...checkFocusRing(container), ...checkHover(container), ...checkNoOverflow(container)],
    })),
    {
      name: 'Theme radios',
      render(container) {
        const group = el('fieldset', 'segmented');
        group.append(el('legend', 'visually-hidden', 'Theme'));
        ['Auto', 'Light', 'Dark'].forEach((name, index) => {
          const label = el('label');
          const input = el('input', '', '', { type: 'radio', name: 'theme-sample', value: name.toLowerCase() });
          input.checked = index === 2;
          if (index === 1) { input.classList.add('is-focus'); input.dataset.expectFocus = 'true'; }
          label.append(input, name);
          group.append(label);
        });
        container.append(group);
      },
      check(container) {
        const checkedLabel = container.querySelector('label:has(input:checked)');
        const problems = checkFocusRing(container);
        if (getComputedStyle(checkedLabel).boxShadow === 'none') problems.push('the selected theme has no marker');
        return problems;
      },
    },
    ...[['', 'Usage · normal', 0.3], ['caution', 'Usage · nearly reached', 0.9]].map(([kind, name, share]) => ({
      name: `Quota · ${kind || 'normal'}`,
      render(container) {
        const usage = el('div', 'usage');
        const meter = el('div', `meter${kind ? ` meter--${kind}` : ''}`);
        const bar = el('div', 'meter__bar', '', { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(share * 100), 'aria-label': name });
        const fill = el('div', 'meter__fill');
        fill.classList.add(fillClass(share));
        bar.append(fill);
        meter.append(el('span', '', `${Math.round(share * 100)} of 100 lookups used this month`), bar);
        usage.append(meter);
        container.append(usage);
        if (kind) {
          const banner = el('div', 'banner banner--caution', '', { role: 'status' });
          const body = el('div');
          body.append(el('strong', 'banner__title', 'Quota nearly reached'), el('span', '', 'Lookups pause at the limit.'));
          banner.append(icon('alert'), body);
          container.append(banner);
        }
      },
      check: checkNoOverflow,
    })),
    {
      name: 'Quota · exhausted',
      render(container) {
        const banner = el('div', 'banner banner--danger', '', { role: 'alert' });
        const body = el('div');
        body.append(el('strong', 'banner__title', 'Monthly quota used up'), el('span', '', 'Lookups resume next month.'));
        banner.append(icon('alert'), body);
        container.append(banner);
      },
      check: checkNoOverflow,
    },
    {
      name: 'Confirmation dialog',
      render(container) {
        container.append(confirmDialog());
      },
      check(container) {
        const dialog = container.querySelector('.dialog');
        const problems = checkNoOverflow(container);
        if (dialog.getBoundingClientRect().width > parseFloat(resolveToken('--dialog-max', 'width')) + 1) {
          problems.push('the dialog exceeds its width cap');
        }
        if (dialog.getAttribute('aria-modal') !== 'true') problems.push('the dialog is not modal');
        return problems;
      },
    },
    {
      name: 'Confirmation dialog · opened from a button',
      render(container) {
        const opener = el('button', 'btn btn--danger', 'Remove the saved key', { type: 'button' });
        let scrim = null;
        const close = () => {
          scrim?.remove();
          scrim = null;
          opener.focus();
        };
        opener.addEventListener('click', () => {
          scrim = el('div', 'scrim');
          const dialog = confirmDialog();
          const [remove, cancel] = dialog.querySelectorAll('button');
          const buttons = [remove, cancel];
          cancel.addEventListener('click', close);
          remove.addEventListener('click', close);
          dialog.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            } else if (event.key === 'Tab') {
              const index = buttons.indexOf(document.activeElement);
              const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
              event.preventDefault();
              buttons[next].focus();
            }
          });
          scrim.append(dialog);
          container.append(scrim);
          cancel.focus();
        });
        container.append(opener);
      },
      check(container) {
        const problems = [];
        const opener = container.querySelector('.btn--danger');
        opener.focus();
        opener.click();
        const dialog = container.querySelector('[role="alertdialog"]');
        if (!dialog) return ['the dialog does not open'];
        if (document.activeElement?.textContent !== 'Cancel') problems.push('focus does not start on Cancel');
        const press = (key, extra = {}) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
        press('Tab');
        if (document.activeElement?.textContent !== 'Remove') problems.push('Tab leaves the dialog');
        press('Tab');
        if (document.activeElement?.textContent !== 'Cancel') problems.push('Tab does not wrap inside the dialog');
        press('Escape');
        if (container.querySelector('[role="alertdialog"]')) problems.push('Escape does not close the dialog');
        if (document.activeElement !== opener) problems.push('focus does not return to the opener');
        return problems;
      },
    },
  ];
}

export default [
  ...buttonScenarios(),
  ...iconButtonScenarios(),
  ...fieldScenarios(),
  ...searchScenarios(),
  ...searchStateScenarios(),
  ...pillScenarios(),
  ...bannerScenarios(),
  ...listScenarios(),
  ...panelScenarios(),
  ...stateScenarios(),
  ...sampleScenarios,
];

// Page-level check: the page must not scroll sideways at the current width.
export function check() {
  const root = document.documentElement;
  return root.scrollWidth > root.clientWidth ? ['the page scrolls horizontally'] : [];
}
