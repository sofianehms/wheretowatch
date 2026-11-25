// Quality gate for a static site: screenshots, no horizontal scroll, axe-core, Lighthouse, console errors.
// Usage: npm run verify        Env: SHOTS_DIR (default .verify/shots), CHROME_PATH (default: auto-detect).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { startServer } from './serve.mjs';
import movieDetails from '../test/fixtures/tmdb/movie-details.js';

const startedAt = performance.now();
const cfg = JSON.parse(fs.readFileSync('verify.config.json', 'utf8'));
// A page is a path string or { "path": "/x.html", "lighthouse": false } (e.g. for the 404 page).
const pages = cfg.pages.map((p) => (typeof p === 'string' ? { path: p, lighthouse: true } : { lighthouse: true, ...p }));
const shotsDir = path.resolve(process.env.SHOTS_DIR || '.verify/shots');
fs.mkdirSync(shotsDir, { recursive: true });

function findChrome() {
  const c = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const found = c.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome/Chromium not found: set CHROME_PATH');
  return found;
}
const chromePath = findChrome();
// Chrome gets a throwaway config/cache home: verify never reads or writes the real browser profile.
const chromeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-chrome-'));
const chromeEnv = { XDG_CONFIG_HOME: chromeHome, XDG_CACHE_HOME: chromeHome };
const sandboxArgs = (typeof process.getuid === 'function' && process.getuid() === 0) || process.env.CI ? ['--no-sandbox'] : [];

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok   ${msg}`);

const statesPath = '/test/states.html';
const isStatesPage = (route) => route.split('?')[0] === statesPath;
const server = await startServer(cfg.root);
const origin = `http://127.0.0.1:${server.address().port}`;
const allowedOrigins = new Set([
  origin,
  'https://api.themoviedb.org',
  'https://image.tmdb.org',
  'https://api.movieofthenight.com',
]);
const browser = await chromium.launch({ executablePath: chromePath, args: sandboxArgs, env: { ...process.env, ...chromeEnv } });

function checkOrigin(url, report) {
  const requestOrigin = new URL(url).origin;
  if (!allowedOrigins.has(requestOrigin)) report(`unauthorized request origin: ${requestOrigin}`);
}

// Fictional artwork named by the state galleries: posters of the search view, service logos of the title view.
const fixtureImages = {
  search: /^https:\/\/image\.tmdb\.org\/t\/p\/w\d+\/(?:poster|p[0-7])\.jpg$/,
  title: /^https:\/\/image\.tmdb\.org\/t\/p\/w45\/logo-\d+\.png$/,
};

async function prepareImageFixtures(ctx, route) {
  for (const [view, pattern] of Object.entries(fixtureImages)) {
    if (route !== `${statesPath}?view=${view}`) continue;
    // Served from a local file: the checks never depend on the image host.
    await ctx.route(pattern, (image) => image.fulfill({ path: 'icons/icon-192.png' }));
  }
}

async function prepareTheme(ctx, preference) {
  await ctx.addInitScript((theme) => {
    if (theme !== null && window === window.top) localStorage.setItem('wtw.theme', theme);
    // Every theme the root ever carries, plus a sample at each early lifecycle point and at first paint.
    const samples = [];
    window.themeSamples = samples;
    const sample = (point) => samples.push({
      point,
      theme: document.documentElement.dataset.theme,
      background: document.body ? getComputedStyle(document.body).backgroundColor : null,
    });
    // Only the page's own load matters: later changes come from scenarios that switch the theme on purpose.
    const watcher = new MutationObserver((records) => {
      for (const r of records) {
        // A value replaced within the same task never reaches a sample, so keep every previous value too.
        if (r.target === document.documentElement && r.oldValue !== null) samples.push({ point: 'replaced theme', theme: r.oldValue, background: null });
      }
      sample('theme change');
    });
    watcher.observe(document, { attributes: true, subtree: true, attributeOldValue: true, attributeFilter: ['data-theme'] });
    new PerformanceObserver((list, observer) => {
      if (list.getEntries().some((entry) => entry.name === 'first-paint')) { sample('first paint'); observer.disconnect(); }
    }).observe({ type: 'paint', buffered: true });
    document.addEventListener('DOMContentLoaded', () => sample('DOMContentLoaded'), { once: true });
    window.addEventListener('load', () => { sample('load'); watcher.disconnect(); }, { once: true });
  }, preference);
}

