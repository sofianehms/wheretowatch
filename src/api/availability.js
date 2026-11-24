import { coverageKeys } from './sources.js';

export async function assembleAvailability({ selected, snapshots, signal, cache, now }) {
  async function readCoverage(source, canRefresh) {
    const key = coverageKeys[source.id];
    const cached = cache.get(key);
    if (cached) return {
      status: 'fresh', countries: cached.value, fetchedAt: new Date(cached.fetchedAt).toISOString(),
    };
    try {
      if (canRefresh && !signal?.aborted) {
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
