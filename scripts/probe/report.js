import {
  compareQuota, extractShape, languagePresence, languageRates, maskKeys, offerCoverage,
  proposeMappings, quotaDeltas, saServices, tmdbServices,
} from './analysis.js';

const status = (observed) => observed ? 'observed' : 'not observed';
const quote = (value) => JSON.stringify(value) ?? 'not observed';
const lines = (items) => items.length ? items.map((item) => '    ' + item).join('\n') : 'not observed';

function endpoint(result, dictionaries) {
  const fields = result.body === undefined ? [] : extractShape(result.body, dictionaries);
  const headers = Object.entries(result.headers ?? {}).map(([name, value]) => name + ': ' + quote(value));
  return [
    '#### ' + result.label,
    '',
    '- Response: ' + (result.status ?? 'not observed'),
    '- Anomaly: ' + (result.anomaly ?? 'none'),
    'Headers:',
    '',
    lines(headers),
    '',
    'Shape: ' + status(fields.length),
    '',
    lines(fields),
    '',
  ];
}

function listServices(services) {
  return lines(services.map(({ id, name }) => quote(id) + ' — ' + quote(name)));
}

function rateRow(label, observations) {
  const { total, audio, subtitles, closedCaptions } = languageRates(observations);
  const rate = (count) => total ? count + '/' + total + ' (' + (100 * count / total).toFixed(1) + '%)' : 'n/a';
  return '| ' + [label, rate(audio), rate(subtitles), rate(closedCaptions)].join(' | ') + ' |';
}

function languageReport({ region, sampleSize, selected, discovery, titles }) {
  const sample = titles.map((title) => {
    const options = title.body?.streamingOptions;
    const usable = title.status === 200 && options && typeof options === 'object' && !Array.isArray(options);
    return { ...title, usable, observations: usable ? languagePresence(title.body) : [] };
  });
  const usableCount = sample.filter(({ usable }) => usable).length;
  const contributingCount = sample.filter(({ observations }) => observations.length).length;
  const measurement = usableCount < sampleSize ? 'Incomplete'
    : contributingCount === 0 ? 'Inconclusive (no Netflix offers observed)' : 'Complete';
  const observations = sample.flatMap((title) => title.observations);
  const countries = [...new Set(observations.map(({ country }) => country))].sort();
  return [
    '## V-05 — Netflix language fill rates',
    '',
    '- Discovery region: ' + region,
    '- Distinct movies selected: ' + selected + '/' + sampleSize,
    '- Streaming Availability requests sent: ' + titles.length + '/' + sampleSize,
    '- Show responses with a streaming options map: ' + usableCount + '/' + sampleSize,
    '- Last discovery response: ' + (discovery?.status ?? 'not observed') + ' (' + (discovery?.anomaly ?? 'no anomaly') + ')',
    ...(selected < sampleSize ? ['- No show requests sent because discovery did not fill the sample.'] : []),
    '',
    'Each observed movie-country pair with a Netflix offer counts once. A field is present if any Netflix offer ' +
      'in that pair lists a language for it. Closed captions require a subtitle language marked as closed captions.',
    '',
    '### FR-009 — Observed overall and country fill rates',
    '',
    '- Measurement status: ' + measurement,
    '- Titles contributing to the observed rates: ' + contributingCount + '/' + sampleSize,
    '',
    '| Scope | Audio languages | Subtitles | Closed captions |',
    '| --- | --- | --- | --- |',
    rateRow('Overall', observations),
    ...countries.map((country) => rateRow(country.toUpperCase(), observations.filter((entry) => entry.country === country))),
    '',
    '### Per-title and per-country observations',
    '',
    '| TMDB movie / country | Audio languages | Subtitles | Closed captions |',
    '| --- | --- | --- | --- |',
    ...sample.flatMap(({ id, status, anomaly, observations }) => [
      rateRow(id + ' (HTTP ' + (status ?? 'unavailable') + (anomaly ? ', ' + anomaly : '') + ')', observations),
      ...observations.map((entry) => rateRow(id + ' / ' + entry.country.toUpperCase(), [entry])),
    ]),
    '',
  ];
}

function titleSearchReport(search, { after, countries }, region) {
  const coverage = Array.isArray(search.body) ? offerCoverage(search.body) : undefined;
  const reference = countries.status === 200 ? Object.keys(countries.body ?? {})
    .filter((code) => /^[a-z]{2}$/.test(code)) : [];
  const allOffers = coverage?.length && reference.length
    ? coverage.filter(({ offers }) => reference.every((code) => offers.includes(code))).length + '/' + coverage.length
    : 'not observed';
  const cost = after.status === 200 && search.status === 200 ? quotaDeltas(after.headers, search.headers) : [];
  return [
    '## V-18 — Streaming Availability title search',
    '',
    '- Query: Fight Club (country: ' + region + ')',
    '- Streaming Availability requests sent: 1',
    '- Results: ' + (coverage?.length ?? 'not observed'),
    '- Countries present: ' + ([...new Set(coverage?.flatMap((entry) => entry.countries))].sort().join(', ') || 'none observed'),
    '- Results with offers in every country returned by /countries: ' + allOffers,
    '',
    ...coverage?.map(({ countries, offers }, index) => '- Result ' + (index + 1) + ': country keys ' +
      (countries.join(', ') || 'none') + '; nonempty offers ' + (offers.join(', ') || 'none')) ?? [],
    '',
    'Observed quota cost is the remaining-counter drop from the preceding show response. ' +
      'Counter resets and concurrent usage can affect the estimate.',
    '',
    lines(cost.map(({ name, cost }) => name + ': ' + cost)),
    '',
    ...endpoint(search, ['$[]["streamingOptions"]']),
  ];
}

