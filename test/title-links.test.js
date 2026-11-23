import test from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../scripts/serve.mjs';
import { hrefFor } from './states/title-links.js';

// The fallback list on the states page links each suggestion to a title: every link must open a title page.
test('fallback fixture links resolve to a served title page', async (t) => {
  const server = await startServer('.');
  t.after(() => server.close());
  const page = new URL('/test/states.html?view=search', `http://127.0.0.1:${server.address().port}`);
  for (const ref of ['movie/11', 'movie/17', 'tv/13', 'tv/16']) {
    const target = new URL(hrefFor({ ref }), page);
    const response = await fetch(target);
    assert.equal(response.status, 200, `${target} is not served`);
    assert.match(await response.text(), /class="title-head__name"/, `${target} is not a title page`);
    assert.equal(new URLSearchParams(target.search).get('ref'), ref);
  }
});
