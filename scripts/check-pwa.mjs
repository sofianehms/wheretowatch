// Offline scenario of the installed app: one visit, then no network at all. Called by scripts/verify.mjs.
import path from 'node:path';
import movieDetails from '../test/fixtures/tmdb/movie-details.js';

const viewport = { width: 390, height: 844 };
const api = 'https://api.themoviedb.org/';

/**
 * @param {{browser: import('playwright-core').Browser, origin: string, shotsDir: string}} options
 * @returns {Promise<string[]>} The problems found.
 */
export async function checkPwa({ browser, origin, shotsDir }) {
  const problems = new Set();
  const expect = (condition, problem) => { if (!condition) problems.add(problem); };
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  try {
    let offline = false;
    const offlineRequests = [];
    await ctx.addInitScript(() => localStorage.setItem('wtw.key.tmdb', 'fixture-placeholder'));
    ctx.on('request', (request) => {
      if (offline && new URL(request.url()).origin !== origin) offlineRequests.push(request.url());
    });
    const fixtures = {
      '/3/configuration': {},
      '/3/movie/238': { ...movieDetails, id: 238, poster_path: null },
      '/3/movie/238/watch/providers': { results: { FR: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] } } },
      '/3/watch/providers/regions': { results: [{ iso_3166_1: 'FR' }] },
    };
    await ctx.route(`${api}3/**`, (route) => route.fulfill({ json: fixtures[new URL(route.request().url()).pathname] ?? {} }));
    const page = await ctx.newPage();
    page.on('console', (message) => { if (message.type() === 'error') problems.add(`console error: ${message.text()} ${message.location().url}`); });
    page.on('pageerror', (error) => problems.add(`page error: ${error.message}`));

    // First visit: one title is viewed and the service worker takes the shell.
    const verdict = page.locator('#title .verdict__headline', { hasText: 'Netflix' });
    await page.goto(`${origin}/?t=movie/238`);
    await verdict.waitFor();
    // `ready` resolves once a worker is active, possibly still activating; the install has cached the shell by then.
    await page.evaluate(async () => {
      const { active } = await navigator.serviceWorker.ready;
      while (active.state !== 'activated') {
        await new Promise((resolve) => active.addEventListener('statechange', resolve, { once: true }));
      }
    });

    offline = true;
    await ctx.setOffline(true);
    await page.goto(`${origin}/`);
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).waitFor();
    const field = page.getByPlaceholder('Connection required');
    await field.waitFor();
    expect(await field.isDisabled(), 'the search field is not disabled offline');
    await page.getByText('You’re offline').waitFor();
    const entry = page.getByRole('link', { name: new RegExp(`${movieDetails.title}.*data from \\d{1,2} \\w{3} \\d{4}`) });
    await entry.waitFor();
    await page.screenshot({ path: path.join(shotsDir, 'pwa-offline-list.png'), fullPage: true });
    await entry.click();
    await verdict.waitFor();
    expect(/\d{1,2} [A-Z][a-z]{2} \d{4}/.test(await page.locator('#title .verdict__detail').textContent()), 'the saved title page has no date');
    await page.screenshot({ path: path.join(shotsDir, 'pwa-offline-title.png'), fullPage: true });

    // A title link opens without a network too, and shows the saved page.
    await page.goto(`${origin}/?t=movie/238`);
    await verdict.waitFor();
    expect(offlineRequests.length === 0, `requests made offline: ${offlineRequests.join(', ')}`);

    offline = false;
    await ctx.setOffline(false);
    await page.getByPlaceholder('Search').waitFor();
    expect(await page.getByPlaceholder('Search').isEnabled(), 'the search is not enabled when the network is back');
    await page.getByText('You’re offline').waitFor({ state: 'detached' });
  } catch (error) {
    problems.add(error.message);
  } finally {
    await ctx.close();
  }
  return [...problems];
}
