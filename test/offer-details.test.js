import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDate, t } from '../src/i18n/strings.js';
import { offerDetails } from '../src/render/languages.js';

const now = Date.parse('2026-11-25T12:00:00Z');
const soon = '2026-12-31T12:00:00.000Z';
const later = '2027-02-01T12:00:00.000Z';
const date = (iso) => formatDate(new Date(iso));
const offer = (offerType, quality = null, expiresOn = null) => ({ offerType, quality, expiresOn });
const details = (...sa) => offerDetails({ offers: { sa } }, now);

test('an upcoming expiry is dated with formatDate', () => {
  assert.deepEqual(details(offer('subscription', 'hd', soon)), [{ type: 'subscription', quality: 'hd', leaves: date(soon) }]);
  assert.equal(t('title.offer.leaves', { date: date(soon) }), 'Leaves on 31 Dec 2026');
});

test('offers of one type and date share the best quality', () => {
  assert.deepEqual(details(offer('rent', 'sd'), offer('rent', 'uhd'), offer('rent', 'hd'), offer('rent')), [
    { type: 'rent', quality: 'uhd', leaves: null },
  ]);
  assert.equal(t('title.quality.uhd'), 'UHD');
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
