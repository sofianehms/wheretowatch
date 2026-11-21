// One scenario per base component and per variant: normal, simulated hover, focus, disabled.
const SVG = 'http://www.w3.org/2000/svg';
const icons = {
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
  chevron: 'm6 9 6 6 6-6',
  close: 'M18 6 6 18M6 6l12 12',
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

// Apply one interaction variant to a control and return it.
function applyVariant(control, variant) {
  if (variant === 'hover') control.classList.add('is-hover');
  if (variant === 'disabled') control.disabled = true;
  if (variant === 'focus') control.dataset.expectFocus = 'true';
  return control;
}

// Focus happens after layout so the ring is the one a keyboard user sees.
function focusExpected(container) {
  const control = container.querySelector('[data-expect-focus]');
  control?.focus({ focusVisible: true });
  return control;
}

function checkFocusRing(container) {
  const control = focusExpected(container);
  if (!control) return [];
  const style = getComputedStyle(control);
  const visible = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
  const field = control.closest('.search__field, .input-row');
  const fieldStyle = field && getComputedStyle(field);
  return visible || (fieldStyle && fieldStyle.outlineStyle !== 'none') ? [] : ['the focus ring is not visible'];
}

function checkNoOverflow(container) {
  return container.scrollWidth > container.clientWidth ? ['the component overflows its container'] : [];
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
    check: (container) => [...checkFocusRing(container), ...checkNoOverflow(container)],
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
    check: checkFocusRing,
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
    check: checkFocusRing,
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
    check: checkFocusRing,
  }));
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
      container.append(list);
    },
    check(container) {
      const active = container.querySelector('[aria-selected="true"]');
      if (!active) return [];
      return getComputedStyle(active).boxShadow === 'none' ? ['the active option has no marker'] : [];
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
    },
  ];
}

export default [
  ...buttonScenarios(),
  ...iconButtonScenarios(),
  ...fieldScenarios(),
  ...searchScenarios(),
  ...pillScenarios(),
  ...bannerScenarios(),
  ...listScenarios(),
  ...panelScenarios(),
];

// Page-level check: the page must not scroll sideways at the current width.
export function check() {
  const root = document.documentElement;
  return root.scrollWidth > root.clientWidth ? ['the page scrolls horizontally'] : [];
}
