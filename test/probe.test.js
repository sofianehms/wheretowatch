import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  compareQuota, extractShape, languagePresence, languageRates, maskKeys, quotaHeaders, saServices, tmdbServices,
} from '../scripts/probe/analysis.js';
import { resolveOutputPath } from '../scripts/probe/output.js';
import { renderReport } from '../scripts/probe/report.js';
import countries from './fixtures/sa/countries.js';
import show from './fixtures/sa/movie.js';
import series from './fixtures/sa/series.js';
import configuration from './fixtures/tmdb/images-configuration.js';
import movie from './fixtures/tmdb/movie-services.js';
import regions from './fixtures/tmdb/regions.js';
import search from './fixtures/tmdb/search-multi.js';
import watch from './fixtures/tmdb/series-watch-providers.js';
import tv from './fixtures/tmdb/series-services.js';

test('extracts field types across heterogeneous arrays and masks dictionary keys', () => {
  const shape = extractShape(search);
  assert.ok(shape.includes('$["results"][]["poster_path"]: null | string'));
  assert.ok(shape.includes('$["results"][]["known_for"]: array'));
  assert.ok(!shape.some((field) => field.includes(search.results[0].title)));
  assert.ok(extractShape(countries, ['$']).includes('$[*]["services"][]["id"]: string'));
});

test('extracts both TMDB catalogs and deduplicates SA services across countries', () => {
  assert.ok(tmdbServices(movie).some(({ id, name }) => id === 8 && name === 'Netflix'));
  assert.ok(tmdbServices(tv).some(({ id, name }) => id === 8 && name === 'Netflix'));
  assert.deepEqual(saServices(countries), [
    { id: 'lantern', name: 'Lantern Screen' },
    { id: 'netflix', name: 'Netflix' },
  ]);
});

test('compares matching quota counters and treats conflicting evidence as inconclusive', () => {
  const headers = (remaining) => quotaHeaders(new Headers({
    'X-RateLimit-Remaining': remaining, 'X-Quota-Limit': '1000', 'content-type': 'application/json',
  }));
  assert.deepEqual(headers('90'), { 'x-quota-limit': '1000', 'x-ratelimit-remaining': '90' });
  assert.equal(compareQuota(headers('90'), headers('90'), headers('89'))[0].estimate, 0);
  assert.equal(compareQuota(headers('90'), headers('89'), headers('88'))[0].estimate, 1);
  assert.equal(compareQuota(headers('90'), headers('90'), headers('88'))[0].estimate, undefined);
  assert.deepEqual(compareQuota(headers('90'), {}, headers('unknown')), []);
});

test('counts each Netflix country once and distinguishes audio, subtitles and closed captions', () => {
  const fixture = structuredClone(show);
  const [originalOffer] = fixture.streamingOptions.us;
  const [emptyOffer] = fixture.streamingOptions.fr;
  fixture.streamingOptions.fr.push({
    ...emptyOffer, subtitles: [{ locale: { language: 'fra' }, closedCaptions: false }],
  });
  fixture.streamingOptions.fr.push({ ...originalOffer, service: { id: 'lantern' } });
  fixture.streamingOptions.gb = [{ ...originalOffer, service: { id: 'lantern' } }];

  assert.deepEqual(languageRates(languagePresence(fixture)), {
    total: 2, audio: 1, subtitles: 2, closedCaptions: 1,
  });
  assert.deepEqual(languagePresence({}), []);
});

