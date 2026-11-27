import { createCache } from '../../src/api/cache.js';
import { createQuota } from '../../src/api/quota.js';
import { startApp } from '../../src/app.js';
import { degradationBanners, renderBanners, tmdbOnlyBanner, updateBanner } from '../../src/render/banners.js';
import { reconcile } from '../../src/core/reconcile.js';
import { computeVerdict } from '../../src/core/verdict.js';
import { renderTitle } from '../../src/render/title.js';
import { disagreement } from '../fixtures/reconcile/scenarios.js';
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
function mountApp(container, stored, { used = 0, snapshots } = {}) {
  container.innerHTML = '<div id="header"></div><div id="welcome" hidden></div><div id="settings" hidden></div>'
    + '<section id="search-view" hidden><div id="banners"></div><div id="search"></div><div id="title"></div></section>';
  const storage = memoryStorage(stored);
  const quota = createQuota({ storage });
  for (let call = 0; call < used; call += 1) quota.record();
  const settings = createSettings({ storage, navigatorLike: { language: 'en-GB' }, cache: createCache({ storage }), quota });
  const store = createStore();
  let loads = 0;
  const title = { mediaType: 'movie', tmdbId: 11, imdbId: null, title: 'Harbour Lights', year: 2023, posterPath: null, ref: 'movie/11' };
  const sources = snapshots && {
    loadAvailability: async () => {
      loads += 1;
      return { ...disagreement, snapshots };
    },
  };
  startApp({
    store, settings, quota, sources, getTitle: async () => title,
    checkKey: async () => 'valid', quotaLimit: () => quota.status().limit, durable: true,
  }, container, { launchTitle: snapshots ? title.ref : null });
  return { store, settings, loads: () => loads };
}

const bothKeys = { 'wtw.key.tmdb': 'sample-tmdb-key', 'wtw.key.sa': 'sample-sa-key' };
const quotaState = (used) => ({ used, limit: 1000, warn: used >= 800, blocked: used >= 1000, nextReset: Date.UTC(2026, 11, 1) });
const savedSnapshots = (reason) => disagreement.snapshots.map((snapshot) => (
  snapshot.source === 'sa' ? { ...snapshot, stale: true, reason } : snapshot));
const failedSnapshots = disagreement.snapshots.map((snapshot) => (
  snapshot.source === 'sa' ? { ...snapshot, status: 'unavailable', offers: [], error: { type: 'server' } } : snapshot));

// A failure banner is read from its words and icon, whatever its color.
function bannerScenario(name, input, expected) {
  return {
    name: `Banner · ${name}`,
    render(container) {
      container.region = slotIn(container);
      renderBanners(container.region, degradationBanners(input));
    },
    check(container) {
      const problems = checkRegion(container.region, 1);
      if (!expected.test(container.region.textContent)) problems.push(`unexpected text: ${container.region.textContent}`);
      if (!container.region.querySelector('.banner__title')?.textContent) problems.push('the banner has no title');
      if (!container.region.querySelector('.banner > .icon')) problems.push('the banner has no icon');
      return problems;
    },
  };
}

async function until(test) {
  for (let turn = 0; turn < 200 && !test(); turn += 1) await new Promise((resolve) => setTimeout(resolve, 10));
}

