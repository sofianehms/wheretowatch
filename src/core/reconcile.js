import { country } from './normalize.js';

const sourceIds = ['tmdb', 'sa'];

function readCoverage(entry) {
  if (entry?.status !== 'fresh' && entry?.status !== 'stale') return null;
  return new Set(entry.countries.map(country).filter(Boolean));
}

function collect({ snapshots, coverage }) {
  const snapshotsBySource = new Map(snapshots.map((snapshot) => [snapshot.source, snapshot]));
  const coveredCountries = new Set();
  const fetchedAt = { tmdb: null, sa: null };
  const sources = {};
  const services = new Map();

  for (const id of sourceIds) {
    const snapshot = snapshotsBySource.get(id);
    const countries = readCoverage(coverage[id]);
    const recognizesTitle = snapshot?.status === 'offers' || snapshot?.status === 'empty';
    sources[id] = { countries, recognizesTitle };
    fetchedAt[id] = snapshot?.fetchedAt ?? null;

    if (!countries || !recognizesTitle) continue;
    for (const code of countries) coveredCountries.add(code);

    for (const offer of snapshot.offers) {
      const code = country(offer.country);
      if (!code) continue;
      if (!services.has(offer.serviceKey)) services.set(offer.serviceKey, new Map());
      const byCountry = services.get(offer.serviceKey);
      if (!byCountry.has(code)) byCountry.set(code, { tmdb: [], sa: [] });
      byCountry.get(code)[id].push(offer);
    }
  }

  return { coveredCountries, fetchedAt, sources, services };
}

function classify(code, offers, sources) {
  if (offers.tmdb.length && offers.sa.length) return 'confirmed';

  const other = offers.tmdb.length ? sources.sa : sources.tmdb;
  if (offers.tmdb.length && other.countries && !other.countries.has(code)) return 'outsideSaCoverage';
  if (other.recognizesTitle && other.countries?.has(code)) return 'conflict';
  return 'single';
}

function types(offers) {
  return [...new Set(offers.map(({ offerType }) => offerType))];
}

function summarize(byCountry, { coveredCountries, fetchedAt, sources }) {
  let confirmedCount = 0;
  const countries = [];
  for (const [code, offers] of byCountry ?? []) {
    const state = classify(code, offers, sources);
    if (state === 'confirmed') confirmedCount += 1;
    countries.push({
      country: code,
      state,
      offers,
      types: { tmdb: types(offers.tmdb), sa: types(offers.sa) },
      fetchedAt: { ...fetchedAt },
    });
  }
  return { countries, coveredCountries: new Set(coveredCountries), confirmedCount };
}

/**
 * Reconcile one service using normalized source snapshots.
 * Coverage is keyed by source ID. Fresh and stale entries carry a countries array,
 * and stale entries include the list's fetchedAt date. Rows carry snapshot dates.
 * Each row represents an available country. The populated offer arrays identify
 * which sources reported the service.
 * @param {{snapshots: import('../api/sources.js').SourceSnapshot[], coverage: Object<string, {status: 'fresh'|'stale'|'unknown', countries?: string[], fetchedAt?: string}>, serviceKey: string}} options
 */
export function reconcile({ snapshots, coverage, serviceKey }) {
  const data = collect({ snapshots, coverage });
  return summarize(data.services.get(serviceKey), data);
}

/** Return a Map from reported service keys to their reconciliation results. */
export function reconcileAll({ snapshots, coverage }) {
  const data = collect({ snapshots, coverage });
  return new Map([...data.services].map(([key, countries]) => [key, summarize(countries, data)]));
}
