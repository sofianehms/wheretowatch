import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDate, t } from '../src/i18n/strings.js';
import { offerDetails } from '../src/render/languages.js';

const now = Date.parse('2026-11-25T12:00:00Z');
// Local noon, so the displayed day is the same in every time zone.
const soon = new Date(2026, 11, 31, 12).toISOString();
const later = new Date(2027, 1, 1, 12).toISOString();
const date = (iso) => formatDate(new Date(iso));
const offer = (offerType, quality = null, expiresOn = null) => ({ offerType, quality, expiresOn });
const details = (...sa) => offerDetails({ offers: { sa } }, now);

test('an upcoming expiry is dated with formatDate', () => {
  assert.deepEqual(details(offer('subscription', 'hd', soon)), [{ type: 'subscription', quality: 'hd', leaves: date(soon) }]);
  assert.equal(t('title.offer.leaves', { date: date(soon) }), 'Leaves on 31 Dec 2026');
});

test('each offer of one type keeps its own quality', () => {
  assert.deepEqual(details(offer('rent', 'sd'), offer('rent', 'uhd')), [
    { type: 'rent', quality: 'uhd', leaves: null },
    { type: 'rent', quality: 'sd', leaves: null },
  ]);
  assert.equal(t('title.quality.uhd'), 'UHD');
});

test('offers of one type and date keep their qualities, with or without one', () => {
  assert.deepEqual(details(offer('subscription', null, soon), offer('subscription', 'sd', soon), offer('subscription', 'hd', soon)), [
    { type: 'subscription', quality: 'hd', leaves: date(soon) },
    { type: 'subscription', quality: 'sd', leaves: date(soon) },
    { type: 'subscription', quality: null, leaves: date(soon) },
  ]);
});

test('offers that would read the same share a line', () => {
  const sameDay = new Date(2026, 11, 31, 18).toISOString();
  assert.deepEqual(details(offer('rent', 'hd'), offer('rent', 'hd'), offer('rent')), [{ type: 'rent', quality: 'hd', leaves: null }]);
  assert.deepEqual(details(offer('buy', 'hd', soon), offer('buy', 'hd', sameDay)), [{ type: 'buy', quality: 'hd', leaves: date(soon) }]);
});

test('a leaving date never spreads to an offer that stays', () => {
  const lines = details(offer('buy', 'sd'), offer('subscription', 'uhd'), offer('subscription', 'hd', later), offer('subscription', 'sd', soon));
  assert.deepEqual(lines, [
    { type: 'subscription', quality: 'sd', leaves: date(soon) },
    { type: 'subscription', quality: 'hd', leaves: date(later) },
    { type: 'subscription', quality: 'uhd', leaves: null },
    { type: 'buy', quality: 'sd', leaves: null },
  ]);
});

test('missing, unknown, invalid or past data adds nothing', () => {
  assert.deepEqual(details(), []);
  assert.deepEqual(offerDetails({ offers: {} }, now), []);
  assert.deepEqual(details(offer('subscription'), offer('rent', '8k', 'not a date'), offer('buy', null, '2026-01-01T00:00:00Z')), []);
  assert.deepEqual(details(offer('subscription', 'hd', '2026-01-01T00:00:00Z')), [{ type: 'subscription', quality: 'hd', leaves: null }]);
});
