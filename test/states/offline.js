import { createCache } from '../../src/api/cache.js';
import { createSources, titleKeys } from '../../src/api/sources.js';
import { startApp } from '../../src/app.js';
import { createSettings } from '../../src/settings/keys.js';
import { createStore } from '../../src/state.js';
import { checkNoOverflow } from './kit.js';

function memoryStorage(initial) {
  const entries = new Map(Object.entries(initial));
  return {
    get length() { return entries.size; },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (name) => entries.get(name) ?? null,
    setItem: (name, value) => void entries.set(name, String(value)),
    removeItem: (name) => void entries.delete(name),
  };
}

const offer = (country) => ({
  country, serviceKey: 'netflix', serviceName: 'Netflix', serviceLogoPath: null,
  offerType: 'subscription', source: 'tmdb', link: null, quality: null, expiresOn: null, languages: [],
});

const viewed = [
  { id: 11, name: 'Harbour Lights', countries: ['fr', 'us'], date: '2026-11-19T10:00:00.000Z' },
  { id: 12, name: 'The Quiet Orchard and the Very Long Second Half of Its Title', countries: [], date: '2026-11-18T10:00:00.000Z' },
];

function save(cache, { id, name, countries, date }) {
  const ref = `movie/${id}`;
  const meta = { source: 'tmdb' };
  cache.set(titleKeys.details(ref), { imdbId: null, title: { mediaType: 'movie', tmdbId: id, title: name, year: 2023, posterPath: null, ref } },
    { ...meta, kind: 'metadata' });
  cache.set(titleKeys.providers(ref), { offers: countries.map(offer), coveredCountries: 2, fetchedAt: date }, { ...meta, kind: 'availability' });
}

// The real shell and the real cached reads; the one source refuses every request.
function mount(container, titles, { online = false, launchTitle = null } = {}) {
  container.innerHTML = '<div id="header"></div><div id="welcome" hidden></div><div id="settings" hidden></div>'
    + '<section id="search-view" hidden><div id="banners"></div><div id="search"></div><div id="offline"></div><div id="title"></div></section>';
  const storage = memoryStorage({ 'wtw.key.tmdb': 'sample-tmdb-key', 'wtw.pref.country': 'fr' });
  const cache = createCache({ storage });
  titles.forEach((entry) => save(cache, entry));
  cache.set('tmdb.regions', ['fr', 'us'], { kind: 'metadata', source: 'tmdb' });
  const requests = [];
  const refuse = (name) => async () => {
    requests.push(name);
    throw new Error('no network');
  };
  const sources = createSources({
    cache,
    sources: [{
      id: 'tmdb', capabilities: { search: true, availability: true, languages: false },
      searchTitles: refuse('search'), getAvailability: refuse('availability'), listCoveredCountries: refuse('coverage'),
    }],
  });
  const settings = createSettings({ storage, navigatorLike: { language: 'fr-FR' }, cache });
  const store = createStore();
  const app = startApp({
    store, settings, sources, getTitle: refuse('title'), imageConfiguration: refuse('images'), durable: true,
  }, container, { online, launchTitle });
  return { app, store, requests };
}

async function until(test) {
  for (let turn = 0; turn < 200 && !test(); turn += 1) await new Promise((resolve) => setTimeout(resolve, 10));
}

function offlineShell(container) {
  const problems = checkNoOverflow(container.querySelector('#banners'));
  const field = container.querySelector('#search input');
  if (!field.disabled) problems.push('the field is not disabled');
  if (field.placeholder !== 'Connection required') problems.push('"Connection required" is not shown');
  if (!/You’re offline/.test(container.querySelector('#banners').textContent)) problems.push('the offline banner is missing');
  if (container.mounted.store.get().mode !== 'offline') problems.push('the mode is not offline');
  if (container.mounted.requests.length) problems.push(`requests made offline: ${container.mounted.requests.join()}`);
  return problems;
}

export default [
  {
    name: 'Offline · nothing viewed yet',
    async render(container) {
      container.mounted = mount(container, []);
      await until(() => container.querySelector('#offline h2'));
    },
    check(container) {
      const problems = offlineShell(container);
      if (!container.querySelector('#offline').textContent.includes('No titles viewed on this device yet.')) problems.push('the empty list is not explained');
      return problems;
    },
  },
  {
    name: 'Offline · viewed titles with their date',
    async render(container) {
      container.mounted = mount(container, viewed);
      await until(() => container.querySelector('#offline a'));
    },
    check(container) {
      const problems = [...offlineShell(container), ...checkNoOverflow(container.querySelector('#offline'))];
      const rows = [...container.querySelectorAll('.recent a')].map((row) => row.textContent);
      if (!/Harbour Lights.*Netflix: 2 countries · data from 19 Nov 2026/.test(rows[0])) problems.push(`unexpected first row: ${rows[0]}`);
      if (!/Netflix: not enough data · data from 18 Nov 2026/.test(rows[1])) problems.push(`unexpected second row: ${rows[1]}`);
      const sources = container.querySelector('#offline > .source-line');
      if (!/JustWatch.*Movie of the Night/.test(sources?.textContent) || !sources.querySelector('a[href]')) problems.push('the attributions are missing');
      return problems;
    },
  },
  {
    name: 'Offline · a viewed title opened from the list',
    async render(container) {
      container.mounted = mount(container, viewed);
      await until(() => container.querySelector('#offline a'));
      container.querySelector('#offline a').click();
      await until(() => container.querySelector('#title .verdict__headline'));
    },
    async check(container) {
      const problems = offlineShell(container);
      const text = container.querySelector('#title').textContent;
      if (!text.includes('Harbour Lights') || !text.includes('19 Nov 2026')) problems.push('the saved title or its date is missing');
      if (container.querySelector('#title img')) problems.push('a picture is requested offline');
      const back = container.querySelector('#offline button');
      if (back?.textContent !== 'Back to viewed titles') return [...problems, 'there is no way back to the list'];
      back.click();
      await until(() => container.querySelector('#offline a'));
      if (container.querySelector('#title').textContent) problems.push('the title stays after going back');
      if (document.activeElement !== container.querySelector('#offline a')) problems.push('the focus does not return to the title left');
      // Leave the opened title on screen for the capture.
      container.querySelector('#offline a').click();
      await until(() => container.querySelector('#title .verdict__headline'));
      return problems;
    },
  },
  {
    name: 'Offline · direct link to a title that was not saved',
    async render(container) {
      container.mounted = mount(container, viewed, { launchTitle: 'movie/99' });
      await until(() => container.querySelector('#title .verdict'));
    },
    check(container) {
      const problems = offlineShell(container);
      if (!container.querySelector('#title').textContent.includes('This title is not saved on this device.')) problems.push('the missing title is not explained');
      return problems;
    },
  },
  {
    name: 'Offline · network back',
    async render(container) {
      container.mounted = mount(container, viewed);
      await until(() => container.querySelector('#offline a'));
      container.mounted.app.setOnline(true);
    },
    check(container) {
      const problems = [];
      const field = container.querySelector('#search input');
      if (field.disabled || field.placeholder !== 'Search') problems.push('the search is not enabled again');
      if (/offline/i.test(container.querySelector('#banners').textContent)) problems.push('the offline banner stays');
      if (container.querySelector('#offline').childElementCount) problems.push('the offline list stays');
      if (container.mounted.store.get().mode !== 'tmdbOnly') problems.push('the mode is not restored');
      return problems;
    },
  },
];
