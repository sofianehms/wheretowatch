import assert from 'node:assert/strict';
import test from 'node:test';
import { degradationBanners } from '../src/render/banners.js';

const nextReset = Date.UTC(2026, 11, 1);
const quota = (used, blocked = used >= 1000) => ({ used, limit: 1000, warn: used >= 800, blocked, nextReset });
const offers = [{ country: 'fr' }];
const answer = (source, extra = {}) => ({ source, status: 'offers', fetchedAt: '2026-11-18T12:00:00Z', offers, error: null, ...extra });
const failed = (source, type) => answer(source, { status: 'unavailable', offers: [], error: { type } });
const types = (input) => degradationBanners(input).map(({ type }) => type);
const only = (input) => {
  const banners = degradationBanners(input);
  assert.equal(banners.length, 1);
  return banners[0];
};

test('the quota warning starts at 80% and the block replaces it at 100%', () => {
  assert.deepEqual(types({ quota: quota(799) }), []);
  assert.equal(only({ quota: quota(800) }).title, '800 of 1,000 monthly calls used');
  assert.match(only({ quota: quota(800) }).message, /Resets on 1 Dec 2026/);
  assert.deepEqual(types({ quota: quota(1000) }), ['quotaReached']);
  assert.deepEqual(types({ quota: quota(12, true) }), ['quotaReached']);
});

test('the reached limit says what is still shown', () => {
  const message = (sa, tmdb = answer('tmdb')) => only({ quota: quota(1000), snapshots: [tmdb, sa] }).message;
  assert.match(message(answer('sa', { stale: true, reason: 'quota' })), /languages saved on 18 Nov 2026 \(not refreshed\)\. Resets on 1 Dec 2026/);
  assert.match(message(failed('sa', 'quota')), /JustWatch data without languages/);
  assert.match(message(failed('sa', 'quota'), failed('tmdb', 'network')), /^Languages are paused/);
});

test('a failing second source is announced, with its saved date when there is one', () => {
  const banner = (sa) => only({ quota: quota(10), snapshots: [answer('tmdb'), sa] });
  assert.equal(banner(failed('sa', 'server')).title, 'Second source unavailable');
  assert.match(banner(answer('sa', { stale: true, reason: 'error' })).message, /saved on 18 Nov 2026 \(not refreshed\)/);
  assert.equal(banner(failed('sa', 'auth')).action.name, 'settings');
  // A quota error left over from an ended cycle is not announced as a reached limit.
  assert.equal(banner(failed('sa', 'quota')).type, 'sourceError');
});

test('saved JustWatch data is announced even without a second key', () => {
  const stale = answer('tmdb', { stale: true, reason: 'error' });
  assert.match(only({ snapshots: [stale] }).message, /18 Nov 2026 \(not refreshed\)/);
  assert.equal(only({ quota: quota(10), snapshots: [stale, failed('sa', 'timeout')] }).title, 'Couldn’t refresh availability data');
});

test('no failure banner for healthy, unknown, cancelled or fully failed answers', () => {
  const cases = [
    [answer('tmdb'), answer('sa')],
    [answer('tmdb'), answer('sa', { status: 'notFound', offers: [] })],
    [answer('tmdb'), failed('sa', 'aborted')],
    [failed('tmdb', 'network'), failed('sa', 'network')],
  ];
  for (const snapshots of cases) assert.deepEqual(types({ quota: quota(10), snapshots }), []);
});
