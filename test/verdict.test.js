import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError } from '../src/api/http.js';
import { reconcile } from '../src/core/reconcile.js';
import { computeVerdict, verdictText } from '../src/core/verdict.js';
import dictionary from '../src/i18n/en/verdict.js';
import { t } from '../src/i18n/strings.js';
import {
  disagreement, divergingTypes, outsideSaCoverage, saAbsent, saNotRecognized,
} from './fixtures/reconcile/scenarios.js';

const forbidden = /\b(?:nowhere|never|not\s+available\s+anywhere)\b/i;

function verdict(input, { serviceKey = 'netflix', homeCountry, mediaType = 'movie' } = {}) {
  const reconciled = reconcile({ ...input, serviceKey });
  const result = computeVerdict({ reconciled, snapshots: input.snapshots, serviceKey, homeCountry, mediaType });
  const text = verdictText(result, t);
  assert.doesNotMatch(text, forbidden);
  assert.doesNotMatch(text, /\{\w+\}|\bverdict\./);
  if (result.kind !== 'error' && result.count !== null) {
    assert.match(text, new RegExp('\\b' + result.count + ' (?:covered )?(?:country|countries)\\b'));
    if (result.fetchedAt) assert.match(text, /retrieved on \d{1,2} Nov 2026/);
  }
  return { result, text };
}

test('section 5.4 available when at least one source reports the selected service', () => {
  const { result, text } = verdict(disagreement);
  assert.equal(result.kind, 'available');
  assert.equal(result.count, 2);
  assert.equal(result.confirmedCount, 0);
  assert.match(text, /Available on Netflix in 2 countries/);
  assert.match(text, /JustWatch via TMDB: data retrieved on 21 Nov 2026/);
  assert.match(text, /Movie of the Night: data retrieved on 22 Nov 2026/);
  assert.deepEqual(result.sources, ['tmdb', 'sa']);
  assert.equal(result.fetchedAt, '2026-11-22T12:00:00Z');

  const confirmed = verdict(divergingTypes);
  assert.equal(confirmed.result.confirmedCount, 1);
  assert.match(confirmed.text, /in 1 country\. 1 confirmed by both sources/);
});

test('section 5.4 not found when the title is tracked but the selected service is absent', () => {
  const { result, text } = verdict(disagreement, { serviceKey: 'Hulu' });
  assert.equal(result.kind, 'notFound');
  assert.equal(result.count, 3);
  assert.match(text, /Not found on Hulu in the 3 covered countries/);
  assert.match(text, /The title may be available elsewhere/);
});

test('section 5.4 title not recognized is noted for SA alongside the verdict', () => {
  const { result, text } = verdict(saNotRecognized);
  assert.equal(result.kind, 'available');
  assert.equal(result.perSourceNotes[1].status, 'notFound');
  assert.match(text, /Movie of the Night: title not recognized/);
  assert.doesNotMatch(text, /coverage list retrieved/);
});

test('section 5.4 insufficient data when no source reports offers', () => {
  const [tmdb, sa] = saNotRecognized.snapshots;
  const { result, text } = verdict({
    ...saNotRecognized,
    snapshots: [{ ...tmdb, status: 'empty', offers: [] }, sa],
  }, { homeCountry: 'FR' });
  assert.equal(result.kind, 'insufficient');
  assert.equal(result.count, 2);
  assert.equal(result.home.kind, 'insufficient');
  assert.match(text, /This title may not be tracked by the sources\. Data covers 2 countries\. Check on TMDB/);
});

test('section 5.4 technical failures from all sources produce an error message instead of a verdict', () => {
  for (const [type, message] of [
    ['auth', /Check your API keys/],
    ['offline', /Check your connection/],
    ['network', /Try again/],
  ]) {
    const { result, text } = verdict({
      ...disagreement,
      snapshots: disagreement.snapshots.map((snapshot) => ({
        ...snapshot, status: 'unavailable', offers: [], error: new HttpError(type),
      })),
    }, { homeCountry: 'FR' });
    assert.equal(result.kind, 'error');
    assert.equal(result.count, null);
    assert.equal(result.fetchedAt, null);
    assert.equal(result.home, null);
    assert.match(text, /^Couldn’t load availability\./);
    assert.match(text, message);
    assert.doesNotMatch(text, /countries|retrieved|not found/i);
  }
});

