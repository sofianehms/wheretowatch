// One scenario per base component and per variant: normal, simulated hover, focus, disabled.
// Hover and focus come from the production rules (see ../states-sim.js), so they are measured, not drawn.
import { hoverChanges } from '../states-sim.js';

const SVG = 'http://www.w3.org/2000/svg';
const icons = {
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
  chevron: 'm6 9 6 6 6-6',
  close: 'M18 6 6 18M6 6l12 12',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  offline: 'M2 8.8a15 15 0 0 1 4-2.4M22 8.8a15 15 0 0 0-9.5-3.7M5 12.9a10 10 0 0 1 5-2.7M19 12.9a10 10 0 0 0-2-1.6M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20',
};

function icon(name, size = '') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `icon${size ? ` icon--${size}` : ''}`);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', icons[name]);
  svg.append(path);
  return svg;
}

function el(tag, className, text, attributes = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

const variants = ['normal', 'hover', 'focus', 'disabled'];

// Resolve a design token into the computed value a property would take, so checks compare like with like.
function resolveToken(name, property) {
  const probe = document.createElement('span');
  probe.style.setProperty(property, `var(${name})`);
  document.body.append(probe);
  const value = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return value;
}

// Fixed widths for the quota bars go through the stylesheet (CSSOM), like the production meter does.
function fillClass(share) {
  const name = `sample-fill-${Math.round(share * 100)}`;
  const sheet = document.adoptedStyleSheets.find((candidate) => candidate.sampleFills) ?? Object.assign(new CSSStyleSheet(), { sampleFills: true });
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  if (![...sheet.cssRules].some((rule) => rule.selectorText === `.${name}`)) sheet.insertRule(`.${name} { width: ${share * 100}%; }`, sheet.cssRules.length);
  return name;
}

const frames = '.search__field, .input-row, .segmented label, .country__toggle, .disclosure > summary';

// Apply one interaction variant to a control and return it.
function applyVariant(control, variant) {
  if (variant === 'hover') control.classList.add('is-hover');
  if (variant === 'disabled') control.disabled = true;
  if (variant === 'focus') {
    control.classList.add('is-focus');
    control.closest('.search__field, .input-row')?.classList.add('is-focus');
    control.dataset.expectFocus = 'true';
  }
  return control;
}

// Every focused sample keeps its own ring, so all of them are visible together in a capture.
function checkFocusRing(container) {
  const problems = [];
  for (const control of container.querySelectorAll('[data-expect-focus]')) {
    const ringed = [control, control.closest(frames), control.parentElement].filter(Boolean).some((node) => {
      const style = getComputedStyle(node);
      return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    });
    if (!ringed) problems.push('the focus ring is not visible');
  }
  return problems;
}

function checkHover(container) {
  const problems = [];
  for (const control of container.querySelectorAll('.is-hover')) {
    if (!hoverChanges(control)) problems.push('the hover state changes nothing: no hover rule applies');
  }
  return problems;
}

function checkNoOverflow(container) {
  return container.scrollWidth > container.clientWidth ? ['the component overflows its container'] : [];
}

// The disabled frame is dashed and takes the page color, so it differs from a normal field.
function checkDisabledFrame(container, selector) {
  const frame = container.querySelector(selector);
  if (!container.querySelector(':disabled')) return ['the sample is not disabled'];
  const style = getComputedStyle(frame);
  const page = getComputedStyle(document.body).backgroundColor;
  const problems = [];
  if (style.borderTopStyle !== 'dashed') problems.push('the disabled frame is not dashed');
  if (style.backgroundColor !== page) problems.push('the disabled frame does not use the page color');
  return problems;
}

function buttonScenarios() {
  const kinds = [
    ['primary', 'Primary button'],
    ['secondary', 'Secondary button'],
    ['ghost', 'Ghost button'],
    ['danger', 'Danger button'],
  ];
  return kinds.flatMap(([kind, label]) => variants.map((variant) => ({
    name: `Button · ${kind} · ${variant}`,
    render(container) {
      container.append(applyVariant(el('button', `btn btn--${kind}`, label, { type: 'button' }), variant));
    },
    check: (container) => [...checkFocusRing(container), ...checkHover(container), ...checkNoOverflow(container)],
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
    check: (container) => [...checkFocusRing(container), ...checkHover(container)],
  }));
}

function fieldScenarios() {
  return variants.map((variant) => ({
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
    check: (container) => [...checkFocusRing(container), ...(variant === 'disabled' ? checkDisabledFrame(container, '.input-row') : [])],
  }));
}

function searchScenarios() {
  return variants.map((variant) => ({
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
    check: (container) => [...checkFocusRing(container), ...(variant === 'disabled' ? checkDisabledFrame(container, '.search__field') : [])],
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

function searchStateScenarios() {
  const note = (title, text) => {
    const list = el('div', 'listbox', '', { role: 'status' });
    const box = el('p', 'listbox__note');
    box.append(el('strong', '', title), document.createTextNode(` ${text}`));
    list.append(box);
    return list;
  };
  return [
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
      check: (container) => container.querySelectorAll('.skeleton').length >= 2 ? checkNoOverflow(container) : ['the search loading sample has no placeholders'],
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
      name: 'Panel · verdict',
      render(container) {
        const verdict = el('div', 'verdict verdict--available');
        const mark = icon('check', 'lg');
        mark.classList.add('verdict__icon');
        verdict.append(mark, el('p', 'verdict__headline', 'On Netflix in your country'), el('p', 'verdict__detail', 'Checked today'));
        container.append(verdict);
      },
      check: checkNoOverflow,
    },
    {
      name: 'Panel · skeleton while loading',
      render(container) {
        const stack = el('div', 'skeleton-stack');
        stack.append(el('span', 'skeleton skeleton--line skeleton--short'), el('span', 'skeleton skeleton--row'));
        container.append(stack);
      },
      check(container) {
        const lines = container.querySelectorAll('.skeleton');
        if (lines.length < 2) return ['the loading sample does not render its placeholders'];
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const animated = getComputedStyle(lines[0]).animationName !== 'none';
        if (reduced && animated) return ['the skeleton still pulses under reduced motion'];
        return reduced || animated ? [] : ['the skeleton does not pulse'];
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
        const dialog = el('div', 'dialog', '', { role: 'alertdialog', 'aria-labelledby': 'dialog-title' });
        dialog.append(el('h2', '', 'Remove the saved key?', { id: 'dialog-title' }), el('p', 'muted', 'You will need to paste it again.'));
        const row = el('div', 'btn-row');
        row.append(el('button', 'btn btn--danger', 'Remove', { type: 'button' }), el('button', 'btn btn--secondary', 'Cancel', { type: 'button' }));
        dialog.append(row);
        container.append(dialog);
      },
      check(container) {
        const dialog = container.querySelector('.dialog');
        const problems = checkNoOverflow(container);
        if (dialog.getBoundingClientRect().width > parseFloat(resolveToken('--dialog-max', 'width')) + 1) {
          problems.push('the dialog exceeds its width cap');
        }
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
];

// Page-level check: the page must not scroll sideways at the current width.
export function check() {
  const root = document.documentElement;
  return root.scrollWidth > root.clientWidth ? ['the page scrolls horizontally'] : [];
}
