import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
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
  originalOffer.subtitles[0].closedCaptions = true;
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
      titles: [show, { ...series, tmdbId: 'movie/900002' }].map((body, index) =>
        ({ ...observed('Show', body), id: 900001 + index })),
    },
    v18: observed('GET /v4/shows/search/title', [show, series], { 'x-quota-remaining': '88' }),
  };
  const report = renderReport(fixture);

  for (const heading of ['V-01 — TMDB', 'V-02 — Streaming Availability', 'Service identifiers']) {
    assert.ok(report.includes('## ' + heading + '\n\nStatus: observed'));
  }
  assert.match(report, /2\/10 \(20\.0%\)/);
  assert.match(report, /ads key in TV availability: observed/);
  assert.match(report, /Netflix with provider ID 8 in movie catalog: observed/);
  assert.match(report, /"poster_sizes": \["w92","w154"/);
  assert.match(report, /Mapping proposal — to be confirmed/);
  assert.match(report, /x-quota-detail: "\[redacted\]"/);
  assert.ok(!report.includes(key));
  assert.ok(!report.includes(show.title));
  assert.ok(!report.includes(show.streamingOptions.us[0].link));
  assert.equal(maskKeys('abc.* abc', ['abc', 'abc.*']), '[redacted] [redacted]');
  const rates = [
    '| Overall | 1/3 (33.3%) | 1/3 (33.3%) | 0/3 (0.0%) |',
    '| FR | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) |',
    '| US | 1/1 (100.0%) | 1/1 (100.0%) | 0/1 (0.0%) |',
    '| 900001 (HTTP 200) | 1/2 (50.0%) | 1/2 (50.0%) | 0/2 (0.0%) |',
    '| 900001 / FR | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) |',
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
    assert.match(partial, /\| Overall \| 1\/2 \(50\.0%\) \| 1\/2 \(50\.0%\) \| 0\/2 \(0\.0%\) \|/);
    assert.match(partial, /2 \(HTTP 429, Unexpected HTTP status\.\)/);
  }

  const titlesWithoutNetflix = Array.from({ length: 19 }, (_, index) => {
    const id = 900002 + index;
    return { ...observed('Show', { tmdbId: 'movie/' + id, streamingOptions: {} }), id };
  });
  const sparse = renderReport({
    ...fixture,
    v05: {
      ...fixture.v05, sampleSize: 20, selected: 20,
      titles: [fixture.v05.titles[0], ...titlesWithoutNetflix],
    },
  });
  assert.match(sparse, /Matching show responses with a streaming options map: 20\/20\n/);
  assert.match(sparse, /Measurement status: Incomplete\n- Titles contributing to the observed rates: 1\/20\n/);
  assert.match(sparse, /\| Overall \| 1\/2 \(50\.0%\) \| 1\/2 \(50\.0%\) \| 0\/2 \(0\.0%\) \|/);
});

const repo = fileURLToPath(new URL('../', import.meta.url));
const preload = (source) => 'data:text/javascript,' + encodeURIComponent(source);
const fetchGuard = preload('globalThis.fetch = () => process.exit(99);');

function invokeProbe(args, env = {}, fetchMock = fetchGuard, cwd = repo) {
  return spawnSync(process.execPath, ['--import', fetchMock, 'scripts/probe-apis.mjs', ...args], {
    cwd, env, encoding: 'utf8',
  });
}

test('refuses V-05 and V-18 before any SA fetch without confirmation', () => {
  const fetchMock = preload(`
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

test('runs confirmed V-05 and V-18 and excludes responses for the wrong title', async () => {
  // Keep the report outside the probe copy so the real CLI output guard still runs.
  const scratch = await mkdtemp(join(repo, '.probe-test-'));
  try {
    const probe = join(scratch, 'probe');
    await cp(join(repo, 'scripts'), join(probe, 'scripts'), { recursive: true });
    await cp(join(repo, 'package.json'), join(probe, 'package.json'));
    const output = join(scratch, 'report.md');
    const ids = Array.from({ length: 20 }, (_, index) => 900001 + index);
    const fetchMock = preload(`
      const [first, ...rest] = ${JSON.stringify(ids)};
      const fixture = ${JSON.stringify(show)};
      const requests = [];
      globalThis.fetch = async (url, { method }) => {
        const { pathname, search, searchParams } = new URL(url);
        if (pathname.startsWith('/v4/') || pathname === '/3/discover/movie') {
          requests.push(pathname + search);
        }
        if (method === 'OPTIONS') return new Response(null, { status: 204 });
        let body = {};
        if (pathname === '/3/discover/movie') {
          const ids = searchParams.get('page') === '1' ? [first, first] : [first, ...rest, 999999];
          body = { results: ids.map((id) => ({ id })), total_pages: 2 };
        } else if (pathname === '/v4/shows/search/title') {
          body = [fixture];
        } else if (pathname.startsWith('/v4/shows/movie/')) {
          const id = Number(pathname.split('/').at(-1));
          const returned = { [rest[0]]: 'movie/' + first, [rest[1]]: null, [rest[2]]: 'tv/' + rest[2] };
          body = { ...fixture, tmdbId: Object.hasOwn(returned, id) ? returned[id] : 'movie/' + id };
          if (body.tmdbId === null) delete body.tmdbId;
        }
        return Response.json(body, { headers: { 'access-control-allow-origin': '*' } });
      };
      process.on('exit', () => console.log(JSON.stringify(requests)));
    `);
    const result = invokeProbe(
      ['--v05', '--v18', '--region', 'fr', '--confirm-sa-calls', '--out', output],
      { TMDB_TOKEN: 'dummy-tmdb', SA_KEY: 'dummy-sa' }, fetchMock, probe,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)), [
      '/v4/shows/movie/550', '/v4/countries', '/v4/shows/movie/550',
      '/v4/shows/search/title?title=Fight+Club&country=fr',
      '/3/discover/movie?with_watch_providers=8&watch_region=FR&page=1',
      '/3/discover/movie?with_watch_providers=8&watch_region=FR&page=2',
      ...ids.map((id) => '/v4/shows/movie/' + id),
    ]);

    const report = await readFile(output, 'utf8');
    assert.match(report, /Measurement status: Incomplete\n- Titles contributing to the observed rates: 17\/20/);
    assert.ok(report.includes('| Overall | 17/34 (50.0%) | 17/34 (50.0%) | 0/34 (0.0%) |'));
    for (const id of ids.slice(1, 4)) {
      assert.ok(report.includes('| ' + id + ' (HTTP 200, TMDB ID mismatch (expected movie/' + id + ').) | n/a | n/a | n/a |'));
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
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
