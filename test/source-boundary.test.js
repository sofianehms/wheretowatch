import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'acorn';

const repository = fileURLToPath(new URL('../', import.meta.url));
const ignoredDirectories = new Set(['.git', '.verify', 'node_modules']);

function* moduleFiles(directory = '') {
  for (const entry of readdirSync(join(repository, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    // Hidden directories hold tooling and scratch data (other tests create `.probe-test-*` here while this one runs).
    if (entry.isDirectory() && !entry.name.startsWith('.') && !ignoredDirectories.has(entry.name) && path !== 'src/api') {
      yield* moduleFiles(path);
    } else if (entry.isFile() && /\.[cm]?js$/.test(entry.name)) {
      yield path;
    }
  }
}

function* imports(node) {
  if (['ImportDeclaration', 'ImportExpression', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) {
    const source = node.source;
    if (source?.type === 'Literal') yield source.value;
    if (source?.type === 'TemplateLiteral' && source.expressions.length === 0) {
      yield source.quasis[0].value.cooked;
    }
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) if (child?.type) yield* imports(child);
    } else if (value?.type) {
      yield* imports(value);
    }
  }
}

function violations(file, source) {
  if (file === 'src/compose.js' || file === 'test/tmdb-search.test.js' || file.startsWith('src/api/')) return [];
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  return [...imports(tree)]
    .filter((specifier) => /(?:^|\/)(?:tmdb|streaming)\.js(?:[?#].*)?$/.test(specifier))
    .map((specifier) => `${file} imports ${specifier}`);
}

test('provider clients may only be imported inside src/api or by src/compose.js', () => {
  const offendingImports = [...moduleFiles()].flatMap((file) => {
    return violations(file, readFileSync(join(repository, file), 'utf8'));
  });
  assert.deepEqual(offendingImports, []);
});

test('boundary rejects direct and indirect module declarations in app layers and permits composition', () => {
  const declarations = [
    "import '../api/tmdb.js';",
    "export { client } from '../api/streaming.js';",
    "export * from '../api/tmdb.js';",
    "import('../api/streaming.js');",
    'import(`../api/tmdb.js`);',
  ].join('\n');
  for (const file of [
    'src/render/title.js',
    'src/core/search.js',
    'src/settings/keys.js',
    'src/state.js',
    'src/main.js',
  ]) {
    assert.equal(violations(file, declarations).length, 5, file);
  }
  assert.deepEqual(violations('src/compose.js', declarations), []);
  assert.deepEqual(violations('src/api/sources.js', declarations), []);
});