export function renderReport({ tmdb, sa, v05, v18, region, origin, keys }) {
  const { searches, preflight, watch, regions, configuration, movie, tv } = tmdb;
  const { before, countries, after } = sa;
  const movieServices = tmdbServices(movie.body);
  const tvServices = tmdbServices(tv.body);
  const streamingServices = saServices(countries.body);
  const regionCount = Array.isArray(regions.body?.results) ? regions.body.results.length : undefined;
  const availability = Object.values(watch.body?.results ?? {});
  const sizes = Object.entries(configuration.body?.images ?? {})
    .filter(([name, values]) => name.endsWith('_sizes') && Array.isArray(values))
    .map(([name, values]) => quote(name) + ': ' + quote(values.filter((value) => typeof value === 'string')));
  const quota = [before, countries, after].every(({ status }) => status === 200)
    ? compareQuota(before.headers, countries.headers, after.headers) : [];

  return maskKeys([
    '# API probe',
    '',
    'Request origin: ' + quote(origin),
    '',
    '## V-01 — TMDB',
    '',
    'Status: ' + status([watch, regions, configuration, movie, tv, ...searches].some(({ body }) => body !== undefined)),
    '',
    '- Netflix with provider ID 8 in movie catalog: ' +
      status(movieServices.some(({ id, name }) => id === 8 && name.toLowerCase() === 'netflix')),
    ...['ads', 'free'].map((type) => '- ' + type + ' key in TV availability: ' +
      status(availability.some((entry) => entry && Object.hasOwn(entry, type)))),
    '- Region count: ' + quote(regionCount),
    '- Configuration image sizes:',
    '',
    lines(sizes),
    '',
    'People in the first page of each short-query search:',
    '',
    ...searches.map(({ label, body }) => {
      const results = body?.results;
      if (!Array.isArray(results) || !results.length) return '- ' + label + ': not observed (no results to measure)';
      const count = results.filter((entry) => entry?.media_type === 'person').length;
      const share = (100 * count / results.length).toFixed(1);
      return '- ' + label + ': ' + count + '/' + results.length + ' (' + share + '%)';
    }),
    '',
    ...endpoint(preflight),
    ...searches.flatMap((search) => endpoint(search)),
    ...endpoint(watch, ['$["results"]']),
    ...[regions, configuration, movie, tv].flatMap((entry) => endpoint(entry, ['$["results"][]["display_priorities"]'])),
    '## V-02 — Streaming Availability',
    '',
    'Status: ' + status([before, countries, after].some(({ body }) => body !== undefined)),
    '',
    ...endpoint(before, ['$["streamingOptions"]']),
    ...endpoint(countries, ['$']),
    ...endpoint(after, ['$["streamingOptions"]']),
    '#### Countries quota estimate',
    '',
    'Remaining counters are compared across two requests for the same movie with a countries request between them. ' +
      'The estimate subtracts one assumed unit for the second movie request. ' +
      'When the countries response has the same counter, its immediate delta must agree. ' +
      'Counter resets and concurrent usage can affect the estimate.',
    '',
    lines(quota.map(({ name, bracketDelta, countriesDelta, estimate }) =>
      name + ': bracket delta ' + bracketDelta + ', countries response delta ' + quote(countriesDelta) +
      ', estimated countries cost ' + quote(estimate))),
    '',
    ...(v05 ? languageReport(v05) : ['## V-05 — Netflix language fill rates', '', 'Status: not requested', '']),
    ...(v18 ? titleSearchReport(v18, sa, region) : ['## V-18 — Streaming Availability title search', '', 'Status: not requested', '']),
    '## Service identifiers',
    '',
    'Status: ' + status(movieServices.length + tvServices.length + streamingServices.length),
    '',
    '### TMDB movie (provider_id, provider_name)',
    '',
    listServices(movieServices),
    '',
    '### TMDB TV (provider_id, provider_name)',
    '',
    listServices(tvServices),
    '',
    '### Streaming Availability countries (identifier, name)',
    '',
    listServices(streamingServices),
    '',
    '### Mapping proposal — to be confirmed',
    '',
    ...proposeMappings(movieServices, tvServices, streamingServices).flatMap(({ name, movie, tv, sa }) => [
      '#### ' + name,
      '',
      ...[['TMDB movie', movie], ['TMDB TV', tv], ['Streaming Availability', sa]].flatMap(([source, matches]) =>
        [source + ':', '', listServices(matches), '']),
    ]),
  ].join('\n'), keys.flatMap((key) => [key, quote(key).slice(1, -1)]));
}
