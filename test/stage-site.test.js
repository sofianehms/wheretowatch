import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startServer } from '../scripts/serve.mjs';

const script = fileURLToPath(new URL('../scripts/stage-site.mjs', import.meta.url));
const base = 'https://example.github.io/wheretowatch/';
const index = `<!doctype html><html><head>
<link href='https://previous.example/' rel='canonical'>
<meta content="https://previous.example/" property="og:url">
<meta property="og:image" content="./assets/share.png">
<link rel="stylesheet" href="design/tokens.css">
</head><body></body></html>`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.stage-site-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ['src', 'design']) fs.mkdirSync(path.join(root, directory));
  for (const [file, content] of Object.entries({
    'index.html': index,
    'manifest.webmanifest': '{}',
    'sw.js': '',
    'src/main.js': '',
    'design/tokens.css': '',
  })) fs.writeFileSync(path.join(root, file), content);
  return root;
}

function run(root, url = base) {
  return spawnSync(process.execPath, [script, url], { cwd: root, encoding: 'utf8' });
}

test('stages only site entries and publishes instance URLs under a sub-path', async (t) => {
  const root = fixture(t);
  for (const directory of ['test', 'scripts', 'node_modules', 'docs', 'assets', 'icons', '_site']) {
    fs.mkdirSync(path.join(root, directory));
  }
  for (const file of ['package.json', '404.html', 'robots.txt', 'icon.svg', 'assets/share.png', '_site/stale.html']) {
    fs.writeFileSync(path.join(root, file), '');
  }
  fs.writeFileSync(path.join(root, 'about.html'), index);
  const result = run(root, base.slice(0, -1));
  assert.equal(result.status, 0, result.stderr);
  const output = path.join(root, '_site');
  assert.deepEqual(fs.readdirSync(output).sort(), [
    '404.html', 'about.html', 'assets', 'design', 'icon.svg', 'icons', 'index.html',
    'manifest.webmanifest', 'robots.txt', 'sitemap.xml', 'src', 'sw.js',
  ]);
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), index);

  const server = await startServer(output, 0, { prefix: '/wheretowatch' });
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [file, url] of [['', base], ['about.html', base + 'about.html']]) {
    const response = await fetch(`${origin}/wheretowatch/${file}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`rel="canonical" href="${url}"`));
    assert.ok(html.includes(`property="og:url" content="${url}"`));
    assert.ok(html.includes(`property="og:image" content="${base}assets/share.png"`));
  }
  for (const file of ['design/tokens.css', 'src/main.js', 'manifest.webmanifest', 'sw.js', 'assets/share.png']) {
    const response = await fetch(`${origin}/wheretowatch/${file}`);
    assert.equal(response.status, 200, file);
  }
  const sitemap = await fetch(`${origin}/wheretowatch/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.deepEqual([...((await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g))].map((match) => match[1]),
    [base, base + 'about.html']);
});

test('stages a minimal site without optional files', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'index.html'), '<html><head></head><body></body></html>');
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(path.join(root, '_site')).sort(),
    ['design', 'index.html', 'manifest.webmanifest', 'sitemap.xml', 'src', 'sw.js']);
  const html = fs.readFileSync(path.join(root, '_site/index.html'), 'utf8');
  assert.ok(html.includes(`rel="canonical" href="${base}"`));
  assert.ok(html.includes(`property="og:url" content="${base}"`));
});

test('reports each missing required entry', (t) => {
  const root = fixture(t);
  for (const entry of ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'design']) {
    const file = path.join(root, entry);
    const backup = file + '.bak';
    fs.renameSync(file, backup);
    const result = run(root);
    fs.renameSync(backup, file);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`Missing required site entry: ${entry}`));
    assert.ok(!fs.existsSync(path.join(root, '_site')));
  }
});

test('Pages workflow only triggers on main pushes and manual dispatch', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const lines = workflow.split(/\r?\n/).map((line) => line.replace(/(?:^|\s+)#.*$/, '').trimEnd())
    .filter(Boolean);
  const start = lines.indexOf('on:');
  assert.ok(start >= 0, 'Workflow must declare its triggers');
  const end = lines.findIndex((line, i) => i > start && /^\S/.test(line));
  assert.deepEqual(lines.slice(start + 1, end), [
    '  push:',
    '    branches: [main]',
    '  workflow_dispatch:',
  ]);
  assert.match(workflow, /^permissions:\s*\n(?:  [^\n]+\n)*?  pages: write$/m);
  assert.match(workflow, /^permissions:\s*\n(?:  [^\n]+\n)*?  id-token: write$/m);
  assert.match(workflow, /^    environment:\n      name: github-pages$/m);
  assert.match(workflow, /^    if: github\.ref == 'refs\/heads\/main'$/m);
});
