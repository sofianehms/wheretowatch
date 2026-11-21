import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const lint = fileURLToPath(new URL('../scripts/lint.mjs', import.meta.url));

function runLint(t, files) {
  const cwd = mkdtempSync(join(tmpdir(), 'wheretowatch-lint-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ type: 'module' }));
  for (const [name, contents] of files) {
    const file = join(cwd, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  const result = spawnSync(process.execPath, [lint], { cwd, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

const count = '1' + '90';
const cases = [
  ['src/view.js', 'node.inner' + 'HTML = value;', 'security: forbidden JavaScript API inner' + 'HTML'],
  ['src/view.js', 'node["outer' + 'HTML"] = value;', 'security: forbidden JavaScript API outer' + 'HTML'],
  ['src/view.js', 'node.insertAdjacent' + 'HTML(position, value);', 'security: forbidden JavaScript API insertAdjacent' + 'HTML'],
  ['src/view.js', 'ev' + 'al(value);', 'security: forbidden JavaScript API ev' + 'al'],
  ['src/view.js', 'new /* comment */ ' + 'Function(value);', 'security: forbidden JavaScript API new ' + 'Function'],
  ['index.html', '<button ON' + 'CLICK = "run()">Run</button>', 'security: inline on' + 'click attribute'],
  ['index.html', '<div st' + 'yle=display:none></div>', 'security: inline st' + 'yle attribute'],
  ['index.html', '<scr' + 'ipt>run()</scr' + 'ipt>', 'security: inline <scr' + 'ipt> tag'],
  ['index.html', '<st' + 'yle>p { display: none }</st' + 'yle>', 'security: inline <st' + 'yle> tag'],
  ['index.html', '<a href=' + '"/page.html">Page</a>', 'portability: absolute href path'],
  ['index.html', '<img src = ' + '/logo.svg>', 'portability: absolute src path'],
  ['src/view.js', 'const logo = `<img src="' + '/logo.svg">`;', 'portability: absolute src path'],
  ['src/view.js', 'import ' + "'/module.js';", 'portability: absolute module path'],
  ['src/view.js', "import { value } from " + "'/module.js';", 'portability: absolute module path'],
  ['src/view.js', 'import(' + "'/module.js');", 'portability: absolute module path'],
  ['src/view.js', 'const countries = 6' + '5;', 'accuracy: hard-coded country count 6' + '5'],
  ['src/view.js', 'const countries = 6' + '6;', 'accuracy: hard-coded country count 6' + '6'],
  ['src/view.js', 'const summary = `Count: ${' + count + '}`;', 'accuracy: hard-coded country count ' + count],
  ['assets/first-party/logo.svg', '<svg fill="' + '#' + 'abc"></svg>', 'hard-coded color'],
  ['src/view.js', 'const ' + '=;', 'syntax error'],
];

for (const [file, contents, diagnostic] of cases) {
  test(`lint rejects ${file} with ${diagnostic}`, (t) => {
    const result = runLint(t, [[file, contents]]);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.includes(`lint: ${file}: ${diagnostic}`), result.stderr);
  });
}

test('lint accepts attribution colors and country counts outside executable source', (t) => {
  const result = runLint(t, [
    ['assets/third-party/brand/logo.svg', '<svg fill="' + '#' + 'abc"></svg>'],
    ['src/styles.css', '.card { width: ' + count + 'px; }'],
    ['src/i18n/en.js', 'export const example = ' + count + ';'],
    ['src/view.js', [
      'import "./module.js";',
      '// ' + count,
      '/* ' + count + ' */',
      'const label = "' + count + '";',
      'const summary = `' + count + ' countries: ${label}`;',
    ].join('\n')],
    ['index.html', [
      '<!-- <a href=' + '"/comment">Comment</a> -->',
      '<scr' + 'ipt src="./src/view.js"></scr' + 'ipt>',
      '<a href="https://example.org/page">Example</a>',
    ].join('\n')],
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no problem/);
});
