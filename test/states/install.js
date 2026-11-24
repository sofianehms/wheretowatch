import { renderInstallHint } from '../../src/render/install.js';
import { render as renderSearch } from '../../src/render/search.js';
import { createSettings } from '../../src/settings/keys.js';
import { checkNoOverflow } from './kit.js';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function memorySettings() {
  const entries = new Map();
  return createSettings({
    storage: {
      getItem: (name) => entries.get(name) ?? null,
      setItem: (name, value) => void entries.set(name, String(value)),
      removeItem: (name) => void entries.delete(name),
    },
    navigatorLike: { language: 'en-GB' },
  });
}

// The empty search screen with the hint slot, as in index.html.
function mount(container, { userAgent = iphone, standalone = false, settings = memorySettings() } = {}) {
  container.innerHTML = '<section id="search-view"><div id="search"></div><div id="title"></div>'
    + '<div id="install"></div></section>';
  renderSearch(container.querySelector('#search'), { status: 'idle' });
  const slot = container.querySelector('#install');
  const options = { settings, navigatorLike: { userAgent, maxTouchPoints: 5, standalone }, matchMedia: () => ({ matches: false }) };
  renderInstallHint(slot, options);
  return { slot, options };
}

const absent = (container) => (container.querySelector('.install') ? ['the hint is shown'] : []);

export default [
  {
    name: 'Install hint · shown in iOS Safari',
    render(container) {
      container.mounted = mount(container);
    },
    check(container) {
      const hint = container.querySelector('.install');
      if (!hint) return ['the hint is missing'];
      const problems = checkNoOverflow(hint);
      const steps = [...hint.querySelectorAll('li')].map((item) => item.textContent).join('|');
      if (steps !== 'Tap Share in Safari.|Choose Add to Home Screen.|Keep Open as Web App on.') problems.push(`unexpected steps: ${steps}`);
      if (!hint.textContent.includes('paste your keys again')) problems.push('the warning about keys is missing');
      if (!hint.querySelector('button[aria-label="Dismiss"]')) problems.push('there is no dismiss button');
      return problems;
    },
  },
  {
    name: 'Install hint · steps aside for a typed query or an open title',
    render(container) {
      container.mounted = mount(container);
    },
    check(container) {
      const { slot } = container.mounted;
      const input = container.querySelector('input');
      const title = container.querySelector('#title');
      const problems = [];
      if (!slot.checkVisibility()) problems.push('the hint is hidden on the empty screen');
      input.value = 'matrix';
      if (slot.checkVisibility()) problems.push('the hint stays under a typed query');
      input.value = '';
      title.append(document.createElement('article'));
      if (slot.checkVisibility()) problems.push('the hint stays under an open title');
      title.replaceChildren();
      return problems;
    },
  },
  {
    name: 'Install hint · dismissed for good',
    render(container) {
      container.mounted = mount(container);
    },
    check(container) {
      const { slot, options } = container.mounted;
      container.querySelector('button[aria-label="Dismiss"]').click();
      const problems = absent(container);
      // The gallery's main landmark stands for the page's.
      if (document.activeElement !== slot.closest('main')) problems.push('the focus is lost after dismissing');
      if (options.settings.getPref('installHintDismissed') !== '1') problems.push('the dismissal is not stored');
      renderInstallHint(slot, options);
      return [...problems, ...absent(container)];
    },
  },
  {
    name: 'Install hint · none in the installed app',
    render(container) {
      mount(container, { standalone: true });
    },
    check: absent,
  },
  {
    name: 'Install hint · none on a desktop browser',
    render(container) {
      mount(container, { userAgent: desktop });
    },
    check: absent,
  },
];
