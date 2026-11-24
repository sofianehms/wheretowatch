import { createCache } from '../../src/api/cache.js';
import { createQuota } from '../../src/api/quota.js';
import { startApp } from '../../src/app.js';
import { renderBanners, tmdbOnlyBanner } from '../../src/render/banners.js';
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

const note = { type: 'quota', tone: 'caution', title: 'Quota low', message: 'Few lookups left today.', dismissible: true };
const plain = { type: 'info', message: 'Plain notice, no action.' };

export default [
  {
    name: 'Banner · single, without an action',
    render(container) {
      container.region = slotIn(container);
      renderBanners(container.region, [plain]);
    },
    check(container) {
      const problems = checkRegion(container.region, 1);
      if (container.region.querySelector('button')) problems.push('a banner without an action has a button');
      if (!container.region.textContent.includes(plain.message)) problems.push('the message is missing');
      return problems;
    },
  },
  {
    name: 'Banner · single, with its action',
    render(container) {
      container.region = slotIn(container);
      container.opened = 0;
      renderBanners(container.region, [tmdbOnlyBanner()], { onAction: (name) => { if (name === 'settings') container.opened += 1; } });
    },
    check(container) {
      const problems = checkRegion(container.region, 1);
      const action = container.region.querySelector('.banner__actions button');
      if (!action) return [...problems, 'the banner has no action'];
      action.click();
      if (container.opened !== 1) problems.push('the action does not open Settings');
      if (container.region.querySelector('.banner__title')?.textContent !== 'Languages need a second key') problems.push('the title is wrong');
      if (getComputedStyle(action).borderTopWidth !== '0px') problems.push('the action button keeps its default border');
      return problems;
    },
  },
  {
    name: 'Banner · several at once, each with its content',
    render(container) {
      container.region = slotIn(container);
      container.dismissed = [];
      renderBanners(container.region, [tmdbOnlyBanner(), note, plain], { onDismiss: (banner) => container.dismissed.push(banner.type) });
    },
    check(container) {
      const problems = checkRegion(container.region, 3);
      const titles = [...container.region.querySelectorAll('.banner__title')].map((node) => node.textContent);
      if (titles.join('|') !== 'Languages need a second key|Quota low') problems.push(`unexpected titles: ${titles.join('|')}`);
      if (container.region.querySelectorAll('.banner--caution').length !== 1) problems.push('the tone class is missing');
      const close = container.region.querySelectorAll('.banner > button[aria-label]');
      if (close.length !== 1) return [...problems, `${close.length} dismiss buttons, expected 1`];
      close[0].click();
      if (container.dismissed.join() !== 'quota') problems.push('the dismissal does not report the banner');
      return problems;
    },
  },
  {
    name: 'Banner · none leaves an empty status region',
    render(container) {
      container.region = slotIn(container);
      renderBanners(container.region, [tmdbOnlyBanner()]);
      renderBanners(container.region, []);
    },
    check: (container) => checkRegion(container.region, 0),
  },
  {
    name: 'Banner · an unchanged list keeps its DOM (so keyboard focus)',
    render(container) {
      container.region = slotIn(container);
      const banners = [tmdbOnlyBanner()];
      renderBanners(container.region, banners);
      container.action = container.region.querySelector('button');
      renderBanners(container.region, banners);
    },
    check(container) {
      const problems = checkRegion(container.region, 1);
      if (container.action !== container.region.querySelector('button')) problems.push('the banner DOM was rebuilt');
      return problems;
    },
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
    name: 'Banner · keeps its DOM when the store changes for another reason',
    async render(container) {
      container.mounted = mountApp(container, { 'wtw.key.tmdb': 'sample-tmdb-key' });
      container.action = container.querySelector('.banner__actions button');
      container.mounted.store.set({ query: 'matrix' });
      await settle();
    },
    check(container) {
      const problems = checkRegion(container.querySelector('#banners'), 1);
      if (container.action !== container.querySelector('.banner__actions button')) problems.push('the banner DOM was rebuilt');
      return problems;
    },
  },
  {
    name: 'Banner · other notices survive a mode change',
    async render(container) {
      container.mounted = mountApp(container, { 'wtw.key.tmdb': 'sample-tmdb-key' });
      container.mounted.store.set({ banners: [...container.mounted.store.get().banners, plain] });
      container.querySelector('.banner__actions button').click();
      container.mounted.settings.setKey('sa', 'sample-sa-key');
      container.querySelector('#header button[aria-label="Back to search"]')?.click();
      await settle();
    },
    check(container) {
      const problems = checkRegion(container.querySelector('#banners'), 1);
      if (!container.querySelector('#banners').textContent.includes(plain.message)) problems.push('the other notice was dropped');
      if (container.querySelector('.banner__actions')) problems.push('the TMDB-only notice is still shown');
      return problems;
    },
  },
  {
    name: 'Banner · gone once a second key is saved in Settings, without a reload',
    async render(container) {
      container.mounted = mountApp(container, { 'wtw.key.tmdb': 'sample-tmdb-key' });
      container.querySelector('.banner__actions button').click();
      const input = container.querySelector('#settings input[name="sa"], #settings input[id*="sa"]')
        ?? container.querySelectorAll('#settings input[type="password"]')[1];
      input.value = 'sample-sa-key';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const save = [...container.querySelectorAll('#settings button')].filter((node) => node.textContent === 'Save')[1];
      save.click();
      await settle();
      container.querySelector('#header button[aria-label="Back to search"]')?.click();
      await settle();
    },
    check(container) {
      const problems = checkRegion(container.querySelector('#banners'), 0);
      if (container.mounted.store.get().mode !== 'full') problems.push('the mode is not full');
      if (!container.mounted.settings.hasKey('sa')) problems.push('the second key was not saved through Settings');
      return problems;
    },
  },
];
