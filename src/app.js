// Application shell: wires the services to the welcome, the search and the Settings screens.
import { createTypeahead } from './core/typeahead.js';
import { renderHeader } from './render/header.js';
import { render as renderSearch } from './render/search.js';
import { renderSettings } from './render/settings.js';
import { renderWelcome } from './render/welcome.js';
import { applyTheme } from './theme.js';

/**
 * Show the right screen for the stored keys and the navigation state.
 * @param {ReturnType<typeof import('./compose.js').compose>} app The composed services.
 * @param {ParentNode} root Where the screen slots (`#header`, `#welcome`, `#settings`, `#search-view`, `#search`) live.
 * @param {{launchQuery?: string | null}} [options] `launchQuery` is the `?q=` value: it fills the field and
 *   starts the search at once, or waits for the TMDB key when none is saved yet.
 */
export function startApp(app, root = document, { launchQuery = null } = {}) {
  const { store, settings } = app;

  const headerSlot = root.querySelector('#header');
  const searchView = root.querySelector('#search-view');
  const welcomeSlot = root.querySelector('#welcome');
  const settingsSlot = root.querySelector('#settings');

  const searchSlot = root.querySelector('#search');
  const titleSlot = root.querySelector('#title') ?? searchView.appendChild(Object.assign((root.ownerDocument ?? root).createElement('div'), { id: 'title' }));

  let searchState = { status: 'idle' };
  let imageConfiguration = null;
  let imageRequested = false;
  let pendingLaunch = launchQuery;

  const online = () => globalThis.navigator?.onLine !== false;
  const noSearch = async () => ({ titles: [] });

  function draw(next = searchState) {
    searchState = next;
    const input = renderSearch(searchSlot, { ...next, online: online(), imageConfiguration }, handlers).input;
    input.dataset.focusTarget = '';
  }

  // The title page needs the network: its code and styles load on the first choice, outside the offline shell.
  let titlePage = null;
  let pendingTitle = null;
  const clearTitle = () => {
    pendingTitle = null;
    titlePage?.clear();
    if (!titlePage) titleSlot.replaceChildren();
  };
  function showTitle(title) {
    pendingTitle = title;
    import('./title-page.js').then(({ createTitlePage }) => {
      titlePage ??= createTitlePage({
        app, slot: titleSlot, root, imageConfiguration: () => imageConfiguration, onCheckKeys: () => openSettings(),
      });
      if (pendingTitle === title) titlePage.show(title);
    }, () => {});
  }

  const typeahead = createTypeahead({
    search: (query, { signal }) => (app.sources?.searchTitles ?? noSearch)(query, { signal }),
    onState(state) {
      draw(state);
      store.set({
        query: state.query ?? '',
        suggestions: state.titles ?? [],
        searchStatus: state.status,
      });
    },
  });

  const handlers = {
    onInput: (value) => { clearTitle(); typeahead.input(value); },
    onChoose: showTitle,
    onSubmit: (value) => typeahead.submit(value),
    onRetry: (value) => typeahead.submit(value),
    onCancel: () => typeahead.cancel(),
    onCompositionStart: () => typeahead.compositionStart(),
    onCompositionEnd: (value) => typeahead.compositionEnd(value),
    onCheckKey: () => openSettings(),
  };
  const search = {
    // Empties the field and the suggestions.
    reset() {
      clearTitle();
      typeahead.cancel();
      draw({ status: 'idle', value: '' });
    },
  };

  // Poster URLs need the TMDB image configuration; without it posters show initials.
  function loadImageConfiguration() {
    if (imageRequested || !app.imageConfiguration) return;
    imageRequested = true;
    Promise.resolve(app.imageConfiguration()).then((configuration) => {
      imageConfiguration = configuration ?? null;
      draw();
    }, () => {});
  }

  function runLaunch() {
    const query = pendingLaunch;
    pendingLaunch = null;
    if (query === null) return;
    draw({ status: 'idle', value: query });
    typeahead.submit(query);
  }

  globalThis.addEventListener?.('online', () => draw());
  globalThis.addEventListener?.('offline', () => draw());

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
    if (view === 'search') {
      draw();
      loadImageConfiguration();
      // Before the focus moves into the field, which would keep the typed text instead of the prefill.
      runLaunch();
    }
    if (view === 'welcome') welcomeSlot.append(renderWelcome({ onOpenSettings: openSettings }));
    if (view === 'settings') {
      screen = renderSettings({
        settings,
        checkKey: app.checkKey,
        sources: app.sources,
        onCountryChange: () => titlePage?.refresh(),
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
          pendingLaunch = null;
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
