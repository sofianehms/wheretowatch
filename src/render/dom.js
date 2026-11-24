// Small DOM helpers shared by the render modules. Text always comes from `t()`.
const SVG = 'http://www.w3.org/2000/svg';

const iconPaths = {
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h.01',
  chevDown: 'm6 9 6 6 6-6',
  chevLeft: 'm15 18-6-6 6-6',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16v-4M12 8h.01',
  refresh: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
  close: 'M18 6 6 18M6 6l12 12',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
  share: 'M12 3v12M8 7l4-4 4 4M5 12v8h14v-8',
  plusSquare: 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM12 8v8M8 12h8',
  toggle: 'M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7zM17 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
};

export function el(tag, className, text, attributes = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

// Decorative graphic: hidden from assistive technology.
const decorative = { 'aria-hidden': 'true', focusable: 'false', viewBox: '0 0 24 24' };

function graphic(className) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', className);
  for (const [name, value] of Object.entries(decorative)) svg.setAttribute(name, value);
  return svg;
}

export function icon(name, size = '') {
  const svg = graphic(`icon${size ? ` icon--${size}` : ''}`);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', iconPaths[name]);
  svg.append(path);
  return svg;
}

export function mark() {
  const svg = graphic('mark');
  const shapes = [
    ['mark__pin', 'M12 1.5a8 8 0 0 0-8 8c0 5.6 8 13 8 13s8-7.4 8-13a8 8 0 0 0-8-8z'],
    ['mark__play', 'M10 6.2v6.6l5.2-3.3z'],
  ];
  for (const [className, d] of shapes) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('class', className);
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function externalLink(href, label, className = 'link link--quiet small') {
  const link = el('a', className, label, { href, target: '_blank', rel: 'noopener noreferrer' });
  link.append(' ', icon('external', 'sm'));
  return link;
}

// Fill `parent` from a translated template, swapping each `{name}` for the matching node.
export function richText(parent, template, parts) {
  for (const piece of template.split(/(\{\w+\})/)) {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    if (name && parts[name]) parent.append(parts[name]);
    else if (piece) parent.append(piece);
  }
}

// Ids must stay unique when several instances of a screen share one page.
let counter = 0;
export function uniqueId(base) {
  counter += 1;
  return `${base}-${counter}`;
}
