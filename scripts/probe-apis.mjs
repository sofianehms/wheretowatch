import { mkdir, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { quotaHeaders } from './probe/analysis.js';
import { resolveOutputPath } from './probe/output.js';
import { renderReport } from './probe/report.js';

const help = [
  'Usage: node scripts/probe-apis.mjs [--out <path>] [--v05] [--v18] [--region <code>] [--confirm-sa-calls]',
  'The baseline probe makes 3 Streaming Availability requests.',
  '  --v05   Measure Netflix language fill rates (20 additional requests).',
  '  --v18   Search for Fight Club on Streaming Availability (1 additional request).',
  '  --region <code>   Country for TMDB discovery and SA title search (default: US).',
  'Both optional measurements require --confirm-sa-calls.',
  'Set TMDB_TOKEN and SA_KEY in the environment.',
  'Default report: ~/wheretowatch-probe/<UTC-date>.md',
  'Choose a new report path outside the repository.',
].join('\n');

const origin = 'https://wheretowatch.example';
const tmdbBase = 'https://api.themoviedb.org/3';
const saBase = 'https://api.movieofthenight.com/v4';

async function observe(label, url, { headers = {}, method = 'GET', quota = false } = {}) {
  const result = { label, headers: {} };
  let response;
  try {
    response = await fetch(url, {
      method, headers: { Origin: origin, ...headers }, redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ...result, anomaly: 'Request failed (network, timeout, redirect or invalid request headers).' };
  }

  result.status = response.status;
  if (quota) Object.assign(result.headers, quotaHeaders(response.headers));
  const preflight = method === 'OPTIONS';
  if (response.status === 200 || preflight) {
    const corsHeaders = preflight
      ? ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods']
      : ['access-control-allow-origin', 'access-control-expose-headers'];
    for (const name of corsHeaders) result.headers[name] = response.headers.get(name);
  }

  const allowedOrigin = result.headers['access-control-allow-origin'];
  if (preflight ? !response.ok : response.status !== 200) {
    result.anomaly = 'Unexpected HTTP status.';
  } else if (allowedOrigin !== '*' && allowedOrigin !== origin) {
    result.anomaly = 'CORS did not allow the request origin.';
  } else if (preflight) {
    const allowedHeaders = result.headers['access-control-allow-headers']?.toLowerCase().split(/\s*,\s*/);
    if (!allowedHeaders?.includes('authorization')) result.anomaly = 'Preflight did not explicitly allow Authorization.';
  }

  if (preflight || response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    return result;
  }

  try {
    result.body = await response.json();
  } catch {
    result.anomaly = [result.anomaly, 'Response did not contain readable JSON.'].filter(Boolean).join(' ');
  }
  return result;
}

const sampleSize = 20;

async function measureLanguages(region, tmdbGet, saGet) {
  const ids = new Set();
  let discovery;
  for (let page = 1; page <= 500; page++) {
    discovery = await tmdbGet('/discover/movie?with_watch_providers=8&watch_region=' + region + '&page=' + page);
    if (!Array.isArray(discovery.body?.results)) break;
    for (const { id } of discovery.body.results.filter(Boolean)) {
      if (Number.isSafeInteger(id) && id > 0) ids.add(id);
      if (ids.size === sampleSize) break;
    }
    if (ids.size === sampleSize || !(page < discovery.body.total_pages)) break;
  }

  const titles = [];
  if (ids.size === sampleSize) {
    for (const id of ids) {
      const path = '/shows/movie/' + id;
      const result = await saGet('GET /v4' + path, path);
      titles.push({ id, ...result });
      if ([401, 403, 429].includes(result.status)) break;
    }
  }
  return { region, sampleSize, selected: ids.size, discovery, titles };
}

async function runProbe(token, key, options) {
  const tmdbGet = (path) => observe('GET ' + path, tmdbBase + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const saGet = (label, path) => observe(label, saBase + path, {
    headers: { 'X-API-Key': key }, quota: true,
  });

  const preflight = await observe('OPTIONS /search/multi', tmdbBase + '/search/multi?query=it', {
    method: 'OPTIONS',
    headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
  });
  const searches = [];
  for (const query of ['it', 'up', 'ma', 'her', 'the']) searches.push(await tmdbGet('/search/multi?query=' + query));

  const tmdb = {
    preflight, searches,
    watch: await tmdbGet('/tv/1399/watch/providers'),
    regions: await tmdbGet('/watch/providers/regions'),
    configuration: await tmdbGet('/configuration'),
    movie: await tmdbGet('/watch/providers/movie'),
    tv: await tmdbGet('/watch/providers/tv'),
  };
  const show = '/shows/movie/550';
  const sa = {
    before: await saGet('GET /v4' + show + ' (before)', show),
    countries: await saGet('GET /v4/countries', '/countries'),
    after: await saGet('GET /v4' + show + ' (after)', show),
  };
  const { region } = options;
  const v18 = options.v18 ? await saGet('GET /v4/shows/search/title',
    '/shows/search/title?' + new URLSearchParams({ title: 'Fight Club', country: region.toLowerCase() })) : undefined;
  const v05 = options.v05 ? await measureLanguages(region, tmdbGet, saGet) : undefined;
  return renderReport({ tmdb, sa, v05, v18, region, origin, keys: [token, key] });
}

async function main() {
  const { values } = parseArgs({ options: {
    out: { type: 'string' }, help: { type: 'boolean' }, v05: { type: 'boolean' }, v18: { type: 'boolean' },
    region: { type: 'string', default: 'US' }, 'confirm-sa-calls': { type: 'boolean' },
  } });
  if (values.help) {
    console.log(help);
    return;
  }

  const measurements = [
    values.v05 && 'V-05: ' + sampleSize + ' additional Streaming Availability requests',
    values.v18 && 'V-18: 1 additional Streaming Availability request',
  ].filter(Boolean);
  if (measurements.length) {
    console.log(measurements.join('\n') + '\nBaseline: 3 Streaming Availability requests.');
    if (!values['confirm-sa-calls']) {
      console.error('Pass --confirm-sa-calls to authorize the requested measurements.');
      process.exitCode = 1;
      return;
    }
  }
  if (!/^[a-z]{2}$/i.test(values.region)) {
    console.error('--region must be a two-letter country code.');
    process.exitCode = 1;
    return;
  }
  values.region = values.region.toUpperCase();

  const { TMDB_TOKEN: token, SA_KEY: key } = process.env;
  if (!token?.trim() || !key?.trim()) {
    console.error(help);
    process.exitCode = 1;
    return;
  }

  const repo = fileURLToPath(new URL('../', import.meta.url));
  const requested = values.out ?? join(homedir(), 'wheretowatch-probe', new Date().toISOString().slice(0, 10) + '.md');
  let output;
  try {
    output = await resolveOutputPath(repo, requested);
  } catch (error) {
    console.error(error.code ? 'Cannot resolve the report path.' : error.message);
    process.exitCode = 1;
    return;
  }

  // Reserve a new file before making requests so an invalid destination cannot spend quota.
  await mkdir(dirname(output), { recursive: true });
  const file = await open(output, 'wx', 0o600);
  try {
    await file.writeFile(await runProbe(token.trim(), key.trim(), values));
  } finally {
    await file.close();
  }
  console.log('Probe report written.');
}

main().catch(() => {
  console.error('Probe failed. Use --help and check that the report path is writable and unused.');
  process.exitCode = 1;
});
