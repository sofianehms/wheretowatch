import { byKey } from '../data/services.js';
import { countryName, formatDate, formatNumber } from '../i18n/strings.js';
import { country } from './normalize.js';
import { offerService } from './reconcile.js';

const responds = ({ status }) => status !== 'unavailable';

function hasTechnicalError({ status, error }) {
  return status === 'unavailable' && Boolean(error) && error.type !== 'quota';
}

function homeVerdict(code, available, reconciled, snapshots, kind) {
  if (!code || kind === 'error') return null;
  const saCoverage = snapshots.some(({ source }) => source === 'sa') && reconciled.coverage.sa.countries;
  const saNotCovered = Boolean(saCoverage && !saCoverage.has(code));
  return {
    country: code,
    kind: available.has(code) ? 'available'
      : kind !== 'insufficient' && reconciled.coveredCountries.has(code) ? 'notFound'
      : 'insufficient',
    saNotCovered,
  };
}

/** Compute a service verdict from reconcile() and the same normalized snapshots. */
export function computeVerdict({ reconciled, snapshots, serviceKey, serviceMap, homeCountry, mediaType }) {
  const responses = snapshots.filter(responds);
  const perSourceNotes = snapshots.map(({ source, status, fetchedAt, stale, error }) => {
    const coverage = reconciled.coverage[source];
    return {
      source, status, fetchedAt, stale: Boolean(stale), errorType: error?.type,
      coverage: coverage.status, coverageFetchedAt: coverage.fetchedAt,
    };
  });
  const unknownCoverage = perSourceNotes.some((note) => responds(note) && note.coverage === 'unknown');
  const available = new Set(reconciled.countries.map((row) => row.country));
  const reportedOffers = responses.filter(({ status }) => status === 'offers');
  // Reconciliation omits unknown-coverage sources. Their positive offers still establish availability.
  for (const snapshot of reportedOffers) {
    if (reconciled.coverage[snapshot.source].status !== 'unknown') continue;
    for (const offer of snapshot.offers) {
      const code = country(offer.country);
      if (code && offerService(snapshot.source, offer, serviceMap).key === serviceKey) available.add(code);
    }
  }
  const kind = available.size > 0 ? 'available'
    : reportedOffers.length > 0 ? 'notFound'
    : snapshots.length > 0 && snapshots.every(hasTechnicalError) ? 'error'
    : 'insufficient';
  const fetchedAt = responses.reduce((latest, snapshot) =>
    latest === null || Date.parse(snapshot.fetchedAt) > Date.parse(latest) ? snapshot.fetchedAt : latest, null);

  return {
    kind,
    count: unknownCoverage || kind === 'error' ? null
      : kind === 'available' ? available.size : reconciled.coveredCountries.size,
    confirmedCount: reconciled.confirmedCount,
    sources: responses.map(({ source }) => source),
    fetchedAt,
    stale: responses.some(({ stale }) => stale === true),
    home: homeVerdict(country(homeCountry), available, reconciled, snapshots, kind),
    perSourceNotes,
    isSeries: mediaType === 'tv',
    service: reconciled.service?.name ?? byKey(serviceKey, serviceMap)?.name ?? serviceKey,
  };
}

function sourceText(note, source, t) {
  const sentences = [];
  if (note.status === 'unavailable') return sentences;
  if (note.status === 'notFound') sentences.push(t('verdict.source.notRecognized', { source }));
  if (note.coverage === 'unknown') sentences.push(t('verdict.source.coverageUnknown', { source }));
  if (note.coverage === 'stale' && note.status !== 'notFound') {
    sentences.push(t('verdict.source.coverageStale', {
      source, date: formatDate(new Date(note.coverageFetchedAt)),
    }));
  }
  const date = formatDate(new Date(note.fetchedAt));
  sentences.push(t(note.stale ? 'verdict.source.stale' : 'verdict.source.retrieved', { source, date }));
  return sentences;
}

/** Format a complete English verdict using the supplied translation lookup. */
export function verdictText(verdict, t) {
  const { kind, count, service, perSourceNotes, home } = verdict;
  if (kind === 'error') {
    const types = perSourceNotes.map(({ errorType }) => errorType);
    const action = types.includes('auth') ? 'checkKeys' : types.includes('offline') ? 'connect' : 'retry';
    return t('verdict.error.' + action);
  }

  const countryKey = count === 1 ? 'country' : 'countries';
  const covered = kind === 'notFound' ? 'covered.' : '';
  const countries = count === null ? null : t('verdict.' + covered + countryKey, { count: formatNumber(count) });
  const key = count === null && kind !== 'insufficient' ? kind + '.uncounted' : kind;
  const sentences = [t('verdict.' + key, { service, countries })];
  if (kind === 'available' && count !== null) {
    sentences.push(t('verdict.confirmed', { count: formatNumber(verdict.confirmedCount) }));
  }
  if (kind === 'notFound') sentences.push(t('verdict.limit', { service }));
  if (kind === 'insufficient') {
    if (count !== null) sentences.push(t('verdict.covered', { countries }));
    sentences.push(t('verdict.check'));
  }

  for (const note of perSourceNotes) {
    sentences.push(...sourceText(note, t('verdict.source.' + note.source), t));
  }
  if (verdict.fetchedAt === null) sentences.push(t('verdict.noRetrieval'));
  if (home) {
    const name = countryName(home.country.toUpperCase());
    sentences.push(t('verdict.home.' + home.kind, { country: name, service }));
    if (home.saNotCovered) sentences.push(t('verdict.home.saNotCovered'));
  }
  if (verdict.isSeries) sentences.push(t('verdict.series'));
  return sentences.join(' ');
}