const degradationScenarios = [
  bannerScenario('quota warning at 80%', { quota: quotaState(812) }, /812 of 1,000 monthly calls used.*Resets on 1 Dec 2026/),
  bannerScenario('quota reached with saved languages', { quota: quotaState(1000), snapshots: savedSnapshots('quota') },
    /Monthly limit.*saved on .*\(not refreshed\).*Resets on 1 Dec 2026/),
  bannerScenario('source error', { quota: quotaState(10), snapshots: failedSnapshots }, /Second source unavailable/),
  {
    name: 'Banner · stale data on the title page',
    render(container) {
      const input = { ...disagreement, snapshots: savedSnapshots('error') };
      const reconciled = reconcile({ ...input, serviceKey: 'netflix' });
      const verdict = computeVerdict({ reconciled, snapshots: input.snapshots, serviceKey: 'netflix', homeCountry: 'FR', mediaType: 'movie' });
      renderTitle(container, {
        status: 'result', verdict, reconciled,
        title: { mediaType: 'movie', tmdbId: 11, title: 'Harbour Lights', year: 2023, posterPath: null, ref: 'movie/11' },
      });
    },
    check(container) {
      const found = [...container.querySelectorAll('.verdict .banner')].some((box) => /data from \d{1,2} [A-Z][a-z]{2} 2026 \(not refreshed\)/.test(box.textContent));
      // The decorative hero fade bleeds on purpose, so elements are measured rather than the scroll width.
      const edge = container.getBoundingClientRect().right;
      const sticksOut = [...container.querySelectorAll('*')].some((node) => node.getBoundingClientRect().right > edge + 1);
      return [...(sticksOut ? ['the title page overflows its container'] : []), ...(found ? [] : ['the "not refreshed" notice is missing'])];
    },
  },
  {
    name: 'Banner · in the app, warning with its way to Settings',
    render(container) {
      container.mounted = mountApp(container, bothKeys, { used: 800 });
    },
    check(container) {
      const problems = checkRegion(container.querySelector('#banners'), 1);
      container.querySelector('.banner__actions button')?.click();
      if (!container.mounted.store.get().settingsOpen) problems.push('"Details" does not open Settings');
      return problems;
    },
  },
  {
    name: 'Banner · in the app, source error follows the title on screen',
    async render(container) {
      container.mounted = mountApp(container, bothKeys, { snapshots: failedSnapshots });
      await until(() => container.querySelector('#banners .banner'));
    },
    check: (container) => {
      const problems = checkRegion(container.querySelector('#banners'), 1);
      if (!/Second source unavailable/.test(container.querySelector('#banners').textContent)) problems.push('the source error is missing');
      return problems;
    },
  },
  ...[
    ['tested', (field) => field.button('Test')],
    ['replaced', (field) => { field.type('another-sa-key'); field.button('Save'); }],
    ['removed', (field) => { field.type(''); field.button('Save'); }],
  ].map(([change, act]) => ({
    name: `Banner · in the app, source error stays while its result is shown, second key ${change}`,
    async render(container) {
      container.mounted = mountApp(container, bothKeys, { snapshots: failedSnapshots });
      await until(() => container.querySelector('#banners .banner'));
      container.querySelector('.banner__actions button')?.click();
      container.querySelector('#header button[aria-label="Settings"]')?.click();
      const input = container.querySelectorAll('#settings input[type="password"]')[1];
      const buttons = (name) => [...container.querySelectorAll('#settings button')].filter((node) => node.textContent === name)[1];
      act({
        type(value) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        },
        button: (name) => buttons(name).click(),
      });
      await settle();
      await settle();
      container.querySelector('#header button[aria-label="Back to search"]')?.click();
      await settle();
    },
    check(container) {
      const text = container.querySelector('#banners').textContent;
      const problems = checkNoOverflow(container.querySelector('#banners'));
      if (!/Second source unavailable/.test(text)) problems.push(`the source error is gone: ${text}`);
      if (!container.querySelector('#title').textContent.includes('Harbour Lights')) problems.push('the result is gone');
      if (container.mounted.loads() !== 1) problems.push(`${container.mounted.loads()} availability loads, expected 1`);
      return problems;
    },
  })),
  {
    name: 'Banner · in the app, quota reached before any title',
    render(container) {
      container.mounted = mountApp(container, bothKeys, { used: 1000 });
    },
    check(container) {
      const problems = checkRegion(container.querySelector('#banners'), 1);
      if (!/Languages are paused/.test(container.querySelector('#banners').textContent)) problems.push('the block is not announced');
      return problems;
    },
  },
];

const note = { type: 'quota', tone: 'caution', title: 'Quota low', message: 'Few lookups left today.', dismissible: true };
const plain = { type: 'info', message: 'Plain notice, no action.' };

export default [
  ...degradationScenarios,
  {
    name: 'Banner · new version available',
    render(container) {
      container.region = slotIn(container);
      container.asked = [];
      renderBanners(container.region, [updateBanner()], { onAction: (name) => container.asked.push(name) });
    },
    check(container) {
      const problems = checkRegion(container.region, 1);
      const action = container.region.querySelector('.banner__actions button');
      if (container.region.querySelector('.banner__title')?.textContent !== 'A new version is available') problems.push('the title is wrong');
      if (action?.textContent !== 'Reload') return [...problems, 'the "Reload" button is missing'];
      if (action.getBoundingClientRect().height < 44) problems.push('the button is smaller than a tap target');
      action.click();
      if (container.asked.join() !== 'reload') problems.push('the button does not ask for the reload');
      return problems;
    },
  },
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
