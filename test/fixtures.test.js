import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const fixtures = new URL('./fixtures/', import.meta.url);
const sensitivePatterns = [
  [/\beyJ[\w.-]*/, 'JWT prefix'],
  [/[a-f0-9]{32}/i, '32-character hexadecimal sequence'],
  [/\bapi_key\b/i, 'API key field'],
];

for (const source of ['tmdb', 'sa']) {
  const directory = new URL(source + '/', fixtures);
  const files = readdirSync(directory).filter((file) => file.endsWith('.js')).sort();
  assert.ok(files.length > 0, `No fixtures found for ${source}`);

  for (const file of files) {
    test(`loads ${source}/${file} without credential-like content`, async () => {
      const url = new URL(file, directory);
      const content = readFileSync(url, 'utf8');
      for (const [pattern, label] of sensitivePatterns) {
        assert.ok(!pattern.test(content), `Fixture source contains a ${label}`);
      }

      const fixture = await import(url);
      const { default: data } = fixture;
      const isDetailFixture = source === 'tmdb' && ['movie-details.js', 'series-details.js'].includes(file);
      const date = isDetailFixture ? '2026-11-21' : '22/11/2026';
      assert.ok(content.includes('Reference date: ' + date + '.'));
      assert.ok(data && typeof data === 'object', 'Expected a default response object');
      const payload = JSON.stringify(fixture);
      for (const [pattern, label] of sensitivePatterns) {
        assert.ok(!pattern.test(payload), `Fixture data contains a ${label}`);
      }
    });
  }
}

test('disagreement fixtures describe the same title in a country covered by both sources', async () => {
  const { default: tmdb } = await import('./fixtures/tmdb/disagreement.js');
  const { default: sa } = await import('./fixtures/sa/disagreement.js');
  const { default: countries } = await import('./fixtures/sa/countries.js');

  assert.equal(sa.tmdbId, `movie/${tmdb.id}`);
  assert.ok(countries.fr.services.some(({ id }) => id === 'netflix'));
  assert.ok(tmdb.results.FR.flatrate.some(({ provider_id }) => provider_id === 8));
  assert.ok(sa.streamingOptions.fr.every(({ service }) => service.id !== 'netflix'));
});

test('not-found fixtures describe a tracked title without any Netflix offer', async () => {
  const { default: tmdb } = await import('./fixtures/tmdb/not-found.js');
  const { default: sa } = await import('./fixtures/sa/not-found.js');

  assert.equal(sa.tmdbId, `movie/${tmdb.id}`);
  assert.ok(sa.title);
  const providers = Object.values(tmdb.results)
    .flatMap((country) => Object.values(country).filter(Array.isArray).flat());
  const options = Object.values(sa.streamingOptions).flat();
  assert.ok(providers.length > 0 && options.length > 0);
  assert.ok(providers.every(({ provider_id }) => provider_id !== 8));
  assert.ok(options.every(({ service }) => service.id !== 'netflix'));
});

test('TMDB multi-search mixes movie, series and person results on the same page', async () => {
  const { default: search } = await import('./fixtures/tmdb/search-multi.js');
  assert.equal(search.total_results, search.results.length);
  assert.deepEqual(new Set(search.results.map(({ media_type }) => media_type)), new Set(['movie', 'tv', 'person']));
  const people = search.results.filter(({ media_type }) => media_type === 'person');
  assert.equal(people.length, 2);
  assert.equal(people.length / search.results.length, 0.2);
  for (const person of people) {
    assert.equal(typeof person.name, 'string');
    assert.ok(person.profile_path === null || typeof person.profile_path === 'string');
    assert.ok(person.known_for.every(({ media_type }) => ['movie', 'tv'].includes(media_type)));
  }
});

