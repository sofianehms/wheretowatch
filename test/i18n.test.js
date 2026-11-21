import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { countryName, formatDate, getLocale, languageName, setLocale, t } from '../src/i18n/strings.js';

test('translations interpolate named parameters and preserve missing placeholders', () => {
  assert.equal(t('search.none.title', { q: '$& {other}' }), 'No movie or series matches “$& {other}”.');
  assert.equal(t('search.none.title', { q: 0 }), 'No movie or series matches “0”.');
  assert.equal(t('search.none.title'), 'No movie or series matches “{q}”.');
});

test('unknown translations fall back to their keys', () => {
  for (const key of ['search.missing', 'unknown.label', 'missing', 'search.toString', 'constructor.name']) {
    assert.equal(t(key), key);
  }
});

test('unsupported locales fall back to English', () => {
  assert.equal(getLocale(), 'en');
  setLocale('fr');
  assert.equal(getLocale(), 'en');
  assert.equal(t('search.label'), 'Search');
  setLocale('en');
  assert.equal(getLocale(), 'en');
});

test('dates use a day, abbreviated month and year', () => {
  assert.equal(formatDate(new Date(2026, 10, 21)), '21 Nov 2026');
  assert.equal(formatDate(new Date(2026, 0, 5)), '5 Jan 2026');
});

test('country and language names fall back to the original code', () => {
  assert.equal(countryName('FR'), 'France');
  assert.equal(languageName('en'), 'English');
  assert.equal(countryName('XX'), 'XX');
  assert.equal(languageName('qaa'), 'qaa');
  assert.equal(countryName('invalid_region'), 'invalid_region');
  assert.equal(languageName('invalid_language'), 'invalid_language');
});

const property = String.raw`(?:\.\s*(?:textContent|placeholder|title|alt)\b|\[\s*(['"\`])(?:textContent|placeholder|title|alt|aria-label)\1\s*\])`;
const literal = /(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|\$(?!\{)|[^`\\$])*`)/.source;
const literalPatterns = [
  new RegExp(property + String.raw`\s*(?:\+|\?\?|\|\||&&)?=\s*\(*\s*` + literal),
  new RegExp(String.raw`\bsetAttribute\s*\(\s*(['"\`])aria-[\w-]+\1\s*,\s*\(*\s*` + literal),
  new RegExp(String.raw`\bcreateTextNode\s*\(\s*\(*\s*` + literal),
];

test('render modules do not assign literal interface text', () => {
  const renderDir = 'src/render';
  // The shell has no render modules yet.
  const files = existsSync(renderDir) ? readdirSync(renderDir, { recursive: true }) : [];
  for (const entry of files.filter((file) => /\.[cm]?js$/.test(file))) {
    const file = join(renderDir, entry);
    const source = readFileSync(file, 'utf8');
    for (const pattern of literalPatterns) {
      const match = pattern.exec(source);
      assert.ok(!match, `${file}:${source.slice(0, match?.index).split('\n').length}: ${match?.[0]}`);
    }
  }
});
