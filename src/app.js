// Application shell: wires the services to the welcome, the search and the Settings screens.
import { renderHeader } from './render/header.js';
import { bindSearch } from './render/search.js';
import { renderSettings } from './render/settings.js';
import { renderWelcome } from './render/welcome.js';
import { applyTheme } from './theme.js';

/**
 * Show the right screen for the stored keys and the navigation state.
 * @param {ReturnType<typeof import('./compose.js').compose>} app The composed services.
 * @param {ParentNode} root Where the screen slots (`#header`, `#welcome`, `#settings`, `#search-view`) live.
 */
export function startApp(app, root = document) {
  const { store, settings } = app;

  const headerSlot = root.querySelector('#header');
  const searchView = root.querySelector('#search-view');
  const welcomeSlot = root.querySelector('#welcome');
  const settingsSlot = root.querySelector('#settings');

  const input = root.querySelector('#q');
  const status = root.querySelector('#status');
  const search = bindSearch(input, status);

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
        durable: app.durable,
        // The first saved key ends the first run: go back to search.
        onChange: () => {
          // An unverified key stays on screen so the user can read the outcome and test again.
          // Nor does the screen close while the other key is still being checked (leaving would cancel that save)
          // or while the erasure confirmation waits for the user's decision.
          if (firstRun && settings.hasKey('tmdb') && !settings.isUnverified('tmdb') && !screen.pending() && !screen.confirming()) closeSettings();
        },
        onCleared: () => {
          // Erasure also forgets the query typed before, so the next key starts from a blank search.
          search.reset();
          applyTheme('dark', root.ownerDocument ?? root);
          closeSettings();
        },
      });
      settingsSlot.append(screen);
    }
    // Move the keyboard and screen reader position to the new screen, but not on first load.
    const target = shown === null ? null : root.querySelector('[data-focus-target]');
    if (target) {
      // A heading needs tabindex="-1" to receive focus; a native control (the search field) must stay in the Tab order.
      if (!target.matches('a[href], button, input, select, textarea, summary, [tabindex]')) target.tabIndex = -1;
      target.focus();
    }
    shown = view;
  }

  store.subscribe(render);
  render(store.get());
}