async function checkTheme(page, theme, scheme, report) {
  const { samples, expectedBackground } = await page.evaluate((expectedScheme) => {
    const root = document.documentElement;
    const currentTheme = root.getAttribute('data-theme');
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--color-bg)';
    root.setAttribute('data-theme', expectedScheme);
    document.body.append(probe);
    const expectedBackground = getComputedStyle(probe).backgroundColor;
    probe.remove();
    if (currentTheme === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', currentTheme);
    return { samples: window.themeSamples ?? [], expectedBackground };
  }, scheme);
  if (!samples.some((s) => s.point === 'first paint')) report('no first paint was observed');
  for (const s of samples) {
    if (s.theme !== theme || (s.background !== null && s.background !== expectedBackground)) {
      report(`at ${s.point}, expected theme ${theme} with ${scheme} background (${expectedBackground}); `
        + `got ${s.theme ?? 'no theme'} with ${s.background ?? 'no body yet'}`);
    }
  }
}

async function checkOverflow(page, width, report) {
  // Mobile emulation can widen innerWidth to fit overflowing content.
  const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, width);
  if (overflow > 0) report(`horizontal scroll (${overflow}px)`);
}

async function checkStates(page, report) {
  const problems = await page.evaluate(() => window.statesReady);
  if (!problems) report('states page did not initialize');
  else problems.forEach(report);
  // Steps that need trusted key presses (native default actions): the page prepares, we press, the page asserts.
  const steps = await page.evaluate(() => window.statesKeySteps?.map((step) => step.keys) ?? []);
  for (const [index, keys] of steps.entries()) {
    await page.evaluate((i) => window.statesRunKeyStep(i, 'before'), index);
    for (const key of keys) await page.keyboard.press(key);
    (await page.evaluate((i) => window.statesRunKeyStep(i, 'after'), index)).forEach(report);
  }
}

async function checkSubpath() {
  const prefix = '/wheretowatch';
  const mountedServer = await startServer(cfg.root, 0, { prefix });
  const mountedOrigin = `http://127.0.0.1:${mountedServer.address().port}`;
  const label = `${prefix}/ subpath`;
  const problems = new Set();
  try {
    const ctx = await browser.newContext();
    try {
      ctx.on('response', (response) => {
        if (response.status() >= 400) problems.add(`HTTP ${response.status()}: ${response.url()}`);
      });
      ctx.on('requestfailed', (request) => problems.add(`request failed: ${request.url()}`));
      const page = await ctx.newPage();
      page.on('console', (message) => {
        if (message.type() === 'error') problems.add(`console error: ${message.text()}`);
      });
      page.on('pageerror', (error) => problems.add(`page error: ${error.message}`));
      await page.goto(mountedOrigin + prefix + '/', { waitUntil: 'networkidle' });
      await page.waitForFunction(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.active?.state === 'activated';
      }, null, { timeout: 5000 });
      const session = await ctx.newCDPSession(page);
      const manifest = await session.send('Page.getAppManifest');
      if (manifest.url !== mountedOrigin + prefix + '/manifest.webmanifest' || !manifest.data) {
        problems.add('manifest did not load');
      }
      for (const error of manifest.errors) {
        if (error.critical) problems.add(`manifest error: ${error.message}`);
      }
    } catch (error) {
      problems.add(error.message);
    } finally {
      await ctx.close();
    }
  } finally {
    mountedServer.close();
  }
  if (problems.size) problems.forEach((problem) => fail(`${label}: ${problem}`));
  else ok(`${label} (console, service worker activated, manifest loaded)`);
}

