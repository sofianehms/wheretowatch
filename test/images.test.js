import assert from 'node:assert/strict';
import test from 'node:test';
import { posterSrcset } from '../src/core/images.js';
import configuration from './fixtures/tmdb/images-configuration.js';

const base = configuration.images.secure_base_url;
const path = '/glass-orchard.jpg';

test('uses bounded density candidates and a small default URL for thumbnails', () => {
  assert.deepEqual(posterSrcset(path, 'thumb', configuration.images), {
    src: `${base}w92${path}`,
    srcset: `${base}w92${path} 1x, ${base}w154${path} 2x, ${base}w185${path} 3x`,
  });
});

test('uses w342 for detail and permits w500 only as the 3x candidate', () => {
  const poster = posterSrcset(path, 'detail', configuration.images);
  assert.deepEqual(poster, {
    src: `${base}w342${path}`,
    srcset: `${base}w342${path} 1x, ${base}w500${path} 3x`,
  });
  assert.doesNotMatch(poster.srcset, /original|w780|api_key/);
});

test('uses the configured secure base and filters unsupported sizes', () => {
  const secure_base_url = 'https://image.tmdb.org/custom/posters/';
  assert.deepEqual(posterSrcset(path, 'thumb', { secure_base_url, poster_sizes: ['w154', 'original'] }), {
    src: `${secure_base_url}w154${path}`,
    srcset: `${secure_base_url}w154${path} 2x`,
  });
});

test('falls back to documented defaults without usable configuration', () => {
  const fallback = posterSrcset(path, 'detail');
  assert.equal(fallback.src, `${base}w342${path}`);
  assert.deepEqual(posterSrcset(path, 'detail', null), fallback);
  assert.deepEqual(posterSrcset(path, 'detail', { poster_sizes: ['w500', 'original'] }), fallback);
  assert.deepEqual(posterSrcset(path, 'detail', {
    secure_base_url: `${base}original/`,
    poster_sizes: ['w780', 'original'],
  }), fallback);
  assert.deepEqual(posterSrcset(path, 'detail', {
    secure_base_url: configuration.images.base_url,
  }), fallback);
  assert.deepEqual(posterSrcset(path, 'detail', {
    secure_base_url: `${base}?api_key=fixture-authorization`,
  }), fallback);
});

test('returns null for absent or invalid poster paths', () => {
  for (const invalid of [null, undefined, '', '//other.example/poster.jpg', '/original.jpg', '/poster.jpg?api_key=synthetic']) {
    assert.equal(posterSrcset(invalid, 'thumb'), null);
  }
});

test('falls back when a configured base path contains api_key', () => {
  const fallback = posterSrcset(path, 'detail');
  for (const segment of ['api_key', 'API_KEY']) {
    assert.deepEqual(posterSrcset(path, 'detail', {
      secure_base_url: `https://image.tmdb.org/${segment}/`,
    }), fallback);
  }
});

test('returns null when a poster filename contains api_key', () => {
  for (const filename of ['/api_key.jpg', '/poster-API_KEY.jpg']) {
    assert.equal(posterSrcset(filename, 'thumb'), null);
  }
});
