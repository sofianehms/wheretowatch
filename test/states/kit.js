// Shared building blocks of the component gallery: DOM helpers, icons and reusable checks.
import { hoverChanges } from '../states-sim.js';

const SVG = 'http://www.w3.org/2000/svg';
export const icons = {
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
  chevron: 'm6 9 6 6 6-6',
  close: 'M18 6 6 18M6 6l12 12',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16v-4M12 8h.01',
  refresh: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
  external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  offline: 'M2 8.8a15 15 0 0 1 4-2.4M22 8.8a15 15 0 0 0-9.5-3.7M5 12.9a10 10 0 0 1 5-2.7M19 12.9a10 10 0 0 0-2-1.6M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20',
};

export function icon(name, size = '') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `icon${size ? ` icon--${size}` : ''}`);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', icons[name]);
  svg.append(path);
  return svg;
}

export function el(tag, className, text, attributes = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

export const variants = ['normal', 'hover', 'focus', 'disabled'];

// Resolve a design token into the computed value a property would take, so checks compare like with like.
export function resolveToken(name, property) {
  const probe = document.createElement('span');
  probe.style.setProperty(property, `var(${name})`);
  document.body.append(probe);
  const value = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return value;
}

// Fixed widths for the quota bars go through the stylesheet (CSSOM), like the production meter does.
export function fillClass(share) {
  const name = `sample-fill-${Math.round(share * 100)}`;
  const sheet = document.adoptedStyleSheets.find((candidate) => candidate.sampleFills) ?? Object.assign(new CSSStyleSheet(), { sampleFills: true });
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  if (![...sheet.cssRules].some((rule) => rule.selectorText === `.${name}`)) sheet.insertRule(`.${name} { width: ${share * 100}%; }`, sheet.cssRules.length);
  return name;
}

export const frames = '.search__field, .input-row, .segmented label, .country__toggle, .disclosure > summary';

// Apply one interaction variant to a control and return it.
export function applyVariant(control, variant) {
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
export function checkFocusRing(container) {
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

export function checkHover(container) {
  const problems = [];
  for (const control of container.querySelectorAll('.is-hover')) {
    if (!hoverChanges(control)) problems.push('the hover state changes nothing: no hover rule applies');
  }
  return problems;
}

export function checkNoOverflow(container) {
  return container.scrollWidth > container.clientWidth ? ['the component overflows its container'] : [];
}

// The disabled frame is dashed and takes the page color, so it differs from a normal field.
export function checkDisabledFrame(container, selector) {
  const frame = container.querySelector(selector);
  if (!container.querySelector(':disabled')) return ['the sample is not disabled'];
  const style = getComputedStyle(frame);
  const page = getComputedStyle(document.body).backgroundColor;
  const problems = [];
  if (style.borderTopStyle !== 'dashed') problems.push('the disabled frame is not dashed');
  if (style.backgroundColor !== page) problems.push('the disabled frame does not use the page color');
  return problems;
}

// A control that is not available must look different, show the blocked cursor and stay out of the tab order.
export function checkDisabledControl(control) {
  const problems = [];
  if (!control.disabled) return ['the control is not disabled'];
  const read = () => {
    const style = getComputedStyle(control);
    return `${style.color}|${style.backgroundColor}|${style.borderTopStyle}|${style.cursor}`;
  };
  const disabledLook = read();
  if (getComputedStyle(control).cursor !== 'not-allowed') problems.push('the disabled control does not show the blocked cursor');
  control.disabled = false;
  const enabledLook = read();
  control.disabled = true;
  if (enabledLook === disabledLook) problems.push('the disabled control looks like an enabled one');
  control.focus();
  if (document.activeElement === control) problems.push('the disabled control can take focus');
  return problems;
}

// Resting look of a control: its background and text come from the named tokens.
export function checkResting(control, { background, color, borderColor }) {
  const style = getComputedStyle(control);
  const problems = [];
  if (background && style.backgroundColor !== resolveToken(background, 'background-color')) problems.push(`the resting background is not ${background}`);
  if (color && style.color !== resolveToken(color, 'color')) problems.push(`the resting text is not ${color}`);
  if (borderColor && style.borderTopColor !== resolveToken(borderColor, 'border-top-color')) problems.push(`the resting outline is not ${borderColor}`);
  return problems;
}

// Placeholders must stand out from every surface behind them (page, card, popover), in both themes.
export function checkSkeletonVisible(container) {
  const problems = [];
  const fill = resolveToken('--color-skeleton', 'background-color');
  for (const skeleton of container.querySelectorAll('.skeleton')) {
    if (getComputedStyle(skeleton).backgroundColor !== fill) problems.push('a placeholder does not use the skeleton color');
    for (let node = skeleton.parentElement; node; node = node.parentElement) {
      if (getComputedStyle(node).backgroundColor === fill) problems.push('a placeholder blends into the surface behind it');
    }
    if (skeleton.getBoundingClientRect().height === 0) problems.push('a placeholder has no height');
  }
  return [...new Set(problems)];
}
