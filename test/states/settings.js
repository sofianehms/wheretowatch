import { createCache } from '../../src/api/cache.js';
import { createQuota } from '../../src/api/quota.js';
import { startApp } from '../../src/app.js';
import { renderClearDialog, renderSettings } from '../../src/render/settings.js';
import { renderWelcome } from '../../src/render/welcome.js';
import { createSettings } from '../../src/settings/keys.js';
import { createStore } from '../../src/state.js';
import { checkNoOverflow, el } from './kit.js';

const sampleKey = 'eyJhbGciOiJIUzI1NiJ9.sample';
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (name) => entries.get(name) ?? null,
    setItem: (name, value) => void entries.set(name, String(value)),
    // Like real storage, removing an entry reorders the remaining keys.
    removeItem: (name) => {
      if (!entries.delete(name)) return;
      const rest = [...entries].reverse();
      entries.clear();
      for (const [key, value] of rest) entries.set(key, value);
    },
  };
}

function mount(container, { stored = {}, storage: shared, check = async () => 'valid', onCleared, durable, sources, onCountryChange } = {}) {
  container.checks = [];
  const run = check;
  check = (provider, value, deps) => {
    container.checks.push([provider, value]);
    return run(provider, value, deps);
  };
  const storage = shared ?? memoryStorage(stored);
  const quota = createQuota({ storage });
  const settings = createSettings({
    storage,
    navigatorLike: { language: 'en-GB' },
    cache: createCache({ storage }),
    quota,
  });
  const root = renderSettings({
    settings,
    checkKey: check,
    sources,
    onCountryChange,
    quotaLimit: () => quota.status().limit,
    durable,
    onCleared,
  });
  container.append(root);
  return { root, storage, settings };
}

// The real application shell (src/app.js) on a page skeleton, with checks the scenario releases by hand.
function mountApp(container, { stored = {}, productionRoot = false, sources, launchQuery = null } = {}) {
  const html = '<div id="header"></div><div id="welcome" hidden></div><div id="settings" hidden></div>'
    + '<section id="search-view" hidden><div id="search"></div></section>';
  // The production entry point defaults to the whole document, whose `ownerDocument` is null.
  const root = productionRoot ? document.implementation.createHTMLDocument('') : container;
  if (productionRoot) root.body.innerHTML = html;
  else container.innerHTML = html;
  const storage = memoryStorage(stored);
  const quota = createQuota({ storage });
  const settings = createSettings({ storage, navigatorLike: { language: 'en-GB' }, cache: createCache({ storage }), quota });
  const store = createStore();
  const pending = {};
  const checkKey = (provider) => new Promise((resolve) => { pending[provider] = resolve; });
  startApp({ store, settings, sources, checkKey, quotaLimit: () => quota.status().limit, durable: true }, root, { launchQuery });
  return { root, storage, store, pending, settings };
}
const shown = (container) => ['welcome', 'settings', 'search-view'].find((id) => !container.querySelector(`#${id}`).hidden);

const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const fieldOf = (container, provider) => container.querySelector(`input[id^="key-${provider}-"]`);
const statusOf = (input) => document.getElementById(input.getAttribute('aria-describedby').split(' ')[0]);
const buttonNamed = (scope, name) => [...scope.querySelectorAll('button')].find((button) => button.textContent === name);

// Common contract of every key field: a label, a masked input with browser helpers off.
function checkFields(container) {
  const problems = [];
  for (const input of container.querySelectorAll('.input-row input')) {
    if (!input.labels?.length) problems.push(`the field ${input.id} has no label`);
    if (input.getAttribute('autocomplete') !== 'off') problems.push('autocomplete is not off');
    if (input.getAttribute('spellcheck') !== 'false') problems.push('spellcheck is not off');
  }
  return [...problems, ...checkNoOverflow(container)];
}

// A scenario that types a key into the TMDB field, presses Test and reaches the given outcome.
function testScenario(name, outcome, expected) {
  return {
    name,
    async render(container) {
      const check = outcome === 'pending' ? () => new Promise(() => {}) : async () => outcome;
      mount(container, { check });
      const input = fieldOf(container, 'tmdb');
      type(input, sampleKey);
      buttonNamed(container, 'Test').click();
      await settle();
    },
    check(container) {
      const input = fieldOf(container, 'tmdb');
      const state = statusOf(input);
      const problems = checkFields(container);
      if (!state.textContent.includes(expected.text)) problems.push(`the status says "${state.textContent}"`);
      if (!state.classList.contains(`key-state--${expected.tone}`)) problems.push(`the status is not ${expected.tone}`);
      if (!state.querySelector('svg')) problems.push('the status has no icon');
      if (state.getAttribute('role') !== 'status') problems.push('the status is not announced');
      const busy = outcome === 'pending';
      if (buttonNamed(container, 'Test').getAttribute('aria-disabled') !== String(busy)) problems.push('the Test button state is wrong');
      return problems;
    },
  };
}