test('renders fixture findings without raw values or a fictitious key in headers and identifiers', (context) => {
  const key = 'fixture.key+[123]';
  const observed = (label, body, headers = {}) => ({ label, status: 200, body, headers });
  const fixture = {
    origin: 'https://wheretowatch.example',
    keys: [key],
    tmdb: {
      preflight: { label: 'OPTIONS /search/multi', status: 204 },
      searches: [observed('GET /search/multi?query=it', search)],
      watch: observed('TV availability', watch),
      regions: observed('Regions', regions),
      configuration: observed('Configuration', configuration),
      movie: observed('Movie catalog', movie),
      tv: observed('TV catalog', tv),
    },
    sa: {
      before: observed('Show before', show, { 'x-quota-detail': key }),
      countries: observed('Countries', {
        ...countries,
        us: { services: [...countries.us.services, { id: key, name: key }] },
      }),
      after: observed('Show after', show, { 'x-quota-remaining': '89' }),
    },
    region: 'FR',
    v05: {
      region: 'FR', sampleSize: 2, selected: 2,
      titles: [show, series].map((body, index) => ({ ...observed('Show', body), id: index + 1 })),
    },
    v18: observed('GET /v4/shows/search/title', [show, series], { 'x-quota-remaining': '88' }),
  };
  const report = renderReport(fixture);

  for (const heading of ['V-01 — TMDB', 'V-02 — Streaming Availability', 'Service identifiers']) {
    assert.ok(report.includes('## ' + heading + '\n\nStatus: observed'));
  }
  assert.match(report, /1\/3 \(33\.3%\)/);
  assert.match(report, /ads key in TV availability: not observed/);
  assert.match(report, /Netflix with provider ID 8 in movie catalog: observed/);
  assert.match(report, /"poster_sizes": \["w92","w154"/);
  assert.match(report, /Mapping proposal — to be confirmed/);
  assert.match(report, /x-quota-detail: "\[redacted\]"/);
  assert.ok(!report.includes(key));
  assert.ok(!report.includes(show.title));
  assert.ok(!report.includes(show.streamingOptions.us[0].link));
  assert.equal(maskKeys('abc.* abc', ['abc', 'abc.*']), '[redacted] [redacted]');
  const rates = [
    '| Overall | 1/3 (33.3%) | 1/3 (33.3%) | 1/3 (33.3%) |',
    '| FR | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) |',
    '| US | 1/1 (100.0%) | 1/1 (100.0%) | 1/1 (100.0%) |',
    '| 1 (HTTP 200) | 1/2 (50.0%) | 1/2 (50.0%) | 1/2 (50.0%) |',
    '| 1 / FR | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) |',
  ];
  for (const row of rates) assert.ok(report.includes(row), row);
  assert.match(report, /Measurement status: Complete\n- Titles contributing to the observed rates: 2\/2\n/);
  context.diagnostic('V-05 fixture rates (audio, subtitles, closed captions)');
  for (const row of rates) context.diagnostic(row);
  assert.match(report, /Countries present: fr, us/);
  assert.match(report, /Results with offers in every country returned by \/countries: 1\/2/);
  assert.match(report, /x-quota-remaining: 1\n/);

  const rateLimited = { id: 2, status: 429, anomaly: 'Unexpected HTTP status.' };
  for (const sampleSize of [2, 20]) {
    const partial = renderReport({
      ...fixture,
      v05: { ...fixture.v05, sampleSize, selected: sampleSize, titles: [fixture.v05.titles[0], rateLimited] },
    });
    assert.ok(partial.includes('Streaming Availability requests sent: 2/' + sampleSize));
    assert.ok(partial.includes('Measurement status: Incomplete\n- Titles contributing to the observed rates: 1/' + sampleSize));
    assert.match(partial, /\| Overall \| 1\/2 \(50\.0%\) \| 1\/2 \(50\.0%\) \| 1\/2 \(50\.0%\) \|/);
    assert.match(partial, /2 \(HTTP 429, Unexpected HTTP status\.\)/);
  }
});

const repo = fileURLToPath(new URL('../', import.meta.url));
const fetchGuard = 'data:text/javascript,' + encodeURIComponent('globalThis.fetch = () => process.exit(99);');

function invokeProbe(args, env = {}, fetchMock = fetchGuard) {
  return spawnSync(process.execPath, ['--import', fetchMock, 'scripts/probe-apis.mjs', ...args], {
    cwd: repo, env, encoding: 'utf8',
  });
}

test('refuses V-05 and V-18 before any SA fetch without confirmation', () => {
  const fetchMock = 'data:text/javascript,' + encodeURIComponent(`
    let saCalls = 0;
    globalThis.fetch = async (url) => {
      if (new URL(url).hostname === 'api.movieofthenight.com') saCalls++;
      return new Response('{}');
    };
    process.on('exit', () => console.log('SA calls: ' + saCalls));
  `);
  for (const [flag, measurement, count] of [['--v05', 'V-05', 20], ['--v18', 'V-18', 1]]) {
    const result = invokeProbe([flag], { TMDB_TOKEN: 'dummy-tmdb', SA_KEY: 'dummy-sa' }, fetchMock);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes(measurement + ': ' + count + ' additional'));
    assert.match(result.stdout, /^SA calls: 0$/m);
    assert.match(result.stderr, /--confirm-sa-calls/);
  }
});

test('prints help and exits before network access if either key is missing', () => {
  for (const env of [{}, { TMDB_TOKEN: 'dummy-tmdb' }, { SA_KEY: 'dummy-sa' }]) {
    const result = invokeProbe([], env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: node scripts\/probe-apis.mjs/);
    assert.match(result.stderr, /TMDB_TOKEN and SA_KEY/);
  }
});

test('refuses a repository report path before network access', async () => {
  await assert.rejects(resolveOutputPath(repo, './docs/x.md'), /outside the repository/);
  const result = invokeProbe(['--out', './docs/x.md'], { TMDB_TOKEN: 'dummy-tmdb', SA_KEY: 'dummy-sa' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside the repository/);
});