test('TMDB regions and image configuration reflect the observed response shapes', async () => {
  const { default: { results } } = await import('./fixtures/tmdb/regions.js');
  const { default: { images, change_keys } } = await import('./fixtures/tmdb/images-configuration.js');
  assert.equal(results.length, 139);
  assert.equal(new Set(results.map(({ iso_3166_1 }) => iso_3166_1)).size, 139);
  for (const region of results) {
    assert.match(region.iso_3166_1, /^[A-Z]{2}$/);
    assert.equal(typeof region.english_name, 'string');
    assert.equal(typeof region.native_name, 'string');
  }
  assert.deepEqual(images.poster_sizes, ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original']);
  assert.ok(change_keys.length > 0 && change_keys.every((key) => typeof key === 'string'));
});

test('TMDB movie and series fixtures use Netflix provider 8 and ads without free offers', async () => {
  for (const kind of ['movie', 'series']) {
    const { default: catalog } = await import('./fixtures/tmdb/' + kind + '-services.js');
    const { default: availability, headers } = await import('./fixtures/tmdb/' + kind + '-watch-providers.js');
    const netflix = catalog.results.find(({ provider_id }) => provider_id === 8);
    assert.equal(netflix.provider_name, 'Netflix');
    assert.equal(typeof netflix.display_priorities.FR, 'number');
    const countries = Object.values(availability.results);
    assert.ok(countries.some(({ ads }) => Array.isArray(ads) && ads.length > 0));
    assert.ok(countries.every((country) => !Object.hasOwn(country, 'free')));
    assert.ok(countries.some(({ flatrate }) => flatrate?.some(({ provider_id }) => provider_id === 8)));
    assert.equal(headers['access-control-allow-origin'], '*');
    assert.equal(headers['access-control-expose-headers'], '*');
  }
});

test('Streaming Availability exposes the quota counters and counts the countries call', async () => {
  const { requestHeaderName } = await import('./fixtures/sa/response-headers.js');
  const movie = await import('./fixtures/sa/movie.js');
  const countries = await import('./fixtures/sa/countries.js');
  const search = await import('./fixtures/sa/search-title.js');
  assert.equal(requestHeaderName, 'X-API-Key');
  const sequence = [movie.headers, countries.headers, movie.afterCountriesHeaders, search.headers];
  for (const headers of sequence) {
    assert.match(headers['x-quota-granted'], /^\d+$/);
    assert.match(headers['x-quota-used'], /^\d+$/);
    assert.match(headers['x-quota-reset'], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.ok(Number.isFinite(Date.parse(headers['x-quota-reset'])));
    assert.equal(headers['x-quota-reset'], movie.headers['x-quota-reset']);
    assert.equal(headers['x-quota-granted'], movie.headers['x-quota-granted']);
    assert.equal(headers['access-control-allow-origin'], '*');
    assert.equal(headers['access-control-expose-headers'], '*');
  }
  const usage = sequence.map((headers) => Number(headers['x-quota-used']));
  assert.deepEqual(usage.slice(1).map((used, index) => used - usage[index]), [1, 1, 1]);

  assert.ok(Object.keys(countries.default).length > 1);
  for (const [code, country] of Object.entries(countries.default)) {
    assert.match(code, /^[a-z]{2}$/);
    assert.equal(country.countryCode, code);
    assert.equal(typeof country.name, 'string');
    const netflix = country.services.find(({ id }) => id === 'netflix');
    assert.equal(netflix.streamingOptionTypes.subscription, true);
    assert.ok(Array.isArray(netflix.addons));
  }
});

test('Streaming Availability title search returns offers only in the requested country', async () => {
  const { default: results, country } = await import('./fixtures/sa/search-title.js');
  const { default: movie } = await import('./fixtures/sa/movie.js');
  assert.ok(Object.keys(movie.streamingOptions).some((code) => code !== country));
  assert.ok(results.some(({ streamingOptions }) => streamingOptions[country]?.length > 0));
  assert.ok(results.some(({ streamingOptions }) => Object.keys(streamingOptions).length === 0));
  for (const { streamingOptions } of results) {
    assert.ok(Object.keys(streamingOptions).every((code) => code === country));
  }
});

test('Streaming Availability Netflix offers exercise filled and empty languages without closed captions', async () => {
  const netflixOffers = [];
  for (const file of ['movie', 'series', 'search-title', 'disagreement', 'no-options', 'not-found']) {
    const fixture = await import('./fixtures/sa/' + file + '.js');
    const shows = [fixture.default].flat();
    for (const show of shows) {
      assert.equal(show.itemType, 'show');
      const offers = Object.values(show.streamingOptions).flat();
      for (const { subtitles } of offers) {
        assert.ok(subtitles.every(({ locale, closedCaptions }) =>
          typeof locale.language === 'string' && closedCaptions === false));
      }
      const netflix = offers.filter(({ service }) => service.id === 'netflix');
      if (file === 'movie' || file === 'series') assert.ok(netflix.length > 0);
      netflixOffers.push(...netflix);
    }
  }
  for (const field of ['audios', 'subtitles']) {
    assert.ok(netflixOffers.some((offer) => offer[field].length > 0));
    assert.ok(netflixOffers.some((offer) => offer[field].length === 0));
  }
});

test('synthetic error fixtures preserve distinct HTTP and response-body codes', async () => {
  for (const [file, status, code] of [['error-404', 404, 34], ['error-429', 429, 25]]) {
    const fixture = await import('./fixtures/tmdb/' + file + '.js');
    assert.equal(fixture.status, status);
    assert.equal(fixture.default.status_code, code);
    assert.equal(fixture.default.success, false);
  }
  for (const [file, status] of [['error-404', 404], ['error-429', 429], ['quota-exhausted', 429]]) {
    const fixture = await import('./fixtures/sa/' + file + '.js');
    assert.equal(fixture.status, status);
    assert.equal(typeof fixture.default.message, 'string');
  }
});
