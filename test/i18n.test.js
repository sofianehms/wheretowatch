import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { applyStaticStrings, countryName, formatDate, getLocale, languageName, setLocale, t } from '../src/i18n/strings.js';

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

test('static translations replace existing root text and descendant attributes', () => {
  const attributes = new Map([['placeholder', 'Old placeholder']]);
  const input = {
    dataset: { i18n: 'search.placeholder', i18nAttr: 'placeholder' },
    textContent: 'Existing text',
    setAttribute(name, value) {
      attributes.set(name, value);
    },
  };
  const root = {
    dataset: { i18n: 'common.name' },
    textContent: 'Old heading',
    matches: (selector) => selector === '[data-i18n]',
    querySelectorAll: (selector) => selector === '[data-i18n]' ? [input] : [],
  };

  applyStaticStrings(root);

  assert.equal(root.textContent, 'Where to Watch');
  assert.equal(attributes.get('placeholder'), 'Search');
  assert.equal(input.textContent, 'Existing text');
});

const trivia = /(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n\u2028\u2029]*)*/.source;
const propertyName = 'textContent|placeholder|title|alt|ariaLabel';
const property = String.raw`(?:\.${trivia}(?:${propertyName})\b|\[${trivia}(['"\x60])(?:${propertyName}|aria-label)\1${trivia}\])`;
const literal = /(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|\$(?!\{)|[^`\\$])*`)/.source;
const literalValue = String.raw`${trivia}(?:\(${trivia})*${literal}`;
const literalPatterns = [
  new RegExp(String.raw`${property}${trivia}(?:\+|\?\?|\|\||&&)?=${literalValue}`),
  new RegExp(String.raw`\bsetAttribute${trivia}\(${trivia}(['"\x60])aria-[\w-]+\1${trivia},${literalValue}`),
  new RegExp(String.raw`\bcreateTextNode${trivia}\(${literalValue}`),
];

test('render rule detects literal text and accepts translated values', () => {
  const literals = [
    "el.ariaLabel = 'Search'",
    "el.textContent = /* copy */ 'Search'",
    'el.placeholder = // copy\n ("Search")',
    'el.title ||= `Search`',
    "el.alt = 'Search'",
    "el['aria-label'] = 'Search'",
    "el.setAttribute('aria-label', /* copy */ 'Search')",
    "document.createTextNode(/* copy */ 'Search')",
  ];
  const allowed = [
    "el.ariaLabel = t('search.label')",
    "el.textContent = /* copy */ t('search.label')",
    "el['aria-label'] = label",
    "el.setAttribute('aria-label', t('search.label'))",
    "el.setAttribute('data-state', 'loading')",
    "document.createTextNode(t('search.label'))",
    'el.title = `${label}`',
  ];

  for (const source of literals) {
    assert.ok(literalPatterns.some((pattern) => pattern.test(source)), source);
  }
  for (const source of allowed) {
    assert.ok(literalPatterns.every((pattern) => !pattern.test(source)), source);
  }
});

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