// A scenario that picks a theme in the real Settings screen and checks the page and the stored choice.
function themeScenario(name, label, value, { stored } = {}) {
  return {
    name,
    render(container) {
      container.previousTheme = document.documentElement.getAttribute('data-theme');
      container.mounted = mount(container, stored ? { stored: { 'wtw.theme': stored } } : {});
    },
    check(container) {
      const problems = checkNoOverflow(container);
      const radios = [...container.querySelectorAll('fieldset.segmented input[type="radio"]')];
      if (radios.length !== 3) return [...problems, `${radios.length} theme choices`];
      if (new Set(radios.map((radio) => radio.name)).size !== 1) problems.push('the choices are not one radio group');
      // Keyboard operability: native radios, reachable by Tab and arrow keys, never removed from the tab order.
      if (radios.some((radio) => radio.disabled || radio.tabIndex < 0 || radio.hidden || radio.closest('[hidden], [inert]'))) problems.push('a theme choice cannot be reached with the keyboard');
      const choice = radios.find((radio) => radio.value === value);
      if (!choice.labels?.[0]?.textContent.includes(label)) problems.push(`the ${value} choice is not labelled ${label}`);
      if (!container.querySelector('fieldset legend')) problems.push('the group has no legend');
      const checked = radios.filter((radio) => radio.checked).map((radio) => radio.value);
      if (stored ? checked[0] !== stored : checked[0] !== 'dark') problems.push(`the checked choice is ${checked}`);
      choice.checked = true;
      choice.dispatchEvent(new Event('change', { bubbles: true }));
      if (document.documentElement.getAttribute('data-theme') !== value) problems.push('the theme does not change without a reload');
      if (container.mounted.storage.getItem('wtw.theme') !== value) problems.push('the choice is not remembered');
      if (container.mounted.settings.getPref('theme') !== value) problems.push('setPref does not return the choice');
      const previous = container.previousTheme;
      if (previous === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', previous);
      return problems;
    },
  };
}

// A save that fails still applies the choice; reopening Settings must show that choice and the warning.
// The whole sequence runs while rendering so the shared failed-save state never reaches other scenarios.
const failedSaveScenario = {
  name: 'Settings · theme save failed, reopened',
  render(container) {
    const problems = [];
    const previous = document.documentElement.getAttribute('data-theme');
    const storage = memoryStorage({ 'wtw.theme': 'auto' });
    const working = storage.setItem;
    storage.setItem = () => { throw new Error('storage full'); };
    const first = mount(container, { storage });
    first.root.querySelector('input[value="dark"]').dispatchEvent(new Event('change', { bubbles: true }));
    first.root.remove();
    container.reopened = mount(container, { storage });
    const radios = [...container.reopened.root.querySelectorAll('fieldset.segmented input[type="radio"]')];
    const checked = radios.filter((radio) => radio.checked).map((radio) => radio.value);
    if (checked.join() !== 'dark') problems.push(`reopened Settings selects ${checked}, not the applied dark`);
    if (container.reopened.root.querySelector('.key-state--bad[role="status"]')?.hidden !== false) problems.push('the save warning is gone after reopening');
    // A later successful save clears the failed-save state.
    storage.setItem = working;
    radios.find((radio) => radio.value === 'auto').dispatchEvent(new Event('change', { bubbles: true }));
    if (container.reopened.root.querySelector('.key-state--bad[role="status"]')?.hidden !== true) problems.push('the save warning stays after a successful retry');
    // A failed save followed by "Clear my data" must not leak the unsaved choice into the next Settings.
    storage.setItem = () => { throw new Error('storage full'); };
    container.reopened.root.remove();
    const failing = mount(container, { storage });
    failing.root.querySelector('input[value="light"]').dispatchEvent(new Event('change', { bubbles: true }));
    storage.setItem = working;
    buttonNamed(failing.root, 'Clear my data').click();
    buttonNamed(failing.root, 'Clear data').click();
    failing.root.remove();
    const afterClear = mount(container, { storage });
    const left = [...afterClear.root.querySelectorAll('fieldset.segmented input[type="radio"]')].filter((radio) => radio.checked).map((radio) => radio.value);
    if (left.join() !== 'dark') problems.push(`Settings after erasure selects ${left}, not dark`);
    if (afterClear.root.querySelector('.key-state--bad[role="status"]')?.hidden !== true) problems.push('the save warning survives the erasure');
    container.reopened = afterClear;
    if (previous === null) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', previous);
    container.problems = problems;
  },
  check: (container) => container.problems,
};

const coverageOf = (...lists) => ({
  activeSources: lists.map((list) => ({ listCoveredCountries: async () => list })),
});

// The reference country: sorted localized names, prefilled from the browser language, a choice is stored and announced.
const countryScenario = {
  name: 'Settings · reference country',
  async render(container) {
    container.changes = [];
    container.mounted = mount(container, {
      sources: coverageOf(['us', 'fr', 'jp'], ['de', 'FR']),
      onCountryChange: (code) => container.changes.push(code),
    });
    await settle();
    await settle();
  },
  check(container) {
    const problems = checkNoOverflow(container);
    const select = container.querySelector('.settings select');
    if (!select) return [...problems, 'the country selector is missing'];
    if (!select.labels?.length) problems.push('the country selector has no label');
    if (!select.getAttribute('aria-describedby')) problems.push('the country selector has no help text');
    const names = [...select.options].map((option) => option.textContent);
    if (names.join() !== ['France', 'Germany', 'Japan', 'United Kingdom', 'United States'].join()) problems.push(`the options are ${names}`);
    if (select.value !== 'gb') problems.push(`the prefilled country is ${select.value}`);
    select.value = 'jp';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (container.mounted.settings.getPref('country') !== 'jp') problems.push('the choice is not stored');
    if (container.changes.join() !== 'jp') problems.push('the change is not announced to the page');
    return problems;
  },
};

// A key saved from Settings enables another source: the open selector must offer its countries without reopening.
const countryRefreshScenario = {
  name: 'Settings · country list follows the active sources',
  async render(container) {
    const active = [{ listCoveredCountries: async () => ['fr'] }];
    container.mounted = mount(container, { sources: { activeSources: active }, onCountryChange: () => {} });
    container.active = active;
    await settle();
    await settle();
  },
  async check(container) {
    const select = container.querySelector('.settings select');
    if (!select) return ['the country selector is missing'];
    const problems = [];
    const before = [...select.options].map((option) => option.value).join();
    if (!before.includes('fr') || before.includes('jp')) problems.push(`unexpected initial options: ${before}`);
    container.active.push({ listCoveredCountries: async () => ['jp'] });
    select.closest('section').refresh();
    await settle();
    await settle();
    const after = [...select.options].map((option) => option.value);
    if (!after.includes('jp') || !after.includes('fr')) problems.push(`the list did not refresh: ${after}`);
    return problems;
  },
};

function usageScenario(name, used, expected, meterClass) {
  return {
    name: `Settings · quota ${name}`,
    render(container) {
      const storage = memoryStorage();
      const quota = createQuota({ storage, now: () => Date.UTC(2026, 10, 23) });
      for (let call = 0; call < used; call += 1) quota.record();
      const settings = createSettings({ storage, navigatorLike: { language: 'en-GB' }, cache: createCache({ storage }), quota });
      container.append(renderSettings({ settings, checkKey: async () => 'valid', quotaStatus: quota.status }));
    },
    check(container) {
      const meter = container.querySelector('.meter');
      if (!meter) return ['the quota counter is missing'];
      const problems = checkNoOverflow(container);
      const line = meter.querySelector('p').textContent;
      if (!expected.test(line)) problems.push(`unexpected quota line: ${line}`);
      if (meter.className !== meterClass) problems.push(`the meter classes are "${meter.className}"`);
      if (Boolean(meter.querySelector('p .icon')) !== (meterClass !== 'meter')) problems.push('the state icon is wrong');
      if (meter.querySelector('.meter__bar').getAttribute('aria-hidden') !== 'true') problems.push('the bar is not decorative');
      const track = meter.querySelector('.meter__bar').clientWidth;
      if (!(track > 0)) return [...problems, 'the bar has no width'];
      const share = meter.querySelector('.meter__fill').getBoundingClientRect().width / track;
      if (Math.abs(share - Math.min(1, used / 1000)) > 0.01) problems.push(`the bar shows ${share}`);
      return problems;
    },
  };
}

const usageScenarios = [
  usageScenario('normal', 312, /^312 of 1,000 calls used · resets on 1 Dec 2026$/, 'meter'),
  usageScenario('warning', 812, /812 of 1,000 getting close: languages stop at 1,000 · resets on 1 Dec 2026$/, 'meter meter--caution'),
  usageScenario('blocked', 1000, /1,000 of 1,000 limit reached: languages paused until 1 Dec 2026$/, 'meter meter--danger'),
];

const scenarios = [
  ...usageScenarios,
  countryScenario,
  countryRefreshScenario,
  failedSaveScenario,
  themeScenario('Settings · dark theme chosen', 'Dark', 'dark', { stored: 'light' }),
  themeScenario('Settings · light theme chosen', 'Light', 'light'),
  themeScenario('Settings · auto theme chosen', 'Auto', 'auto'),
  {
    name: 'Settings · empty',
    render(container) {
      mount(container);
    },
    check(container) {
      const problems = checkFields(container);
      const tmdb = fieldOf(container, 'tmdb');
      if (tmdb.value !== '' || tmdb.type !== 'password') problems.push('the TMDB field is not empty and masked');
      if (!statusOf(tmdb).hidden) problems.push('an empty field shows a status');
      if (buttonNamed(container, 'Test').getAttribute('aria-disabled') !== 'true') problems.push('Test is enabled without a key');
      const links = [...container.querySelectorAll('a[href^="https://"]')];
      if (links.length !== 2 || links.some((link) => link.rel !== 'noopener noreferrer')) problems.push('the key creation links are missing or unsafe');
      if (!container.textContent.includes('1 of your 1,000 free monthly calls')) problems.push('the quota cost of the optional test is not mentioned');
      if (!container.textContent.includes('after 7 days without use')) problems.push('the Safari retention message is missing');
      if (!container.textContent.includes('provider’s terms')) problems.push('the reminder of the provider terms is missing');
      return problems;
    },
  },
  {
    name: 'Settings · masked input',
    render(container) {
      mount(container, { stored: { 'wtw.key.tmdb': sampleKey, 'wtw.key.sa': sampleKey } });
    },
    check(container) {
      const problems = checkFields(container);
      for (const provider of ['tmdb', 'sa']) {
        const input = fieldOf(container, provider);
        const toggle = input.nextElementSibling;
        if (input.type !== 'password') problems.push(`the saved ${provider} key is not masked`);
        if (statusOf(input).textContent !== 'Saved on this device.') problems.push(`the saved ${provider} key shows no saved status`);
        toggle.click();
        if (input.type !== 'text' || toggle.getAttribute('aria-pressed') !== 'true' || toggle.textContent !== 'Hide') problems.push(`Show does not reveal the ${provider} key`);
        toggle.click();
        if (input.type !== 'password' || toggle.getAttribute('aria-pressed') !== 'false') problems.push(`Hide does not mask the ${provider} key again`);
      }
      return problems;
    },
  },
  {
    name: 'Settings · an unchecked key stays marked after reopening',
    async render(container) {
      const first = mount(container, { check: async () => 'network' });
      type(fieldOf(first.root, 'tmdb'), sampleKey);
      buttonNamed(first.root, 'Save').click();
      await settle();
      container.markerWritten = first.storage.getItem('wtw.unverified.tmdb') !== null;
      // Reopen Settings on the very same storage, as after a reload.
      container.replaceChildren();
      mount(container, { storage: first.storage });
    },
    check(container) {
      const problems = checkFields(container);
      if (!container.markerWritten) problems.push('the first save did not write the unchecked marker');
      const state = statusOf(fieldOf(container, 'tmdb'));
      if (!state.textContent.includes('not checked yet. Press Test')) problems.push('the unchecked outcome is lost after reopening');
      if (state.classList.contains('key-state--ok')) problems.push('an unchecked key shows a success look');
      return problems;
    },
  },
  {
    name: 'Settings · testing a saved unchecked key clears the mark',
    async render(container) {
      const { storage } = mount(container, { stored: { 'wtw.key.tmdb': sampleKey, 'wtw.unverified.tmdb': '1' } });
      container.storage = storage;
      buttonNamed(container, 'Test').click();
      await settle();
    },
    check(container) {
      const problems = checkFields(container);
      if (statusOf(fieldOf(container, 'tmdb')).textContent !== 'Saved on this device.') problems.push('a verified key is not reported as saved');
      if (container.storage.getItem('wtw.unverified.tmdb') !== null) problems.push('the unchecked mark stays after a successful test');
      return problems;
    },
  },
  {
    name: 'Settings · a key kept only for this visit says so',
    async render(container) {
      mount(container, { durable: false });
      type(fieldOf(container, 'tmdb'), sampleKey);
      buttonNamed(container, 'Save').click();
      await settle();
    },
    check(container) {
      const problems = checkFields(container);
      if (!container.textContent.includes('Your browser blocks storage')) problems.push('the storage warning is missing');
      if (statusOf(fieldOf(container, 'tmdb')).textContent !== 'Kept for this visit only.') problems.push('a temporary key is reported as saved on the device');
      return problems;
    },
  },
  testScenario('Settings · test in progress', 'pending', { text: 'Testing…', tone: 'busy' }),
  testScenario('Settings · valid key', 'valid', { text: 'Key works. Save it to use it.', tone: 'ok' }),
  testScenario('Settings · invalid key', 'invalid', { text: 'TMDB rejected this key.', tone: 'bad' }),
  testScenario('Settings · network error', 'network', { text: 'Couldn’t reach TMDB.', tone: 'bad' }),
  {
    name: 'Settings · save a valid key',
    async render(container) {
      container.storage = mount(container).storage;
      type(fieldOf(container, 'tmdb'), `  ${sampleKey}  `);
      buttonNamed(container, 'Save').click();
      await settle();
    },
    check(container) {
      const problems = checkFields(container);
      const input = fieldOf(container, 'tmdb');
      if (statusOf(input).textContent !== 'Saved on this device.') problems.push('the key is not reported as saved');
      if (buttonNamed(container, 'Save').getAttribute('aria-disabled') !== 'true') problems.push('Save stays enabled once the key is saved');
      if (container.storage.getItem('wtw.key.tmdb') !== sampleKey) problems.push('the key is not written to storage');
      return problems;
    },
  },
  {
    name: 'Settings · an invalid key is not saved',
    async render(container) {
      const { storage } = mount(container, { check: async () => 'invalid' });
      container.storage = storage;
      type(fieldOf(container, 'tmdb'), sampleKey);
      buttonNamed(container, 'Save').click();
      await settle();
    },
    check(container) {
      const problems = checkFields(container);
      if (container.storage.getItem('wtw.key.tmdb') !== null) problems.push('a rejected key was saved');
      if (!statusOf(fieldOf(container, 'tmdb')).textContent.startsWith('TMDB rejected this key.')) problems.push('the rejection is not reported');
      if (container.checks.length !== 1 || container.checks[0][0] !== 'tmdb') problems.push('the key was not checked once');
      return problems;
    },
  },
  {
    name: 'Settings · the optional key is tested before it is saved',
    async render(container) {
      const { storage } = mount(container, { check: async (provider) => (provider === 'sa' ? 'invalid' : 'valid') });
      container.storage = storage;
      type(fieldOf(container, 'sa'), 'sa-sample');
      buttonNamed(container.querySelectorAll('.field')[1], 'Save').click();
      await settle();
    },
    check(container) {
      const problems = checkFields(container);
      if (container.storage.getItem('wtw.key.sa') !== null) problems.push('a rejected optional key was saved');
      if (!statusOf(fieldOf(container, 'sa')).textContent.startsWith('Movie of the Night rejected this key.')) problems.push('the rejection is not reported');
      if (container.checks.length !== 1 || container.checks[0][0] !== 'sa') problems.push('the optional key was not checked once');
      return problems;
    },
  },
  {
    name: 'Settings · a tested key is not charged again on save',
    async render(container) {
      const { storage } = mount(container);
      container.storage = storage;
      type(fieldOf(container, 'sa'), 'sa-sample');
      const field = container.querySelectorAll('.field')[1];
      buttonNamed(field, 'Test').click();
      await settle();
      buttonNamed(field, 'Save').click();
      await settle();
    },
    check(container) {
      const problems = checkFields(container);
      if (container.storage.getItem('wtw.key.sa') !== 'sa-sample') problems.push('the tested key is not saved');
      if (container.checks.length !== 1) problems.push(`the key was checked ${container.checks.length} times`);
      return problems;
    },
  },
  {
    name: 'Settings · saving checks the key again after a network failure',
    async render(container) {
      const outcomes = ['network', 'valid'];
      const { storage } = mount(container, { check: async () => outcomes.shift() ?? 'valid' });
      container.storage = storage;
      type(fieldOf(container, 'tmdb'), sampleKey);
      buttonNamed(container, 'Test').click();
      await settle();
      buttonNamed(container, 'Save').click();
      await settle();
    },
    check(container) {
      const problems = checkFields(container);
      if (container.checks.length !== 2) problems.push(`the key was checked ${container.checks.length} times, expected 2`);
      if (container.storage.getItem('wtw.key.tmdb') !== sampleKey) problems.push('the key is not saved');
      if (container.storage.getItem('wtw.unverified.tmdb') !== null) problems.push('the key stays marked unchecked after a successful check');
      return problems;
    },
  },
  {
    name: 'Settings · the search field stays in the Tab order after leaving Settings',
    async render(container) {
      const app = mountApp(container, { stored: { 'wtw.key.tmdb': sampleKey } });
      container.app = app;
      container.querySelector('#header .icon-btn').click();
      await settle();
      container.querySelector('#header .icon-btn').click();
      await settle();
      // A heading made focusable by the shell is not an interactive target for the 44 px check.
      container.querySelector('h1[data-focus-target]')?.removeAttribute('tabindex');
    },
    check(container) {
      const problems = [];
      if (shown(container) !== 'search-view') problems.push(`the screen is ${shown(container)}, not the search`);
      const input = container.querySelector('#search input');
      if (input.tabIndex < 0) problems.push('the search field was taken out of the Tab order');
      return problems;
    },
  },
  {
    name: 'Settings · one primary action at a time',
    render(container) {
      mount(container);
    },
    check(container) {
      type(fieldOf(container, 'tmdb'), sampleKey);
      type(fieldOf(container, 'sa'), 'sa-sample');
      const primary = container.querySelectorAll('.settings .btn--primary');
      return primary.length === 1 ? [] : [`${primary.length} primary buttons`];
    },
  },
  {
    name: 'Settings · clearing data also empties the search',
    render(container) {
      const { storage } = mountApp(container, { stored: { 'wtw.key.tmdb': sampleKey } });
      container.storage = storage;
      container.theme = document.documentElement.getAttribute('data-theme');
    },
    check(container) {
      const input = container.querySelector('#search input');
      type(input, 'dune');
      const problems = [];
      container.querySelector('#header .icon-btn').click();
      buttonNamed(container, 'Clear my data').click();
      buttonNamed(container, 'Clear data').click();
      if (container.theme === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', container.theme);
      if (input.value !== '') problems.push('the previous query survives erasure');
      if (container.querySelector('#search .listbox:not([hidden])')) problems.push('the suggestions survive erasure');
      return problems;
    },
  },
  {
    name: 'Settings · erasure through the production entry point closes Settings and drops the key',
    render(container) {
      const app = mountApp(container, { stored: { 'wtw.key.tmdb': sampleKey }, productionRoot: true });
      container.app = app;
      app.root.querySelector('#header .icon-btn').click();
      buttonNamed(app.root, 'Clear my data').click();
      buttonNamed(app.root, 'Clear data').click();
    },
    check(container) {
      const { root, storage } = container.app;
      const problems = [];
      if (shown(root) !== 'welcome') problems.push(`the screen after erasure is ${shown(root)}, not the welcome`);
      if (root.querySelector('input[id^="key-tmdb-"]')) problems.push('the erased key field is still on screen');
      if (storage.getItem('wtw.key.tmdb') !== null) problems.push('the key is still stored');
      return problems;
    },
  },
  {
    name: 'Settings · a save finishing keeps the erasure confirmation open',
    async render(container) {
      const app = mountApp(container);
      container.app = app;
      container.querySelector('#header .icon-btn').click();
      type(fieldOf(container, 'tmdb'), sampleKey);
      buttonNamed(container, 'Save').click();
      buttonNamed(container, 'Clear my data').click();
      app.pending.tmdb('valid');
      await settle();
      // The shell made the heading a programmatic focus target; it is not an interactive control.
      container.querySelector('[data-focus-target]')?.removeAttribute('tabindex');
    },
    check(container) {
      const problems = [];
      if (shown(container) !== 'settings') problems.push(`Settings was left (${shown(container)}) while the confirmation was open`);
      if (!container.querySelector('[role="alertdialog"]')) problems.push('the confirmation vanished before the user decided');
      return problems;
    },
  },
  {
    name: 'Settings · first run keeps Settings open while the other key is saved',
    async render(container) {
      const app = mountApp(container);
      container.app = app;
      container.querySelector('#header .icon-btn').click();
      type(fieldOf(container, 'tmdb'), sampleKey);
      type(fieldOf(container, 'sa'), 'sa-sample');
      const fields = container.querySelectorAll('.field');
      buttonNamed(fields[0], 'Save').click();
      buttonNamed(fields[1], 'Save').click();
      app.pending.tmdb('valid');
      await settle();
      container.afterTmdb = shown(container);
      app.pending.sa('valid');
      await settle();
    },
    check(container) {
      const problems = [];
      if (container.afterTmdb !== 'settings') problems.push(`Settings closed (${container.afterTmdb}) while the other key was still being saved`);
      if (container.app.storage.getItem('wtw.key.sa') !== 'sa-sample') problems.push('the second key was not stored');
      if (container.app.storage.getItem('wtw.key.tmdb') !== sampleKey) problems.push('the first key was not stored');
      if (shown(container) !== 'search-view') problems.push(`the first run did not end on the search (${shown(container)})`);
      return problems;
    },
  },
  {
    name: 'Settings · erasure confirmation',
    render(container) {
      container.calls = [];
      container.append(renderClearDialog({ onCancel: () => container.calls.push('cancel'), onConfirm: () => container.calls.push('confirm') }));
    },
    check(container) {
      const problems = checkNoOverflow(container);
      buttonNamed(container, 'Cancel').click();
      buttonNamed(container, 'Clear data').click();
      if (container.calls.join() !== 'cancel,confirm') problems.push('the buttons do not call their handlers');
      const dialog = container.querySelector('[role="alertdialog"]');
      if (dialog.getAttribute('aria-modal') !== 'true') problems.push('the dialog is not modal');
      if (!dialog.textContent.includes('Clear all data on this device?')) problems.push('the dialog does not ask the question');
      return problems;
    },
  },
  {
    name: 'Settings · clear my data (keyboard and storage)',
    render(container) {
      container.cleared = 0;
      const stored = { 'wtw.key.tmdb': sampleKey, 'wtw.key.sa': 'sa-sample', 'wtw.theme': 'light', 'wtw.cache.search.a': '{}', 'wtw.quota': '{"cycleStart":0,"used":5,"exhausted":false}', 'other.entry': 'kept' };
      const { storage } = mount(container, { stored, onCleared: () => { container.cleared += 1; } });
      container.storage = storage;
    },
    check(container) {
      const problems = [];
      const opener = buttonNamed(container, 'Clear my data');
      opener.focus();
      opener.click();
      const dialog = container.querySelector('[role="alertdialog"]');
      if (!dialog) return ['the dialog does not open'];
      if (document.activeElement?.textContent !== 'Cancel') problems.push('focus does not start on Cancel');
      const press = (key, extra = {}) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
      press('Tab');
      if (document.activeElement?.textContent !== 'Clear data') problems.push('Tab leaves the dialog');
      press('Tab');
      if (document.activeElement?.textContent !== 'Cancel') problems.push('Tab does not wrap inside the dialog');
      press('Escape');
      if (container.querySelector('[role="alertdialog"]')) problems.push('Escape does not close the dialog');
      if (document.activeElement !== opener) problems.push('focus does not return to the button');
      if (container.storage.getItem('wtw.key.tmdb') === null) problems.push('Cancel erased data');

      opener.click();
      buttonNamed(container, 'Clear data').click();
      const left = [];
      for (let index = 0; index < container.storage.length; index += 1) left.push(container.storage.key(index));
      if (left.some((name) => name.startsWith('wtw.'))) problems.push(`stored values remain: ${left.join(', ')}`);
      if (!left.includes('other.entry')) problems.push('clearing removed entries that are not ours');
      if (container.cleared !== 1) problems.push('the screen is not told that data was cleared');
      if (container.querySelector('[role="alertdialog"]')) problems.push('the dialog stays open after clearing');
      return problems;
    },
  },
  {
    name: 'Settings · leaving during a save does not store the key',
    async render(container) {
      let release;
      const { root, storage, settings } = mount(container, { check: () => new Promise((resolve) => { release = resolve; }) });
      type(fieldOf(container, 'tmdb'), sampleKey);
      buttonNamed(container, 'Save').click();
      root.dispose();
      settings.clearAll();
      release('valid');
      await settle();
      container.storage = storage;
    },
    check(container) {
      return container.storage.getItem('wtw.key.tmdb') === null ? [] : ['a save started before leaving restored a key after erasure'];
    },
  },
  {
    name: 'Settings · focus stays on the pressed button during a check',
    render(container) {
      mount(container, { check: () => new Promise(() => {}) });
    },
    check(container) {
      type(fieldOf(container, 'tmdb'), sampleKey);
      const save = buttonNamed(container, 'Save');
      save.focus();
      save.click();
      if (container.querySelector('.field').getAttribute('aria-busy') !== 'true') return ['no key check is in progress'];
      return document.activeElement === save ? [] : ['focus leaves the Save button while the key is checked'];
    },
  },
  {
    name: 'Welcome · no key',
    render(container) {
      container.opened = 0;
      container.append(renderWelcome({ onOpenSettings: () => { container.opened += 1; } }));
    },
    check(container) {
      const problems = checkNoOverflow(container);
      if (container.querySelectorAll('.steps li').length !== 3) problems.push('the three steps are not listed');
      if (container.querySelectorAll('h1').length !== 1) problems.push('the welcome needs one heading');
      if (!container.textContent.includes('Streaming Availability key')) problems.push('the optional key is not offered');
      for (const link of container.querySelectorAll('.steps a')) {
        if (link.matches('.link--inline')) problems.push(`the link "${link.textContent}" opts out of the touch target`);
      }
      buttonNamed(container, 'Add my TMDB key').click();
      if (container.opened !== 1) problems.push('the button does not open the Settings');
      return problems;
    },
  },
  {
    name: 'Launch · ?q= fills the field and shows the suggestions at once',
    async render(container) {
      const calls = [];
      const sources = {
        async searchTitles(query) {
          calls.push(query);
          return { titles: [{ mediaType: 'movie', tmdbId: 27205, imdbId: null, title: 'Inception', year: 2010, posterPath: null, ref: 'movie/27205' }], error: null };
        },
      };
      mountApp(container, { stored: { 'wtw.key.tmdb': sampleKey }, sources, launchQuery: 'inception' });
      container.calls = calls;
      await settle();
    },
    check(container) {
      const problems = [];
      if (shown(container) !== 'search-view') problems.push(`the screen is ${shown(container)}, not the search`);
      if (container.querySelector('#search input').value !== 'inception') problems.push('the field is not prefilled');
      if (container.calls.join() !== 'inception') problems.push(`the search ran ${JSON.stringify(container.calls)}`);
      if (container.querySelectorAll('#search [role="option"]').length !== 1) problems.push('the suggestion is not listed');
      return problems;
    },
  },
  {
    name: 'Search · choosing a suggestion opens the title page with its language disclosure',
    async render(container) {
      const offer = (source, languages) => ({
        source, country: 'fr', serviceKey: 'netflix', serviceName: 'Netflix', serviceLogoPath: null, offerType: 'subscription', link: null,
        quality: null, expiresOn: null, languages,
      });
      const snapshot = (source, offers) => ({ source, status: 'offers', fetchedAt: '2026-11-22T12:00:00Z', coveredCountries: null, offers, error: null });
      const sources = {
        async searchTitles(query) {
          const [name, id] = query === 'second' ? ['Second Tide', 12] : ['Harbour Lights', 11];
          return { titles: [{ mediaType: 'movie', tmdbId: id, imdbId: null, title: name, year: 2023, posterPath: null, ref: `movie/${id}` }], error: null };
        },
        async loadAvailability() {
          return {
            snapshots: [snapshot('tmdb', [offer('tmdb', [])]), snapshot('sa', [offer('sa', [{ kind: 'audio', language: 'fra', region: null, closedCaptions: false }])])],
            coverage: { tmdb: { status: 'fresh', countries: ['fr'] }, sa: { status: 'fresh', countries: ['fr'] } },
          };
        },
      };
      mountApp(container, { stored: { 'wtw.key.tmdb': sampleKey }, sources, launchQuery: 'harbour' });
      await settle();
      container.querySelector('#search [role="option"]').click();
      for (let wait = 0; wait < 50 && !container.querySelector('#title .country__toggle'); wait += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    },
    async check(container) {
      const problems = [];
      const wait = async (ready) => {
        for (let tries = 0; tries < 50 && !ready(); tries += 1) await new Promise((resolve) => setTimeout(resolve, 20));
      };
      const openRow = (label) => {
        if (!container.querySelector('#title .verdict')) problems.push(`${label}: the title page shows no verdict`);
        const toggle = container.querySelector('#title .country__toggle');
        if (!toggle) { problems.push(`${label}: the country row is missing`); return; }
        toggle.click();
        const panel = container.querySelector('#title .langs');
        if (toggle.getAttribute('aria-expanded') !== 'true' || !panel || panel.closest('[hidden]') || !panel.getClientRects().length) {
          problems.push(`${label}: the language panel is not visible after opening the row`);
        } else if (!/French/.test(panel.textContent)) problems.push(`${label}: the audio language is not shown`);
      };
      openRow('first title');
      const input = container.querySelector('#search input');
      input.value = 'second';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (container.querySelector('#title').childElementCount !== 0) problems.push('typing a new query keeps the old title page');
      await wait(() => /Second Tide/.test(container.querySelector('#search [role="option"]')?.textContent ?? ''));
      const option = container.querySelector('#search [role="option"]');
      if (!option || !/Second Tide/.test(option.textContent)) return [...problems, 'the second suggestion is not listed'];
      option.click();
      await wait(() => container.querySelector('#title .country__toggle'));
      if (!/Second Tide/.test(container.querySelector('#title').textContent)) problems.push('the second title is not rendered');
      openRow('second title');
      return problems;
    },
  },
  {
    name: 'Launch · without a key the home screen waits and the search starts once the key is saved',
    async render(container) {
      const calls = [];
      const sources = { async searchTitles(query) { calls.push(query); return { titles: [], error: null }; } };
      const app = mountApp(container, { sources, launchQuery: 'dune' });
      container.calls = calls;
      container.app = app;
      await settle();
    },
    async check(container) {
      const problems = [];
      if (shown(container) !== 'welcome') problems.push(`the screen is ${shown(container)}, not the welcome`);
      if (container.calls.length) problems.push('a search ran without a key');
      container.app.settings.setKey('tmdb', sampleKey);
      container.querySelector('#header .icon-btn').click();
      container.querySelector('#header .icon-btn').click();
      await settle();
      if (shown(container) !== 'search-view') problems.push(`the screen is ${shown(container)}, not the search`);
      if (container.querySelector('#search input').value !== 'dune') problems.push('the query was lost');
      if (container.calls.join() !== 'dune') problems.push(`the search ran ${JSON.stringify(container.calls)}`);
      return problems;
    },
  },
];

export default scenarios;
