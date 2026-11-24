// The title page of the chosen search result: loads both sources, reconciles them and renders the verdict.
import { HttpError } from './api/http.js';
import { reconcile } from './core/reconcile.js';
import { computeVerdict } from './core/verdict.js';
import { DEFAULT_SERVICE } from './data/services.js';
import { t } from './i18n/strings.js';
import { renderTitle } from './render/title.js';

/**
 * @param {{app: ReturnType<typeof import('./compose.js').compose>, slot: HTMLElement, root: ParentNode,
 *   imageConfiguration: () => object|null, onCheckKeys: () => void}} options
 */
export function createTitlePage({ app, slot, root, imageConfiguration, onCheckKeys }) {
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
    const serviceKey = app.settings.getPref('service') ?? DEFAULT_SERVICE;
    const reconciled = reconcile({ snapshots, coverage, serviceKey });
    const homeCountry = app.settings.getPref('country');
    const verdict = computeVerdict({ reconciled, snapshots, serviceKey, homeCountry, mediaType: title.mediaType });
    renderTitle(slot, { status: 'result', title, verdict, reconciled, imageConfiguration: imageConfiguration() }, {
      onRetry: retry, onCheckKeys,
    });
  }

  function clear() {
    run?.abort();
    run = null;
    shown = null;
    slot.replaceChildren();
  }

  async function show(title, ref = null) {
    run?.abort();
    shown = null;
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