test('a partial technical failure preserves the result and date from the responding source', () => {
  const [tmdb, sa] = disagreement.snapshots;
  const { result, text } = verdict({
    ...disagreement,
    snapshots: [tmdb, { ...sa, status: 'unavailable', offers: [], error: new HttpError('network') }],
  });
  assert.equal(result.kind, 'available');
  assert.deepEqual(result.sources, ['tmdb']);
  assert.equal(result.fetchedAt, tmdb.fetchedAt);
  assert.doesNotMatch(text, /Movie of the Night|22 Nov 2026/);
});

test('quota-only unavailability and absent sources give insufficient data', () => {
  for (const snapshots of [[], saAbsent.snapshots.map((snapshot) => ({
    ...snapshot, status: 'unavailable', offers: [], error: new HttpError('quota'),
  }))]) {
    const { result, text } = verdict({ snapshots, coverage: {} });
    assert.equal(result.kind, 'insufficient');
    assert.match(text, /No availability data was retrieved/);
  }
});

test('reference country is available when an offer was reported there', () => {
  const { result, text } = verdict(disagreement, { homeCountry: 'FR' });
  assert.deepEqual(result.home, { country: 'fr', kind: 'available', saNotCovered: false });
  assert.match(text, /France: available on Netflix/);
});

test('reference country is not found when it is covered and has no offer', () => {
  const { result, text } = verdict(disagreement, { homeCountry: 'CA' });
  assert.deepEqual(result.home, { country: 'ca', kind: 'notFound', saNotCovered: false });
  assert.match(text, /Canada: not found on Netflix/);
});

test('reference country outside SA coverage can still have a JustWatch offer', () => {
  const { result, text } = verdict(outsideSaCoverage, { homeCountry: 'FR' });
  assert.deepEqual(result.home, { country: 'fr', kind: 'available', saNotCovered: true });
  assert.match(text, /France: available on Netflix\. Second source: country not covered/);
});

test('series wording describes the whole series', () => {
  const { result, text } = verdict(saAbsent, { mediaType: 'tv' });
  assert.equal(result.isSeries, true);
  assert.match(text, /whole series, not per season/);
});

test('stale availability and stale coverage use their own retrieval dates', () => {
  const [tmdb, sa] = disagreement.snapshots;
  const { result, text } = verdict({ ...disagreement, snapshots: [tmdb, { ...sa, stale: true }] });
  assert.equal(result.stale, true);
  assert.match(text, /coverage list retrieved on 18 Nov 2026/);
  assert.match(text, /data retrieved on 22 Nov 2026 \(not refreshed\)/);
  assert.equal(verdict(disagreement).result.stale, false);
});

test('no verdict displays a country count when coverage is unknown', () => {
  const input = { ...disagreement, coverage: { ...disagreement.coverage, sa: { status: 'unknown' } } };
  const { result, text } = verdict(input, { homeCountry: 'DE' });
  assert.equal(result.kind, 'available');
  assert.equal(result.home.kind, 'available');
  assert.equal(result.count, null);
  assert.match(text, /Movie of the Night: coverage of this source unknown/);
  assert.doesNotMatch(text, /\b\d+ (?:covered )?(?:country|countries|confirmed)\b/);

  const missing = verdict(input, { serviceKey: 'Hulu' });
  assert.equal(missing.result.kind, 'notFound');
  assert.equal(missing.result.count, null);
  assert.match(missing.text, /Not found on Hulu in the data retrieved/);
  assert.doesNotMatch(missing.text, /\b\d+ (?:covered )?countr(?:y|ies)\b/);

  const insufficient = verdict({
    coverage: {},
    snapshots: input.snapshots.map((snapshot) => ({ ...snapshot, status: 'empty', offers: [] })),
  });
  assert.equal(insufficient.result.kind, 'insufficient');
  assert.equal(insufficient.result.count, null);
  assert.doesNotMatch(insufficient.text, /\b\d+ (?:covered )?countr(?:y|ies)\b/);
});

test('verdict dictionary contains no forbidden wording', () => {
  for (const [key, value] of Object.entries(dictionary)) assert.doesNotMatch(value, forbidden, key);
});
