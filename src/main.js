// Startup: compose the services, then show the welcome, the search or the Settings.
import { compose } from './compose.js';
import { applyStaticStrings, t } from './i18n/strings.js';
import { renderHeader } from './render/header.js';
import { renderSettings } from './render/settings.js';
import { renderWelcome } from './render/welcome.js';

applyStaticStrings(document);

const app = compose();
const { store, settings } = app;

const headerSlot = document.querySelector('#header');
const searchView = document.querySelector('#search-view');
const welcomeSlot = document.querySelector('#welcome');
const settingsSlot = document.querySelector('#settings');

const input = document.querySelector('#q');
const status = document.querySelector('#status');
input.addEventListener('input', () => {
  status.textContent = input.value.trim() ? t('search.loading') : t('search.hint');
});

const openSettings = () => {
  firstRun = !settings.hasKey('tmdb');
  store.set({ settingsOpen: true });
};
const closeSettings = () => store.set({ settingsOpen: false });

let shown = null;
let screen = null;
let firstRun = false;

function currentView({ settingsOpen }) {
  if (settingsOpen) return 'settings';
  return settings.hasKey('tmdb') ? 'search' : 'welcome';
}

function render(state) {
  const view = currentView(state);
  const changed = view !== shown;
  if (changed) {
    headerSlot.replaceChildren(renderHeader({
      settingsOpen: view === 'settings',
      onOpenSettings: openSettings,
      onCloseSettings: closeSettings,
    }));
  }

  searchView.hidden = view !== 'search';
  welcomeSlot.hidden = view !== 'welcome';
  settingsSlot.hidden = view !== 'settings';
  if (!changed) return;

  // Leaving Settings cancels any key check or save still running, so nothing is stored late.
  screen?.dispose?.();
  screen = null;
  welcomeSlot.replaceChildren();
  settingsSlot.replaceChildren();
  if (view === 'welcome') welcomeSlot.append(renderWelcome({ onOpenSettings: openSettings }));
  if (view === 'settings') {
    screen = renderSettings({
      settings,
      checkKey: app.checkKey,
      quotaLimit: app.quotaLimit,
      // The first saved key ends the first run: go back to search.
      onChange: (provider, outcome) => {
        // An unverified key stays on screen so the user can read the outcome and test again.
        if (firstRun && settings.hasKey('tmdb') && outcome !== 'unverified') closeSettings();
      },
      onCleared: () => {
        document.documentElement.setAttribute('data-theme', 'dark');
        closeSettings();
      },
    });
    settingsSlot.append(screen);
  }
  // Move the keyboard and screen reader position to the new screen, but not on first load.
  const target = shown === null ? null : document.querySelector('[data-focus-target]');
  if (target) {
    target.tabIndex = -1;
    target.focus();
  }
  shown = view;
}

store.subscribe(render);
render(store.get());

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
