// Scenarios of the installed app, called by scripts/verify.mjs: offline (one visit, then no network at all)
// and update (the server starts serving a new version).
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { startServer } from './serve.mjs';
import movieDetails from '../test/fixtures/tmdb/movie-details.js';

const viewport = { width: 390, height: 844 };
const api = 'https://api.themoviedb.org/';

// `ready` resolves once a worker is active, possibly still activating; the install has cached the shell by then.
const workerActivated = (page) => page.evaluate(async () => {
  const { active } = await navigator.serviceWorker.ready;
  while (active.state !== 'activated') {
    await new Promise((resolve) => active.addEventListener('statechange', resolve, { once: true }));
  }
});

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
    await workerActivated(page);

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

/**
 * Visit in two tabs, change the served cache name, reload, accept the banner: unsaved Settings edits, in either tab,
 * hold the update back; without them the new version runs after a single reload of each tab.
 * @param {{browser: import('playwright-core').Browser, root: string, shotsDir: string}} options
 * @returns {Promise<string[]>} The problems found.
 */
export async function checkUpdate({ browser, root, shotsDir }) {
  const problems = new Set();
  const expect = (condition, problem) => { if (!condition) problems.add(problem); };
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const current = /const CACHE = '(shell-v\d+)'/.exec(worker)[1];
  const next = `${current}0`;
  let served = worker;
  const server = await startServer(root, 0, { override: (pathname) => (pathname === '/sw.js' ? served : undefined) });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  try {
    await ctx.route(`${api}3/**`, (route) => route.fulfill({ json: {} }));
    const page = await ctx.newPage();
    page.on('console', (message) => { if (message.type() === 'error') problems.add(`console error: ${message.text()}`); });
    page.on('pageerror', (error) => problems.add(`page error: ${error.message}`));
    let loads = 0;
    page.on('load', () => { loads += 1; });
    const banner = page.locator('#update .banner', { hasText: 'A new version is available' });

    await page.goto(`${origin}/`);
    await workerActivated(page);
    // A second load puts the page under the control of the worker, as on any later visit.
    await page.reload();
    expect(await banner.count() === 0, 'the banner shows without a new version');
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'the page is not controlled before the update');

    // Another tab of the app, left on Settings later on.
    const other = await ctx.newPage();
    other.on('pageerror', (error) => problems.add(`page error: ${error.message}`));
    let otherLoads = 0;
    other.on('load', () => { otherLoads += 1; });
    await other.addInitScript(() => localStorage.setItem('wtw.key.tmdb', 'fixture-placeholder'));
    await other.goto(`${origin}/`);
    await page.bringToFront();

    served = worker.replace(current, next);
    await page.reload();
    await banner.waitFor();
    expect((await page.evaluate(() => caches.keys())).includes(current), 'the old version was dropped before being asked');
    expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)),
      'the new version did not wait');
    expect(await page.locator('html').getAttribute('data-theme') === 'dark', 'dark is not the default theme');
    for (const theme of ['dark', 'light']) {
      await page.locator('html').evaluate((element, value) => element.setAttribute('data-theme', value), theme);
      expect(await page.evaluate((width) => document.documentElement.scrollWidth <= width, viewport.width),
        `horizontal scroll with the banner (${theme})`);
      const { violations } = await new AxeBuilder({ page }).analyze();
      violations.forEach(({ id }) => problems.add(`axe with the banner (${theme}): ${id}`));
      await page.screenshot({ path: path.join(shotsDir, `pwa-update-${theme}.png`), fullPage: true });
    }

    // A draft in the other tab, then in this one: nothing is activated, nothing reloads, the draft stays.
    const reload = banner.getByRole('button', { name: 'Reload' });
    const blocked = banner.filter({ hasText: 'unsaved changes' });
    const heldBack = async (tab, where) => {
      await tab.bringToFront();
      await tab.getByRole('button', { name: 'Settings' }).click();
      const draft = tab.locator('#settings input[type="password"]').nth(1);
      await draft.fill('draft');
      loads = otherLoads = 0;
      await page.bringToFront();
      await reload.click();
      await blocked.waitFor();
      expect(await reload.evaluate((element) => element === document.activeElement), 'the focus left "Reload"');
      await page.waitForTimeout(500);
      expect(loads === 0 && otherLoads === 0, `a tab reloaded despite a draft in ${where}`);
      expect(await draft.inputValue() === 'draft', `the draft in ${where} was lost`);
      expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)),
        `the new version was activated despite a draft in ${where}`);
      await page.screenshot({ path: path.join(shotsDir, 'pwa-update-held-back.png'), fullPage: true });
      await tab.getByRole('button', { name: 'Back to search' }).click();
    };
    await heldBack(other, 'another tab');
    await heldBack(page, 'this tab');

    loads = otherLoads = 0;
    const reloaded = Promise.all([page.waitForEvent('load'), other.waitForEvent('load')]);
    await reload.click();
    await reloaded;
    await workerActivated(page);
    // Leaves time for an unwanted second reload to happen.
    await page.waitForTimeout(1500);
    expect(loads === 1, `${loads} reloads after "Reload", expected 1`);
    expect(otherLoads === 1, `${otherLoads} reloads of the other tab, expected 1`);
    const state = await page.evaluate(async () => ({
      caches: await caches.keys(),
      waiting: Boolean((await navigator.serviceWorker.getRegistration()).waiting),
      controlled: Boolean(navigator.serviceWorker.controller),
    }));
    expect(state.caches.join() === next, `caches after the update: ${state.caches.join()}, expected ${next}`);
    expect(!state.waiting && state.controlled, 'the new version is not the active one');
    expect(await banner.count() === 0, 'the banner is still shown after the update');
  } catch (error) {
    problems.add(error.message);
  } finally {
    await ctx.close();
    server.close();
  }
  return [...problems];
}
