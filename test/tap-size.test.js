import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnderTapSize } from './states/kit.js';

test('the tap size check tolerates rounding noise but not a smaller control', () => {
  assert.equal(isUnderTapSize(44), false);
  assert.equal(isUnderTapSize(43.999755859375), false);
  assert.equal(isUnderTapSize(43.98), true);
  assert.equal(isUnderTapSize(43.5), true);
});
