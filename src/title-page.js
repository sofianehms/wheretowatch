// The title page of the chosen search result: loads both sources, reconciles them and renders the verdict.
import { HttpError } from './api/http.js';
import { reconcile } from './core/reconcile.js';
import { computeVerdict } from './core/verdict.js';
import { DEFAULT_SERVICE } from './data/services.js';
import { t } from './i18n/strings.js';
import { servicesState } from './render/service-picker.js';
import { renderTitle } from './render/title.js';

/**
 * @param {{app: ReturnType<typeof import('./compose.js').compose>, slot: HTMLElement, root: ParentNode,
 *   imageConfiguration: () => object|null, onCheckKeys: () => void, onSources?: (snapshots: object[]|null) => void}} options
 */
export function createTitlePage({ app, slot, root, imageConfiguration, onCheckKeys, onSources = () => {} }) {
  const doc = root.ownerDocument ?? root;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./styles/title.css', import.meta.url).href;
  doc.head?.append(link);

  let run = null;
  // What the page shows, kept so a changed preference redraws without a new request.
  let shown = null;

  function present() {
    const { title, snapshots, coverage, retry } = shown;
    // Everything below comes from the data already loaded: changing the service never makes a request.
    const homeCountry = app.settings.getPref('country');
    const services = servicesState({ snapshots, coverage }, app.settings.getPref('service'), homeCountry);
    // "All services" still reads the sources' state through the default service's verdict.
    const serviceKey = services.all ? DEFAULT_SERVICE : services.selected;
    const reconciled = reconcile({ snapshots, coverage, serviceKey, aliases: services.aliases });
    const verdict = computeVerdict({ reconciled, snapshots, serviceKey, aliases: services.aliases, homeCountry, mediaType: title.mediaType });
    renderTitle(slot, { status: 'result', title, verdict, reconciled, imageConfiguration: imageConfiguration(), services }, {
      onRetry: retry, onCheckKeys, onServiceChange: changeService,
    });
  }

  function changeService(key) {
    app.settings.setPref('service', key);
    present();
    // The page is redrawn: keep the keyboard where the user was.
    slot.querySelector('.service-pick select')?.focus();
  }

  function clear() {
    run?.abort();
    run = null;
    shown = null;
    slot.replaceChildren();
    onSources(null);
  }

  async function show(title, ref = null) {
    run?.abort();
    shown = null;
    onSources(null);
    const current = new AbortController();
    run = current;
    const renderLoading = (status) => renderTitle(slot, { status, title, imageConfiguration: imageConfiguration() });
    const retry = () => ref === null ? show(title) : showReference(ref);
    let resolving = ref !== null;
    let loaded;
    try {
      if (ref !== null) {
        renderLoading('details');
        title = await app.getTitle(ref, { signal: current.signal });
        if (current.signal.aborted) return;
        resolving = false;
      }
      renderLoading('loading');
      loaded = await app.sources.loadAvailability(title, { signal: current.signal });
    } catch (error) {
      if (current.signal.aborted) return;
      if (resolving && error?.type === 'notFound') {
        renderLoading('missing');
        return;
      }
      // A failed load shows the same error verdict as unreachable sources.
      const failure = error instanceof HttpError ? error : new HttpError('network');
      const fetchedAt = new Date().toISOString();
      loaded = {
        snapshots: ['tmdb', 'sa'].map((source) => ({ source, status: 'unavailable', fetchedAt, coveredCountries: null, offers: [], error: failure })),
        coverage: { tmdb: { status: 'unknown' }, sa: { status: 'unknown' } },
      };
    }
    if (current.signal.aborted) return;
    shown = { title, snapshots: loaded.snapshots, coverage: loaded.coverage, retry };
    present();
    onSources(loaded.snapshots);
  }

  function showReference(ref) {
    const [mediaType] = ref.split('/');
    return show({ mediaType, title: t('title.direct.heading') }, ref);
  }

  /** Recompute the verdict after a preference changed (reference country). */
  function refresh() {
    if (shown) present();
  }

  return { show, showReference, clear, refresh };
}
