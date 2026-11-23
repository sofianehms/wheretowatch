import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'acorn';

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

  assert.equal(root.textContent, 'wheretowatch');
  assert.equal(attributes.get('placeholder'), 'Search');
  assert.equal(input.textContent, 'Existing text');
});

const textProperty = /^(?:textContent|placeholder|title|alt|ariaLabel|aria-label)$/;
const ariaAttribute = /^aria-[\w-]+$/;

function stringLiteral(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
}

function memberName(node) {
  if (node.type !== 'MemberExpression') return;
  return node.computed ? stringLiteral(node.property) : node.property.name;
}

function findLiteralText(source) {
  const pending = [parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true })];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node.type === 'AssignmentExpression' && textProperty.test(memberName(node.left)) &&
        typeof stringLiteral(node.right) === 'string') {
      return node;
    }
    if (node.type === 'CallExpression') {
      const name = node.callee.type === 'Identifier' ? node.callee.name : memberName(node.callee);
      const [first, second] = node.arguments;
      if ((name === 'createTextNode' && typeof stringLiteral(first) === 'string') ||
          (name === 'setAttribute' && ariaAttribute.test(stringLiteral(first)) &&
           typeof stringLiteral(second) === 'string')) {
        return node;
      }
    }
    for (const child of Object.values(node).flat()) {
      if (child?.type) pending.push(child);
    }
  }
}

test('render rule detects literal text and accepts translated values', () => {
  const literals = [
    "el.ariaLabel = 'Search'",
    "el.textContent = /* copy */ 'Search'",
    'el.placeholder = // copy\n ("Search")',
    'el.title ||= `Search`',
    "el.alt = 'Search'",
    "el['aria-label'] = 'Search'",
    "el.setAttribute('aria-label', /* copy */ 'Search')",
    "el['setAttribute']('aria-label', 'Search')",
    "document.createTextNode(/* copy */ 'Search')",
    "document.createTextNode?.('Search')",
    '`${document?.["createTextNode"](`Search`)}`',
  ];
  const allowed = [
    "el.ariaLabel = t('search.label')",
    "el.textContent = /* copy */ t('search.label')",
    "el['aria-label'] = label",
    "el.setAttribute('aria-label', t('search.label'))",
    "el.setAttribute('data-state', 'loading')",
    "document.createTextNode(t('search.label'))",
    'el.title = `${label}`',
    "// el.textContent = 'Search'",
    "/* document.createTextNode?.('Search') */",
    'const example = "el.textContent = \'Search\'";',
    'const example = /el.textContent = \'Search\'/;',
    "el[setAttribute]('aria-label', 'Search')",
  ];

  for (const source of literals) {
    assert.ok(findLiteralText(source), source);
  }
  for (const source of allowed) {
    assert.equal(findLiteralText(source), undefined, source);
  }
});

test('render modules do not assign literal interface text', () => {
  const renderDir = 'src/render';
  // The shell has no render modules yet.
  const files = existsSync(renderDir) ? readdirSync(renderDir, { recursive: true }) : [];
  for (const entry of files.filter((file) => /\.[cm]?js$/.test(file))) {
    const file = join(renderDir, entry);
    const source = readFileSync(file, 'utf8');
    const match = findLiteralText(source);
    if (match) {
      assert.fail(`${file}:${match.loc.start.line}: ${source.slice(match.start, match.end)}`);
    }
  }
});
