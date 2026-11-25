import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const expectedDirectives = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'https://image.tmdb.org', 'data:'],
  'connect-src': ['https://api.themoviedb.org', 'https://api.movieofthenight.com'],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
};

const verifySource = readFileSync('scripts/verify.mjs', 'utf8');
const allowlist = verifySource.match(/const allowedOrigins = new Set\(\[([^\]]*)\]\)/);
assert.ok(allowlist, 'Origin allowlist not found in scripts/verify.mjs');
const allowedExternalOrigins = new Set(
  [...allowlist[1].matchAll(/['"](https?:\/\/[^'"]+)['"]/g)].map(([, origin]) => origin),
);

for (const file of ['index.html', 'about.html', 'test/states.html']) {
  test(`${file} defines a strict CSP before loading resources`, () => {
    const html = readFileSync(file, 'utf8').replace(/<!--[^]*?-->/g, '');
    const head = html.match(/<head\b[^>]*>([^]*?)<\/head>/i)?.[1];
    assert.ok(head, 'Missing head');
    const policies = [...head.matchAll(/<meta\b[^>]*\bhttp-equiv=["']Content-Security-Policy["'][^>]*>/gi)];
    assert.equal(policies.length, 1, 'Expected one CSP meta tag in the head');
    const [policy] = policies;
    assert.match(head.slice(0, policy.index), /^\s*(?:<meta\s+charset=["']utf-8["']>\s*)?$/i);
    const content = policy[0].match(/\bcontent="([^"]*)"/i)?.[1];
    assert.ok(content, 'Missing CSP content');
    assert.doesNotMatch(content, /'unsafe-(?:inline|eval)'/i);

    const directives = Object.create(null);
    for (const directive of content.split(';').map((part) => part.trim()).filter(Boolean)) {
      const [name, ...sources] = directive.split(/\s+/);
      assert.ok(!Object.hasOwn(directives, name), `Duplicate CSP directive: ${name}`);
      directives[name] = sources.sort();
    }
    assert.deepEqual({ ...directives }, Object.fromEntries(
      Object.entries(expectedDirectives).map(([name, sources]) => [name, [...sources].sort()]),
    ));
    const externalOrigins = Object.values(directives).flat().filter((source) => /^https?:\/\//.test(source));
    assert.deepEqual(new Set(externalOrigins), allowedExternalOrigins);
  });
}
