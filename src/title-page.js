// The title page of the chosen search result: loads both sources, reconciles them and renders the verdict.
import { HttpError } from './api/http.js';
import { reconcile } from './core/reconcile.js';
import { computeVerdict } from './core/verdict.js';
import { DEFAULT_SERVICE } from './data/services.js';
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

  function clear() {
    run?.abort();
    run = null;
    slot.replaceChildren();
  }

  async function show(title) {
    run?.abort();
    const current = new AbortController();
    run = current;
    renderTitle(slot, { status: 'loading', title, imageConfiguration: imageConfiguration() }, {});
    let loaded;
    try {
      loaded = await app.sources.loadAvailability(title, { signal: current.signal });
    } catch (error) {
      // A failed load shows the same error verdict as unreachable sources.
      const failure = error instanceof HttpError ? error : new HttpError('network');
      const fetchedAt = new Date().toISOString();
      loaded = {
        snapshots: ['tmdb', 'sa'].map((source) => ({ source, status: 'unavailable', fetchedAt, coveredCountries: null, offers: [], error: failure })),
        coverage: { tmdb: { status: 'unknown' }, sa: { status: 'unknown' } },
      };
    }
    if (current.signal.aborted) return;
    const { snapshots, coverage } = loaded;
    const serviceKey = DEFAULT_SERVICE;
    const reconciled = reconcile({ snapshots, coverage, serviceKey });
    const verdict = computeVerdict({ reconciled, snapshots, serviceKey, homeCountry: null, mediaType: title.mediaType });
    renderTitle(slot, { status: 'result', title, verdict, reconciled, imageConfiguration: imageConfiguration() }, {
      onRetry: () => show(title), onCheckKeys,
    });
  }

  return { show, clear };
}