async function checkTitleLaunch() {
  const label = 'direct title launch';
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const problems = new Set();
  const requests = [];
  try {
    await ctx.addInitScript(() => localStorage.setItem('wtw.key.tmdb', 'fixture-placeholder'));
    await ctx.route('https://api.themoviedb.org/3/**', async (route) => {
      const { pathname } = new URL(route.request().url());
      requests.push(pathname);
      const fixtures = {
        '/3/configuration': {},
        '/3/movie/238': { ...movieDetails, id: 238, poster_path: null },
        '/3/movie/238/watch/providers': { results: {} },
        '/3/watch/providers/regions': { results: [] },
      };
      if (!(pathname in fixtures)) problems.add(`unexpected source request: ${pathname}`);
      await route.fulfill({ json: fixtures[pathname] ?? {} });
    });
    const page = await ctx.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') problems.add(`console error: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.add(`page error: ${error.message}`));
    await page.goto(origin + '/?t=movie/238&q=ignored&keep=yes#main');
    await page.waitForURL(origin + '/?keep=yes#main', { timeout: 5000 });
    await page.getByRole('heading', { name: movieDetails.title, exact: true }).waitFor({ timeout: 5000 });
    const titleRequests = requests.filter((path) => path.startsWith('/3/movie/'));
    if (titleRequests.join() !== '/3/movie/238,/3/movie/238/watch/providers') {
      problems.add('expected one details request followed by one availability request');
    }

    requests.length = 0;
    await page.goto(origin + '/?t=tv/abc', { waitUntil: 'networkidle' });
    if (page.url() !== origin + '/' || await page.locator('#title h1').count()) {
      problems.add('malformed reference did not leave a clean search screen');
    }
    if (requests.some((path) => path !== '/3/configuration')) problems.add('malformed reference requested source data');
  } catch (error) {
    problems.add(error.message);
  } finally {
    await ctx.close();
  }
  if (problems.size) problems.forEach((problem) => fail(`${label}: ${problem}`));
  else ok(`${label} (details, availability, query priority, URL cleanup, invalid reference, console)`);
}

async function checkTextZoom(route) {
  const width = 390;
  const label = `${route} 200% text zoom at ${width}px`;
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const problems = new Set();
  const report = (problem) => problems.add(problem);
  try {
    await ctx.addInitScript(() => {
      function enlargeText() {
        if (!document.documentElement) return;
        document.documentElement.style.fontSize = '200%';
        observer.disconnect();
      }
      const observer = new MutationObserver(enlargeText);
      observer.observe(document, { childList: true });
      enlargeText();
    });
    const page = await ctx.newPage();
    await page.goto(origin + route, { waitUntil: 'networkidle' });
    if (isStatesPage(route)) await checkStates(page, report);
    await checkOverflow(page, width, report);
  } finally {
    await ctx.close();
  }
  if (problems.size) problems.forEach((problem) => fail(`${label}: ${problem}`));
  else ok(`${label} (no horizontal scroll)`);
}

