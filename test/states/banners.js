import { createCache } from '../../src/api/cache.js';
import { createQuota } from '../../src/api/quota.js';
import { startApp } from '../../src/app.js';
import { renderBanners } from '../../src/render/banners.js';
import { createSettings } from '../../src/settings/keys.js';
import { createStore } from '../../src/state.js';
import { checkNoOverflow } from './kit.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    get length() { return entries.size; },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (name) => entries.get(name) ?? null,
    setItem: (name, value) => void entries.set(name, String(value)),
    removeItem: (name) => void entries.delete(name),
  };
}

function slotIn(container) {
  const slot = document.createElement('div');
  container.append(slot);
  return slot;
}

function checkRegion(slot, expected) {
  const problems = checkNoOverflow(slot);
  if (slot.getAttribute('role') !== 'status') problems.push('the banners are not in a status region');
  const found = slot.querySelectorAll('.banner').length;
  if (found !== expected) problems.push(`${found} banners shown, expected ${expected}`);
  for (const icon of slot.querySelectorAll('.banner > .icon')) {
    if (icon.getAttribute('aria-hidden') !== 'true') problems.push('a banner icon is not hidden from assistive technology');
  }
  return problems;
}

// The real shell with a TMDB key (and optionally a second one) saved.
function mountApp(container, stored) {
  container.innerHTML = '<div id="header"></div><div id="welcome" hidden></div><div id="settings" hidden></div>'
    + '<section id="search-view" hidden><div id="banners"></div><div id="search"></div></section>';
  const storage = memoryStorage(stored);
  const quota = createQuota({ storage });
  const settings = createSettings({ storage, navigatorLike: { language: 'en-GB' }, cache: createCache({ storage }), quota });
  const store = createStore();
  startApp({ store, settings, checkKey: async () => 'valid', quotaLimit: () => quota.status().limit, durable: true }, container);
  return { store, settings };
}

export default [
  {
    name: 'Banner · single, with its action',
    render(container) {
      container.region = slotIn(container);
      container.opened = 0;
      renderBanners(container.region, [{ type: 'tmdbOnly' }], { onOpenSettings: () => { container.opened += 1; } });
    },
    check(container) {
      const problems = checkRegion(container.region, 1);
      const action = container.region.querySelector('.banner__actions button');
      if (!action) return [...problems, 'the banner has no action'];
      action.click();
      if (container.opened !== 1) problems.push('the action does not open Settings');
      if (container.region.querySelector('.banner__title')?.textContent !== 'Languages need a second key') problems.push('the title is wrong');
      return problems;
    },
  },
  {
    name: 'Banner · several at once, unknown types skipped',
    render(container) {
      container.region = slotIn(container);
      renderBanners(container.region, [{ type: 'tmdbOnly' }, { type: 'unknown' }, { type: 'tmdbOnly' }]);
    },
    check: (container) => checkRegion(container.region, 2),
  },
  {
    name: 'Banner · none leaves an empty status region',
    render(container) {
      container.region = slotIn(container);
      renderBanners(container.region, [{ type: 'tmdbOnly' }]);
      renderBanners(container.region, []);
    },
    check: (container) => checkRegion(container.region, 0),
  },
  {
    name: 'Banner · shown in the app with a TMDB key alone',
    render(container) {
      container.mounted = mountApp(container, { 'wtw.key.tmdb': 'sample-tmdb-key' });
    },
    check(container) {
      const problems = checkRegion(container.querySelector('#banners'), 1);
      if (container.mounted.store.get().mode !== 'tmdbOnly') problems.push('the mode is not tmdbOnly');
      return problems;
    },
  },
  {
    name: 'Banner · gone once a second key is saved, without a reload',
    async render(container) {
      container.mounted = mountApp(container, { 'wtw.key.tmdb': 'sample-tmdb-key' });
      container.querySelector('.banner__actions button').click();
      container.mounted.settings.setKey('sa', 'sample-sa-key');
      container.querySelector('#header button[aria-label="Back to search"]')?.click();
      await settle();
    },
    check(container) {
      const problems = checkRegion(container.querySelector('#banners'), 0);
      if (container.mounted.store.get().mode !== 'full') problems.push('the mode is not full');
      return problems;
    },
  },
];
