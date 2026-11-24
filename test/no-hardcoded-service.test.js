import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { tokenizer } from 'acorn';
import { SERVICE_MAP } from '../src/data/services.js';

const src = new URL('../src/', import.meta.url);
const entries = Object.values(SERVICE_MAP);
const names = new Set(entries.flatMap(({ key, name, saServiceId }) => [key, name, saServiceId]));
const providerIds = new Set(entries.map(({ tmdbProviderId }) => tmdbProviderId));
const providerIdStrings = new Set([...providerIds].map(String));
const unrelatedNumbers = new Map([
  ['api/tmdb.js', '        .slice(0, 8)'],
  ['render/search.js', 'const MAX_SUGGESTIONS = 8;'],
]);

function* sourceFiles(directory = '') {
  for (const entry of readdirSync(new URL(directory, src), { withFileTypes: true })) {
    const path = directory + entry.name;
    if (path === 'i18n' || path === 'data/services.js') continue;
    if (entry.isDirectory()) yield* sourceFiles(path + '/');
    if (entry.isFile()) yield path;
  }
}

function hardcodedServices(path, source) {
  const violations = [];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(source)) {
      violations.push(`${path}: ${name}`);
    }
  }

  if (!path.endsWith('.js')) return violations;
  const lines = source.split('\n');
  for (const token of tokenizer(source, { ecmaVersion: 'latest', locations: true })) {
    const kind = token.type.label;
    const isProviderId = (kind === 'num' && providerIds.has(token.value))
      || (['string', 'template'].includes(kind) && providerIdStrings.has(token.value));
    if (!isProviderId) continue;
    const line = lines[token.loc.start.line - 1];
    if (line === unrelatedNumbers.get(path)) continue;
    violations.push(`${path}:${token.loc.start.line}: ${token.value}`);
  }
  return violations;
}

test('source files reference streaming services through the registry or translations', () => {
  assert.deepEqual([...sourceFiles()].flatMap((path) => hardcodedServices(path, readFileSync(new URL(path, src), 'utf8'))), []);
});

test('detects a hard-coded service by name, string ID or numeric provider ID', () => {
  const { name, saServiceId, tmdbProviderId } = entries[0];
  const path = 'core/example.js';
  for (const literal of [name, saServiceId, tmdbProviderId, String(tmdbProviderId)]) {
    assert.ok(hardcodedServices(path, `const service = ${JSON.stringify(literal)};`).length);
  }
  assert.ok(hardcodedServices(path, 'const service = `' + tmdbProviderId + '`;').length);
});