try {
  console.log(`verify: ${pages.length} page(s) x ${cfg.viewports.length} viewport(s) x ${cfg.schemes.length} theme(s)`);
  for (const { path: route } of pages) {
    for (const { preference, system, theme, scheme } of [
      { preference: null, system: 'light', theme: 'dark', scheme: 'dark' },
      { preference: 'light', system: 'dark', theme: 'light', scheme: 'light' },
      { preference: 'auto', system: 'dark', theme: 'auto', scheme: 'dark' },
      { preference: 'auto', system: 'light', theme: 'auto', scheme: 'light' },
    ]) {
      const label = `${route} ${preference ?? 'default first paint'} (system ${system})`;
      const ctx = await browser.newContext({ colorScheme: system });
      const problems = new Set();
      const report = (problem) => problems.add(problem);
      try {
        ctx.on('request', (request) => checkOrigin(request.url(), report));
        await prepareImageFixtures(ctx, route);
        await prepareTheme(ctx, preference);
        const page = await ctx.newPage();
        await page.goto(origin + route, { waitUntil: 'networkidle' });
        await checkTheme(page, theme, scheme, report);
      } finally {
        await ctx.close();
      }
      if (problems.size) problems.forEach((p) => fail(`${label}: ${p}`));
      else ok(label);
    }

    for (const vp of cfg.viewports) {
      for (const scheme of cfg.schemes) {
        const label = `${route} ${vp.name} ${scheme}`;
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height }, colorScheme: scheme === 'dark' ? 'light' : 'dark',
          isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1,
        });
        const problems = new Set();
        const report = (problem) => problems.add(problem);
        ctx.on('request', (request) => checkOrigin(request.url(), report));
        await prepareImageFixtures(ctx, route);
        await prepareTheme(ctx, scheme);
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error') report(`console error: ${m.text()}`); });
        page.on('pageerror', (e) => report(`page error: ${e.message}`));
        page.on('requestfailed', (r) => { if (new URL(r.url()).origin === origin) report(`request failed: ${r.url()}`); });
        const resp = await page.goto(origin + route, { waitUntil: 'networkidle' });
        if (!resp || resp.status() >= 400) report(`HTTP ${resp ? resp.status() : 'none'}`);
        if (isStatesPage(route)) await checkStates(page, report);
        await checkTheme(page, scheme, scheme, report);
        const name = `${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'index'}-${vp.name}-${scheme}.png`;
        await page.screenshot({ path: path.join(shotsDir, name), fullPage: true });
        await checkOverflow(page, vp.width, report);
        // The states gallery stacks many independent screens on one page, so the same landmark names repeat
        // across screens by construction: landmark uniqueness is checked screen by screen, in isolation, and
        // every other rule, at every impact level, applies to the whole page as everywhere else.
        const builder = new AxeBuilder({ page });
        if (isStatesPage(route)) builder.disableRules(['landmark-unique']);
        const axe = await builder.analyze();
        for (const v of axe.violations) {
          report(`axe ${v.impact}: ${v.id} (${v.nodes.length} node(s))`);
        }
        if (isStatesPage(route)) {
          const screens = await page.locator('#scenarios > section').count();
          for (let i = 1; i <= screens; i += 1) {
            const isolated = await new AxeBuilder({ page }).include(`#scenarios > section:nth-child(${i})`).withRules(['landmark-unique']).analyze();
            for (const v of isolated.violations) {
              const name = await page.locator(`#scenarios > section:nth-child(${i}) > h2`).textContent();
              report(`axe ${v.impact}: ${v.id} in "${name}" (${v.nodes.length} node(s))`);
            }
          }
        }
        await ctx.close();
        problems.size ? problems.forEach((p) => fail(`${label}: ${p}`)) : ok(`${label} (theme, origin, axe, layout, console)`);
      }
    }
  }

  await checkSubpath();
  await checkTitleLaunch();
  await checkTextZoom('/');
  await checkTextZoom(pages.find((page) => isStatesPage(page.path)).path);

  const chrome = await chromeLauncher.launch({ chromePath, envVars: chromeEnv, chromeFlags: ['--headless=new', '--disable-gpu', ...sandboxArgs] });
  try {
    for (const { path: route } of pages.filter((p) => p.lighthouse)) {
      const run = await lighthouse(origin + route, { port: chrome.port, output: 'json', logLevel: 'error',
        onlyCategories: Object.keys(cfg.thresholds) });
      const originProblems = new Set();
      for (const { method, params } of run.artifacts.DevtoolsLog) {
        if (method === 'Network.requestWillBeSent') checkOrigin(params.request.url, (problem) => originProblems.add(problem));
      }
      originProblems.forEach((p) => fail(`lighthouse ${route}: ${p}`));
      const scores = Object.fromEntries(Object.entries(run.lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
      const line = Object.entries(scores).map(([k, v]) => `${k} ${v}`).join(', ');
      const low = Object.entries(cfg.thresholds).filter(([k, min]) => scores[k] < min);
      low.length ? fail(`lighthouse ${route}: ${low.map(([k, min]) => `${k} ${scores[k]} < ${min}`).join(', ')}`)
                 : ok(`lighthouse ${route}: ${line}`);
    }
  } finally { await chrome.kill(); }
} finally {
  await browser.close();
  server.close();
  fs.rmSync(chromeHome, { recursive: true, force: true });
  console.log(`Total duration: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
}

console.log(failures.length ? `VERIFY FAILED: ${failures.length} problem(s)` : `VERIFY OK (screenshots in ${shotsDir})`);
process.exit(failures.length ? 1 : 0);
