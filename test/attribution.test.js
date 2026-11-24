import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { t } from '../src/i18n/strings.js';

// Texts and URL fixed by the attribution requirements, compared character by character.
const TMDB = 'This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.';
const JUSTWATCH = 'Availability data: JustWatch';
const NIGHT = 'Streaming availability information is provided by Streaming Availability API by Movie of the Night';
const NIGHT_URL = 'https://www.movieofthenight.com/about/api';

test('the attribution texts match the required wording exactly', () => {
  assert.equal(t('common.attribution.tmdb'), TMDB);
  assert.equal(t('common.attribution.justwatch'), JUSTWATCH);
  assert.equal(t('common.attribution.night'), NIGHT);
  assert.equal(t('common.attribution.nightUrl'), NIGHT_URL);
  assert.ok(t('common.attribution.night').endsWith(t('common.attribution.nightLink')));
});

test('no JustWatch or TMDB logo is shipped or rendered as an image', () => {
  const renderer = readFileSync('src/render/attribution.js', 'utf8');
  assert.ok(!/createElementNS|<img|'img'|'svg'|icon\(|\.(?:svg|png|jpe?g|webp)/i.test(renderer), 'The attribution renderer must only emit text.');
  const shipped = ['assets', 'icons', 'design'].flatMap((dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }) : []));
  assert.deepEqual(shipped.filter((file) => /tmdb|justwatch|movieofthenight/i.test(String(file)) && /\.(?:svg|png|jpe?g|webp|gif|avif)$/i.test(String(file))), []);
});
