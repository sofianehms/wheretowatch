import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8').replace(/<!--[^]*?-->/g, '');
const index = read('index.html');
const notFound = read('404.html');
const manifest = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
const strings = readFileSync('src/i18n/en/common.js', 'utf8');
const meta = (html, name) => html.match(new RegExp(`<meta\\b[^>]*(?:name|property)="${name}"[^>]*>`, 'i'))?.[0];
const content = (tag) => tag?.match(/\bcontent="([^"]*)"/)?.[1];

for (const [file, html] of [['index.html', index], ['404.html', notFound]]) {
  test(`${file} has a short title, a short description and a language`, () => {
    const title = html.match(/<title\b[^>]*>([^<]*)<\/title>/)[1];
    assert.ok(title.length > 0 && title.length <= 60, `title length ${title.length}`);
    assert.match(html, /<html\b[^>]*\blang="en"/);
    assert.ok(content(meta(html, 'description')).length <= 160);
  });
}

test('index.html has a single h1 and the 404 page has a single h1', () => {
  assert.equal(index.match(/<h1\b/g).length, 1);
  assert.equal(notFound.match(/<h1\b/g).length, 1);
});

test('the displayed name is "wheretowatch" everywhere (D-08)', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.name, 'wheretowatch');
  assert.equal(manifest.name, 'wheretowatch');
  assert.equal(manifest.short_name, 'wheretowatch');
  assert.match(strings, /name: 'wheretowatch'/);
  assert.match(strings, /brand: 'wheretowatch'/);
  assert.match(index, /<title[^>]*>wheretowatch<\/title>/);
});

test('index.html carries relative share tags and no absolute URL', () => {
  assert.match(index, /<link rel="canonical" href="\.\/">/);
  assert.equal(content(meta(index, 'og:url')), './');
  assert.equal(content(meta(index, 'og:image')), 'assets/og-image.png');
  assert.equal(content(meta(index, 'twitter:card')), 'summary_large_image');
  assert.equal(content(meta(index, 'og:image:width')), '1200');
  assert.equal(content(meta(index, 'og:image:height')), '630');
});

test('the share image is a 1200x630 PNG', () => {
  const file = readFileSync('assets/og-image.png');
  assert.equal(file.toString('ascii', 1, 4), 'PNG');
  assert.equal(file.readUInt32BE(16), 1200);
  assert.equal(file.readUInt32BE(20), 630);
});

test('robots.txt allows everything', () => {
  const robots = readFileSync('robots.txt', 'utf8');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /^Disallow:\s*\S/m);
});

test('the 404 page links home, shares the CSP, the theme script and the stylesheets', () => {
  assert.match(notFound, /<a class="btn btn--primary" href="\.\/">/);
  assert.match(notFound, /<script src="src\/theme-boot\.js"><\/script>/);
  const csp = (html) => html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
  assert.equal(csp(notFound), csp(index));
  for (const sheet of ['design/tokens.css', 'src/styles.css']) assert.ok(notFound.includes(`href="${sheet}"`));
});
