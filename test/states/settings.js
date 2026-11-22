import { createCache } from '../../src/api/cache.js';
import { createQuota } from '../../src/api/quota.js';
import { renderClearDialog, renderSettings } from '../../src/render/settings.js';
import { renderWelcome } from '../../src/render/welcome.js';
import { createSettings } from '../../src/settings/keys.js';
import { checkNoOverflow } from './kit.js';

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
    removeItem: (name) => void entries.delete(name),
  };
}

function mount(container, { stored = {}, check = async () => 'valid', onCleared } = {}) {
  const storage = memoryStorage(stored);
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
    quotaLimit: () => quota.status().limit,
    onCleared,
  });
  container.append(root);
  return { root, storage, settings };
}

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

const scenarios = [
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
      mount(container, { stored: { 'wtw.key.tmdb': sampleKey } });
    },
    check(container) {
      const problems = checkFields(container);
      const input = fieldOf(container, 'tmdb');
      const toggle = input.nextElementSibling;
      if (input.type !== 'password') problems.push('the saved key is not masked');
      if (statusOf(input).textContent !== 'Saved on this device.') problems.push('the saved key shows no saved status');
      toggle.click();
      if (input.type !== 'text' || toggle.getAttribute('aria-pressed') !== 'true' || toggle.textContent !== 'Hide') problems.push('Show does not reveal the key');
      toggle.click();
      if (input.type !== 'password' || toggle.getAttribute('aria-pressed') !== 'false') problems.push('Hide does not mask the key again');
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
      return problems;
    },
  },
  {
    name: 'Settings · erasure confirmation',
    render(container) {
      container.append(renderClearDialog({ onCancel() {}, onConfirm() {} }));
    },
    check(container) {
      const problems = checkNoOverflow(container);
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
      buttonNamed(container, 'Add my TMDB key').click();
      if (container.opened !== 1) problems.push('the button does not open the Settings');
      return problems;
    },
  },
];

export default scenarios;
