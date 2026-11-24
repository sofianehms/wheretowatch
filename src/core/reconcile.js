import { byKey } from '../data/services.js';
import { country, serviceKey as resolveServiceKey } from './normalize.js';

const sourceIds = ['tmdb', 'sa'];

/** Resolve offers from both current and previously cached snapshots. */
export function offerService(source, offer, map) {
  const prefix = `${source}:`;
  const registered = byKey(offer.serviceKey, map);
  const cachedId = offer.serviceKey.startsWith(prefix) ? offer.serviceKey.slice(prefix.length) : null;
  const id = offer.serviceId ?? (source === 'tmdb'
    ? registered?.tmdbProviderId ?? (cachedId === null ? null : Number(cachedId))
    : registered?.saServiceId ?? cachedId);
  const identity = resolveServiceKey(source, id, offer.serviceName, map);
  return {
    key: identity?.key ?? `${prefix}${cachedId ?? offer.serviceKey}`,
    name: offer.serviceName ?? identity?.name ?? registered?.name ?? offer.serviceKey,
    id,
  };
}

function readCoverage(entry) {
  if (entry?.status !== 'fresh' && entry?.status !== 'stale') return null;
  return new Set(entry.countries.map(country).filter(Boolean));
}

function collect({ snapshots, coverage, serviceMap, aliases }) {
  const snapshotsBySource = new Map(snapshots.map((snapshot) => [snapshot.source, snapshot]));
  const coveredCountries = new Set();
  const fetchedAt = { tmdb: null, sa: null };
  const sources = {};
  const services = new Map();
  // TMDB's watch-provider page is per country, whatever the service: kept before offers are split by service.
  const tmdbLinks = new Map();

  for (const id of sourceIds) {
    const snapshot = snapshotsBySource.get(id);
    const countries = readCoverage(coverage[id]);
    const recognizesTitle = snapshot?.status === 'offers' || snapshot?.status === 'empty';
    sources[id] = { countries, coverage: coverage[id] };
    fetchedAt[id] = snapshot?.fetchedAt ?? null;

    if (!recognizesTitle) continue;
    for (const code of countries ?? []) coveredCountries.add(code);

    for (const offer of snapshot.offers) {
      const linkCountry = country(offer.country);
      if (id === 'tmdb' && offer.link && linkCountry && !tmdbLinks.has(linkCountry)) tmdbLinks.set(linkCountry, offer.link);
      const identity = offerService(id, offer, serviceMap);
      const { name, id: serviceId } = identity;
      const key = aliases?.get(identity.key) ?? identity.key;
      if (!services.has(key)) {
        services.set(key, {
          service: { key, name, sourceIds: {} },
          byCountry: new Map(),
        });
      }
      const { service, byCountry } = services.get(key);
      service.sourceIds[id] = serviceId;
      if (offer.serviceLogoPath) service.serviceLogoPath ??= offer.serviceLogoPath;

      const code = country(offer.country);
      if (!countries || !code) continue;
      if (!byCountry.has(code)) byCountry.set(code, { tmdb: [], sa: [] });
      byCountry.get(code)[id].push(key === offer.serviceKey ? offer : { ...offer, serviceKey: key });
    }
  }

  return { coveredCountries, fetchedAt, sources, services, tmdbLinks };
}

function classify(code, offers, sources, sourceIds) {
  if (!Object.hasOwn(sourceIds, 'tmdb') || !Object.hasOwn(sourceIds, 'sa')) return 'single';
  if (offers.tmdb.length && offers.sa.length) return 'confirmed';

  const other = offers.tmdb.length ? sources.sa : sources.tmdb;
  if (offers.tmdb.length && other.countries && !other.countries.has(code)) return 'outsideSaCoverage';
  if (other.countries?.has(code)) return 'conflict';
  return 'single';
}

function types(offers) {
  return [...new Set(offers.map(({ offerType }) => offerType))];
}

function summarize(entry, { coveredCountries, fetchedAt, sources, tmdbLinks }) {
  let confirmedCount = 0;
  const countries = [];
  for (const [code, offers] of entry?.byCountry ?? []) {
    const state = classify(code, offers, sources, entry.service.sourceIds);
    if (state === 'confirmed') confirmedCount += 1;
    countries.push({
      country: code,
      state,
      offers,
      types: { tmdb: types(offers.tmdb), sa: types(offers.sa) },
      fetchedAt: { ...fetchedAt },
    });
  }
  const coverage = Object.fromEntries(sourceIds.map((id) => {
    const source = sources[id];
    return [id, {
      status: source.coverage?.status ?? 'unknown',
      countries: source.countries,
      fetchedAt: source.coverage?.fetchedAt ?? null,
    }];
  }));
  return { service: entry?.service ?? null, countries, coveredCountries: new Set(coveredCountries), confirmedCount, coverage, tmdbLinks: new Map(tmdbLinks) };
}

/**
 * Reconcile one service using normalized source snapshots.
 * Coverage is keyed by source ID. Fresh and stale entries carry a countries array,
 * and stale entries include the list's fetchedAt date. Rows carry snapshot dates.
 * Each row represents an available country. The populated offer arrays identify
 * which sources reported the service. Service metadata is retained even when
 * coverage is unknown and the result has no country rows.
 * `aliases` (optional Map) folds a source-specific service key into another one: the same service named alike by both sources.
 * @param {{aliases?: Map<string, string>, snapshots: import('../api/sources.js').SourceSnapshot[], coverage: Object<string, {status: 'fresh'|'stale'|'unknown', countries?: string[], fetchedAt?: string}>, serviceKey: string, serviceMap?: object}} options
 */
export function reconcile({ snapshots, coverage, serviceKey, serviceMap, aliases }) {
  const data = collect({ snapshots, coverage, serviceMap, aliases });
  return summarize(data.services.get(serviceKey), data);
}

/** Return a Map from reported service keys to their reconciliation results. */
export function reconcileAll({ snapshots, coverage, serviceMap, aliases }) {
  const data = collect({ snapshots, coverage, serviceMap, aliases });
  return new Map([...data.services].map(([key, entry]) => [key, summarize(entry, data)]));
}
