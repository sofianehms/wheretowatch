// Application shell: wires the services to the welcome, the search and the Settings screens.
import { createTypeahead } from './core/typeahead.js';
import { DEGRADATION_TYPES, degradationBanners, offlineBanner, renderBanners, tmdbOnlyBanner } from './render/banners.js';
import { renderHeader } from './render/header.js';
import { render as renderSearch } from './render/search.js';
import { renderSettings } from './render/settings.js';
import { renderWelcome } from './render/welcome.js';
import { applyTheme } from './theme.js';

/**
 * Show the right screen for the stored keys and the navigation state.
 * @param {ReturnType<typeof import('./compose.js').compose>} app The composed services.
 * @param {ParentNode} root Where the screen slots (`#header`, `#welcome`, `#settings`, `#search-view`, `#search`) live.
 * @param {{launchQuery?: string | null, launchTitle?: string | null, onTitleLaunchComplete?: () => void, online?: boolean,
 *   onUnsavedChange?: (unsaved: boolean) => void}} [options]
 *   A title link or query runs when the search screen first becomes available.
 *   `onUnsavedChange` follows whether the screen holds edits that a reload would lose.
 * @returns {{setOnline: (online: boolean) => void}} Called when the network is lost or comes back.
 */
export function startApp(app, root = document, {
  launchQuery = null, launchTitle = null, onTitleLaunchComplete, online = globalThis.navigator?.onLine !== false,
  onUnsavedChange,
} = {}) {
  const { store, settings } = app;

  const headerSlot = root.querySelector('#header');
  const searchView = root.querySelector('#search-view');
  const welcomeSlot = root.querySelector('#welcome');
  const settingsSlot = root.querySelector('#settings');

  const searchSlot = root.querySelector('#search');
  const bannersSlot = root.querySelector('#banners');
  const titleSlot = root.querySelector('#title') ?? searchView.appendChild(Object.assign((root.ownerDocument ?? root).createElement('div'), { id: 'title' }));

  const offlineSlot = root.querySelector('#offline')
    ?? (titleSlot.before((root.ownerDocument ?? root).createElement('div')), Object.assign(titleSlot.previousSibling, { id: 'offline' }));

  let connected = online;
  let searchState = { status: 'idle' };
  let imageConfiguration = null;
  let imageRequested = false;
  let pendingLaunch = launchQuery;
  let pendingRef = launchTitle;

  const noSearch = async () => ({ titles: [] });

  function draw(next = searchState) {
    searchState = next;
    const input = renderSearch(searchSlot, { ...next, online: connected, imageConfiguration }, handlers).input;
    input.dataset.focusTarget = '';
  }

  // The title page needs the network: its code and styles load on the first choice, outside the offline shell.
  let titlePage = null;
  let pendingTitle = null;
  // The answers of the title on screen, which the failure banners describe. Only the title page sets them:
  // a key tested, saved or removed leaves the result, and so its notice, until a new answer replaces it.
  let titleSources = null;
  const clearTitle = () => {
    const open = pendingTitle !== null;
    pendingTitle = null;
    titlePage?.clear();
    if (!titlePage) titleSlot.replaceChildren();
    if (open) syncOffline();
  };

  // Without a network: the viewed titles, or the way back to them while one is open.
  let offlineView = null;
  let offlineRun = 0;
  const loadOfflineView = async () => { offlineView ??= await import('./offline-view.js'); };
  async function syncOffline() {
    const run = ++offlineRun;
    if (connected || shown !== 'search') {
      offlineSlot.replaceChildren();
      return;
    }
    try {
      if (!offlineView) await loadOfflineView();
      const entries = pendingTitle === null ? await app.sources?.listCachedTitles?.() ?? [] : null;
      if (run !== offlineRun) return;
      offlineView.renderOffline(offlineSlot, {
        entries,
        settings: app.settings,
        onChoose: (title) => {
          // The user moved on: a query still waiting for the network must not open over this title.
          pendingLaunch = null;
          showTitle(title);
          offlineSlot.querySelector('button')?.focus();
        },
        onBack: async () => {
          const ref = pendingTitle?.ref ?? pendingTitle;
          clearTitle();
          await syncOffline();
          offlineView.focusEntry(offlineSlot, ref);
        },
      });
    } catch {
      // The banner already says the app is offline.
    }
  }
  function showTitle(title) {
    pendingTitle = title;
    // Fetched while the network is there: on a very first visit the worker does not serve this page yet.
    if (connected) loadOfflineView().catch(() => {});
    // Draws the way back before returning (once the view is loaded), so that it can take the focus.
    syncOffline();
    return import('./title-page.js').then(({ createTitlePage }) => {
      titlePage ??= createTitlePage({
        app, slot: titleSlot, root, onCheckKeys: () => openSettings(), isOnline: () => connected,
        // No picture is requested without a network: posters and logos fall back to initials and names.
        imageConfiguration: () => (connected ? imageConfiguration : null),
        onSources: (snapshots) => { titleSources = snapshots; syncDegradation(); },
      });
      if (pendingTitle !== title) return;
      return typeof title === 'string' ? titlePage.showReference(title) : titlePage.show(title);
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
    if (!connected || imageRequested || !app.imageConfiguration) return;
    imageRequested = true;
    // A request that failed, with the network for instance, is made again at the next occasion.
    Promise.resolve(app.imageConfiguration()).then((configuration) => {
      imageConfiguration = configuration ?? null;
      imageRequested = imageConfiguration !== null;
      draw();
    }, () => { imageRequested = false; });
  }

  function runLaunch() {
    if (pendingRef !== null) {
      const ref = pendingRef;
      pendingRef = null;
      pendingLaunch = null;
      showTitle(ref).finally(onTitleLaunchComplete);
      return;
    }
    // A query waits for the network: searched without it, it would only leave an error behind.
    if (!connected) return;
    const query = pendingLaunch;
    pendingLaunch = null;
    if (query === null) return;
    draw({ status: 'idle', value: query });
    typeahead.submit(query);
  }

  function setOnline(next) {
    connected = next;
    syncBanners();
    // Search work belongs to the connection it started on.
    if (!next) typeahead.stop();
    draw();
    // A title still loading starts over on the new connection (from the saved data when it is lost).
    // Back online, so does one that was not saved or that the network failed.
    if (pendingTitle !== null && (titlePage?.isLoading() || (next && (titlePage?.isUnsaved() || titlePage?.isCutOff())))) showTitle(pendingTitle);
    else syncOffline();
    if (next && shown === 'search') {
      loadImageConfiguration();
      runLaunch();
    }
  }

  const openSettings = () => {
    firstRun = !settings.hasKey('tmdb');
    syncBanners();
    store.set({ settingsOpen: true });
  };
  const closeSettings = () => {
    syncBanners();
    store.set({ settingsOpen: false });
  };

  let shown = null;
  let screen = null;
  let firstRun = false;

  function currentView({ settingsOpen }) {
    if (settingsOpen) return 'settings';
    return settings.hasKey('tmdb') ? 'search' : 'welcome';
  }

  // The second source decides the mode: with a TMDB key alone, languages are unavailable and the page says so.
  function syncBanners() {
    syncMode();
    syncDegradation();
  }

  // Quota and source failures. The list is replaced only when it changes, so focus survives.
  function syncDegradation() {
    const quota = settings.hasKey('sa') ? app.quota?.status() ?? null : null;
    // Offline, one banner says it all: neither the quota nor a refresh can be acted on.
    const next = connected && settings.hasKey('tmdb') ? degradationBanners({ quota, snapshots: titleSources }) : [];
    const { banners } = store.get();
    const current = banners.filter(({ type }) => DEGRADATION_TYPES.has(type));
    if (JSON.stringify(current) === JSON.stringify(next)) return;
    store.set({ banners: [...next, ...banners.filter(({ type }) => !DEGRADATION_TYPES.has(type))] });
  }

  function syncMode() {
    const mode = !connected ? 'offline' : !settings.hasKey('tmdb') ? 'noKey' : settings.hasKey('sa') ? 'full' : 'tmdbOnly';
    const { mode: previous, banners } = store.get();
    // The store starts in the offline mode, before any banner is there.
    if (previous === mode && (mode !== 'offline' || banners.some(({ type }) => type === 'offline'))) return;
    // Only these entries follow the mode; other notices are left alone.
    const others = banners.filter(({ type }) => type !== 'tmdbOnly' && type !== 'offline');
    const own = mode === 'tmdbOnly' ? [tmdbOnlyBanner()] : mode === 'offline' ? [offlineBanner()] : [];
    store.set({ mode, banners: [...own, ...others] });
  }

  function render(state) {
    if (bannersSlot) renderBanners(bannersSlot, state.banners, {
      onAction: (name) => { if (name === 'settings') openSettings(); },
      onDismiss: (banner) => store.set({ banners: store.get().banners.filter((entry) => entry !== banner && entry.type !== banner.type) }),
    });
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
        quotaStatus: app.quota?.status,
        cacheStats: app.cache?.stats,
        durable: app.durable,
        onUnsavedChange,
        // The first saved key ends the first run: go back to search.
        onChange: () => {
          // An unverified key stays on screen so the user can read the outcome and test again.
          // Nor does the screen close while the other key is still being checked (leaving would cancel that save)
          // or while the erasure confirmation waits for the user's decision.
          syncBanners();
          if (firstRun && settings.hasKey('tmdb') && !settings.isUnverified('tmdb') && !screen.pending() && !screen.confirming()) closeSettings();
        },
        onCleared: () => {
          // Erasure also forgets the query typed before, so the next key starts from a blank search.
          pendingLaunch = null;
          if (pendingRef !== null) onTitleLaunchComplete?.();
          pendingRef = null;
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
    syncOffline();
  }

  syncBanners();
  store.subscribe(render);
  render(store.get());
  return { setOnline };
}
