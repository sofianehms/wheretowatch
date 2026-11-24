import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanUrl, readLaunchParams } from '../src/core/url.js';

test('readLaunchParams decodes the query and trims it', () => {
  assert.deepEqual(readLaunchParams('?q=inception'), { q: 'inception', t: null });
  assert.deepEqual(readLaunchParams('?q=the%20matrix'), { q: 'the matrix', t: null });
  assert.deepEqual(readLaunchParams('?q=the+matrix'), { q: 'the matrix', t: null });
  assert.deepEqual(readLaunchParams('?q=%20%20dune%0A'), { q: 'dune', t: null });
});

test('readLaunchParams keeps special characters and non-Latin text', () => {
  assert.equal(readLaunchParams('?q=%C3%89l%C3%A8ve%20%26%20co%3F%23').q, 'Élève & co?#');
  assert.equal(readLaunchParams(`?q=${encodeURIComponent('千と千尋の神隠し')}`).q, '千と千尋の神隠し');
  assert.equal(readLaunchParams('?q=<b>x</b>').q, '<b>x</b>');
});

test('readLaunchParams caps the query at 200 characters', () => {
  assert.equal(readLaunchParams(`?q=${'a'.repeat(500)}`).q.length, 200);
  // Never splits an astral character.
  assert.equal([...readLaunchParams(`?q=${'😀'.repeat(300)}`).q].length, 200);
  // Trailing spaces left by the cut are trimmed.
  assert.equal(readLaunchParams(`?q=${'a'.repeat(199)}%20b`).q, 'a'.repeat(199));
});

test('readLaunchParams reports a missing or blank parameter as null', () => {
  assert.deepEqual(readLaunchParams(''), { q: null, t: null });
  assert.deepEqual(readLaunchParams('?other=1'), { q: null, t: null });
  assert.deepEqual(readLaunchParams('?q='), { q: null, t: null });
  assert.deepEqual(readLaunchParams('?q=%20%20'), { q: null, t: null });
});

test('readLaunchParams uses the first q when it is repeated', () => {
  assert.equal(readLaunchParams('?q=one&q=two').q, 'one');
});

test('readLaunchParams accepts typed movie and TV references', () => {
  assert.deepEqual(readLaunchParams('?t=movie/238'), { q: null, t: 'movie/238' });
  assert.deepEqual(readLaunchParams('?t=tv%2F1399'), { q: null, t: 'tv/1399' });
});

test('readLaunchParams ignores malformed title references', () => {
  for (const ref of ['238', 'tv/abc', 'movie/238/extra', 'movie/../238', 'tv/1?x=1', 'tv/1<script>', 'tv/1\n']) {
    assert.equal(readLaunchParams(`?t=${encodeURIComponent(ref)}`).t, null, ref);
  }
});

test('readLaunchParams prioritizes a valid title and falls back to q for an invalid title', () => {
  assert.deepEqual(readLaunchParams('?q=dune&t=movie/238'), { q: null, t: 'movie/238' });
  assert.deepEqual(readLaunchParams('?q=dune&t=tv/abc'), { q: 'dune', t: null });
});

test('cleanUrl drops the query and keeps the path', () => {
  assert.equal(cleanUrl({ pathname: '/', search: '?q=inception', hash: '' }), '/');
  assert.equal(cleanUrl({ pathname: '/', search: '', hash: '' }), '/');
});

test('cleanUrl keeps a subpath, other parameters and the fragment', () => {
  assert.equal(cleanUrl({ pathname: '/wheretowatch/', search: '?q=dune', hash: '' }), '/wheretowatch/');
  assert.equal(cleanUrl({ pathname: '/wheretowatch/index.html', search: '?q=a%26b&x=1', hash: '#top' }), '/wheretowatch/index.html?x=1#top');
  assert.equal(cleanUrl({ pathname: '/wheretowatch/', search: '?q=dune' }), '/wheretowatch/');
  assert.equal(cleanUrl({ pathname: '/wheretowatch/', search: '?t=movie/238&q=dune&x=1', hash: '#top' }), '/wheretowatch/?x=1#top');
});
