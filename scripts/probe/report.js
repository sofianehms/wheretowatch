import {
  compareQuota, extractShape, maskKeys, proposeMappings, saServices, tmdbServices,
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

export function renderReport({ tmdb, sa, origin, keys }) {
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
