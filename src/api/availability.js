import { coverageKeys, titleKeys } from './sources.js';

const savedEntry = /^(?:tmdb\.providers|tmdb\.notFound|sa\.shows)\.((?:movie|tv)\/\d+)$/;

/**
 * @typedef {object} SavedTitle
 * @property {import('./sources.js').Title} title
 * @property {import('./sources.js').SourceSnapshot[]} snapshots
 * @property {Object<string, import('./sources.js').Coverage>} coverage
 * @property {string} fetchedAt Oldest retrieval date among the sources shown.
 */

function savedTmdb(ref, details, cache) {
  const providers = cache.getStale(titleKeys.providers(ref));
  const missing = cache.getStale(titleKeys.notFound(ref));
  const shared = { source: 'tmdb', coveredCountries: null, error: null, imdbId: details?.imdbId ?? null };
  if (providers && !(missing?.fetchedAt > providers.fetchedAt)) {
    const { offers, fetchedAt } = providers.value;
    return { ...shared, status: offers.length ? 'offers' : 'empty', offers, fetchedAt, stale: providers.stale };
  }
  return missing
    ? { ...shared, status: 'notFound', offers: [], fetchedAt: missing.value.fetchedAt, stale: missing.stale }
    : null;
}

function savedSa(ref, cache) {
  const entry = cache.getStale(titleKeys.sa(ref));
  return entry && entry.value.status !== 'unavailable' ? { ...entry.value, stale: entry.stale } : null;
}

/** Rebuild a viewed title from the cache, null when its name or all of its availability data is gone. */
export async function readSavedTitle({ ref, selected, cache, now }) {
  const details = cache.getStale(titleKeys.details(ref))?.value
    ?? cache.getStale(titleKeys.notFound(ref))?.value.details;
  if (!details?.title?.title) return null;
  const found = selected.map((source) => ({
    source,
    snapshot: source.id === 'sa' ? savedSa(ref, cache) : savedTmdb(ref, details, cache),
  })).filter(({ snapshot }) => snapshot);
  if (found.length === 0) return null;
  const loaded = await assembleAvailability({
    selected: found.map(({ source }) => source), snapshots: found.map(({ snapshot }) => snapshot),
    cache, now, refresh: false,
  });
  const fetchedAt = loaded.snapshots.map((snapshot) => snapshot.fetchedAt).sort()[0];
  return { title: { ...details.title, ref }, snapshots: loaded.snapshots, coverage: loaded.coverage, fetchedAt };
}

export async function listSavedTitles({ selected, cache, now }) {
  const refs = new Set(cache.keys().map((key) => savedEntry.exec(key)?.[1]).filter(Boolean));
  const saved = await Promise.all([...refs].map((ref) => readSavedTitle({ ref, selected, cache, now })));
  return saved.filter(Boolean).sort((first, second) => second.fetchedAt.localeCompare(first.fetchedAt));
}

export async function assembleAvailability({ selected, snapshots, signal, cache, now, refresh = true }) {
  async function readCoverage(source, canRefresh) {
    const key = coverageKeys[source.id];
    const cached = cache.get(key);
    if (cached) return {
      status: 'fresh', countries: cached.value, fetchedAt: new Date(cached.fetchedAt).toISOString(),
    };
    try {
      if (refresh && canRefresh && !signal?.aborted) {
        const countries = await source.listCoveredCountries({ signal });
        const refreshed = cache.get(key);
        const fetchedAt = refreshed?.fetchedAt ?? now();
        if (!refreshed) cache.set(key, countries, { kind: 'metadata', source: source.id });
        return { status: 'fresh', countries, fetchedAt: new Date(fetchedAt).toISOString() };
      }
    } catch {
      // A failed refresh can still use the last list read from this provider.
    }
    const last = cache.getStale(key);
    return last
      ? { status: last.stale ? 'stale' : 'fresh', countries: last.value, fetchedAt: new Date(last.fetchedAt).toISOString() }
      : { status: 'unknown' };
  }

  const tmdb = snapshots.find(({ source }) => source === 'tmdb');
  const sa = snapshots.find(({ source }) => source === 'sa');
  const imdbId = tmdb?.imdbId === undefined ? tmdb?.title?.imdbId : tmdb.imdbId;
  const mismatch = sa?.status !== 'unavailable' && imdbId && sa?.imdbId && imdbId !== sa.imdbId;
  const usesSa = sa && !mismatch && (sa.status === 'offers' || sa.status === 'empty');
  const reason = sa?.reason === 'quota' || sa?.error?.type === 'quota' ? 'quota'
    : tmdb?.stale || tmdb?.status === 'unavailable' || (sa && (!usesSa || sa.reason === 'error')) ? 'error'
    : sa ? null : 'noKey';
  const coverage = Object.fromEntries(await Promise.all(selected.map(async (source) =>
    [source.id, await readCoverage(source, source.id === 'sa' ? usesSa : tmdb?.status !== 'unavailable')])));

  return {
    mode: usesSa ? 'full' : 'tmdbOnly',
    reason,
    coverage,
    snapshots: snapshots.map((snapshot) => {
      const list = coverage[snapshot.source];
      const coveredCountries = list.countries ? new Set(list.countries).size : null;
      if (snapshot === sa && mismatch) {
        return { ...snapshot, status: 'notFound', offers: [], error: null, coveredCountries };
      }
      return { ...snapshot, coveredCountries };
    }),
  };
}
